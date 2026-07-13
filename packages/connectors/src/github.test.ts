import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConnectorAuthError } from "./types";
import { githubConnector } from "./github";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(__dirname, "../fixtures/github");

const viewerFixture = JSON.parse(
  readFileSync(join(fixturesDir, "viewer.json"), "utf-8"),
);
const contributionsFixture = JSON.parse(
  readFileSync(join(fixturesDir, "contributions.json"), "utf-8"),
);

function mockJsonResponse(body: unknown, status = 200): Response {
  const encoded = new TextEncoder().encode(JSON.stringify(body));
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers({
      "content-type": "application/json",
      "content-length": String(encoded.byteLength),
    }),
    json: async () => body,
    body: new ReadableStream({
      start(controller) {
        controller.enqueue(encoded);
        controller.close();
      },
    }),
  } as unknown as Response;
}

describe("githubConnector", () => {
  const creds = { token: "ghp_test_token" };

  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  describe("validate", () => {
    it("returns login and createdAt from viewer query", async () => {
      vi.mocked(fetch).mockResolvedValueOnce(mockJsonResponse(viewerFixture));

      const result = await githubConnector.validate(creds);

      expect(result).toEqual({
        username: "octocat",
        accountCreatedAt: "2011-01-25T18:44:36Z",
      });
      expect(fetch).toHaveBeenCalledWith(
        "https://api.github.com/graphql",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            Authorization: "Bearer ghp_test_token",
            "Content-Type": "application/json",
          }),
          body: expect.stringContaining("viewer"),
        }),
      );
    });

    it("throws ConnectorAuthError on 401", async () => {
      vi.mocked(fetch).mockResolvedValueOnce(
        mockJsonResponse({ message: "Bad credentials" }, 401),
      );

      await expect(githubConnector.validate(creds)).rejects.toThrow(
        ConnectorAuthError,
      );
    });
  });

  describe("backfill", () => {
    it("walks year windows and yields pre-bucketed days from contributionsCollection", async () => {
      vi.mocked(fetch).mockImplementation(async () =>
        mockJsonResponse(contributionsFixture),
      );

      const batches: { date: string; count: number }[][] = [];
      for await (const batch of githubConnector.backfill(
        creds,
        "2020-03-01",
        "2022-09-15",
      )) {
        batches.push(batch);
      }

      expect(batches).toHaveLength(3);
      expect(batches[0]).toEqual([
        { date: "2025-06-01", count: 0 },
        { date: "2025-06-02", count: 3 },
        { date: "2025-06-03", count: 5 },
        { date: "2025-06-04", count: 1 },
        { date: "2025-06-05", count: 0 },
        { date: "2025-06-06", count: 2 },
        { date: "2025-06-07", count: 4 },
        { date: "2025-06-08", count: 6 },
        { date: "2025-06-09", count: 0 },
        { date: "2025-06-10", count: 8 },
        { date: "2025-06-11", count: 2 },
        { date: "2025-06-12", count: 1 },
        { date: "2025-06-13", count: 0 },
        { date: "2025-06-14", count: 7 },
      ]);

      const calls = vi.mocked(fetch).mock.calls;
      expect(calls).toHaveLength(3);

      const bodies = calls.map(([, init]) => JSON.parse(init!.body as string));
      expect(bodies[0].variables).toEqual({
        from: "2020-03-01T00:00:00Z",
        to: "2021-02-28T00:00:00Z",
      });
      expect(bodies[1].variables).toEqual({
        from: "2021-03-01T00:00:00Z",
        to: "2022-02-28T00:00:00Z",
      });
      expect(bodies[2].variables).toEqual({
        from: "2022-03-01T00:00:00Z",
        to: "2022-09-15T00:00:00Z",
      });
    });
  });

  describe("refresh", () => {
    it("returns trailing window of days from UTC today", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2025-06-14T15:30:00Z"));
      vi.mocked(fetch).mockImplementation(async () =>
        mockJsonResponse(contributionsFixture),
      );

      const result = await githubConnector.refresh(creds, 35);

      expect(result).toEqual([
        { date: "2025-06-01", count: 0 },
        { date: "2025-06-02", count: 3 },
        { date: "2025-06-03", count: 5 },
        { date: "2025-06-04", count: 1 },
        { date: "2025-06-05", count: 0 },
        { date: "2025-06-06", count: 2 },
        { date: "2025-06-07", count: 4 },
        { date: "2025-06-08", count: 6 },
        { date: "2025-06-09", count: 0 },
        { date: "2025-06-10", count: 8 },
        { date: "2025-06-11", count: 2 },
        { date: "2025-06-12", count: 1 },
        { date: "2025-06-13", count: 0 },
        { date: "2025-06-14", count: 7 },
      ]);

      const body = JSON.parse(
        vi.mocked(fetch).mock.calls[0][1]!.body as string,
      );
      expect(body.variables).toEqual({
        from: "2025-05-11T00:00:00Z",
        to: "2025-06-14T00:00:00Z",
      });
    });
  });

  describe("baseUrl", () => {
    it("uses custom GraphQL endpoint for GitHub Enterprise", async () => {
      vi.mocked(fetch).mockResolvedValueOnce(mockJsonResponse(viewerFixture));

      await githubConnector.validate({
        token: "ghp_test_token",
        baseUrl: "https://github.example.com",
      });

      expect(fetch).toHaveBeenCalledWith(
        "https://github.example.com/api/graphql",
        expect.any(Object),
      );
    });
  });
});
