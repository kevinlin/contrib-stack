import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConnectorAuthError } from "./types";
import { makeGitlabConnector } from "./gitlab";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(__dirname, "../fixtures/gitlab");

const userFixture = JSON.parse(
  readFileSync(join(fixturesDir, "user.json"), "utf-8"),
);
const eventsPage1 = JSON.parse(
  readFileSync(join(fixturesDir, "events-page1.json"), "utf-8"),
);
const eventsPage2 = JSON.parse(
  readFileSync(join(fixturesDir, "events-page2.json"), "utf-8"),
);
const eventsPage3 = JSON.parse(
  readFileSync(join(fixturesDir, "events-page3.json"), "utf-8"),
);

function mockJsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

describe("makeGitlabConnector", () => {
  const creds = { token: "glpat_test_token" };
  const connector = makeGitlabConnector("Europe/Zurich");

  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  describe("validate", () => {
    it("returns username and created_at from GET /user", async () => {
      vi.mocked(fetch).mockResolvedValueOnce(mockJsonResponse(userFixture));

      const result = await connector.validate(creds);

      expect(result).toEqual({
        username: "gitlabuser",
        accountCreatedAt: "2020-01-15T10:00:00.000Z",
      });
      expect(fetch).toHaveBeenCalledWith(
        "https://gitlab.com/api/v4/user",
        expect.objectContaining({
          headers: expect.objectContaining({
            "PRIVATE-TOKEN": "glpat_test_token",
          }),
        }),
      );
    });

    it("throws ConnectorAuthError on 401", async () => {
      vi.mocked(fetch).mockResolvedValueOnce(
        mockJsonResponse({ message: "401 Unauthorized" }, 401),
      );

      await expect(connector.validate(creds)).rejects.toThrow(
        ConnectorAuthError,
      );
    });
  });

  describe("backfill", () => {
    it("pages events across year windows and buckets by timezone", async () => {
      vi.mocked(fetch).mockImplementation(async (url: string | URL) => {
        const href = url.toString();

        if (href.endsWith("/api/v4/user")) {
          return mockJsonResponse(userFixture);
        }

        const page = new URL(href).searchParams.get("page") ?? "1";
        const after = new URL(href).searchParams.get("after");
        const before = new URL(href).searchParams.get("before");

        if (after === "2020-03-01" && before === "2021-02-28") {
          if (page === "1") return mockJsonResponse(eventsPage1);
          if (page === "2") return mockJsonResponse(eventsPage2);
          if (page === "3") return mockJsonResponse(eventsPage3);
          return mockJsonResponse([]);
        }

        return mockJsonResponse([]);
      });

      const batches: { date: string; count: number }[][] = [];
      for await (const batch of connector.backfill(
        creds,
        "2020-03-01",
        "2022-09-15",
      )) {
        batches.push(batch);
      }

      expect(batches).toHaveLength(3);
      expect(batches[0]).toEqual([
        { date: "2024-04-01", count: 1 },
        { date: "2024-06-15", count: 2 },
        { date: "2024-06-16", count: 1 },
        { date: "2024-07-01", count: 1 },
        { date: "2024-08-20", count: 1 },
        { date: "2025-06-14", count: 1 },
      ]);
      expect(batches[1]).toEqual([]);
      expect(batches[2]).toEqual([]);

      const eventCalls = vi
        .mocked(fetch)
        .mock.calls.filter(([url]) =>
          url.toString().includes("/users/12345/events"),
        );
      expect(eventCalls).toHaveLength(6);

      const firstWindowUrls = eventCalls.slice(0, 4).map(([url]) => url);
      expect(firstWindowUrls[0].toString()).toContain("after=2020-03-01");
      expect(firstWindowUrls[0].toString()).toContain("before=2021-02-28");
      expect(firstWindowUrls[0].toString()).toContain("page=1");
      expect(firstWindowUrls[1].toString()).toContain("page=2");
      expect(firstWindowUrls[2].toString()).toContain("page=3");
      expect(firstWindowUrls[3].toString()).toContain("page=4");
    });
  });

  describe("refresh", () => {
    it("returns trailing window of days bucketed by timezone", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2025-06-14T15:30:00Z"));

      vi.mocked(fetch).mockImplementation(async (url: string | URL) => {
        const href = url.toString();
        if (href.endsWith("/api/v4/user")) {
          return mockJsonResponse(userFixture);
        }
        const page = new URL(href).searchParams.get("page") ?? "1";
        if (page === "1") {
          return mockJsonResponse([
            {
              id: 7,
              action_name: "pushed to",
              created_at: "2025-06-14T02:00:00.000Z",
            },
          ]);
        }
        return mockJsonResponse([]);
      });

      const result = await connector.refresh(creds, 35);

      expect(result).toEqual([{ date: "2025-06-14", count: 1 }]);

      const eventUrl = vi
        .mocked(fetch)
        .mock.calls.find(([url]) =>
          url.toString().includes("/users/12345/events"),
        )![0]
        .toString();
      expect(eventUrl).toContain("after=2025-05-11");
      expect(eventUrl).toContain("before=2025-06-14");
      expect(eventUrl).toContain("per_page=100");
    });
  });

  describe("baseUrl", () => {
    it("uses custom API base for self-managed GitLab", async () => {
      vi.mocked(fetch).mockResolvedValueOnce(mockJsonResponse(userFixture));

      await connector.validate({
        token: "glpat_test_token",
        baseUrl: "https://gitlab.example.com",
      });

      expect(fetch).toHaveBeenCalledWith(
        "https://gitlab.example.com/api/v4/user",
        expect.any(Object),
      );
    });
  });
});
