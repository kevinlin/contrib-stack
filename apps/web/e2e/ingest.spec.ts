import { expect, test } from "@playwright/test";
import { loadFixtures } from "./seed";

const fixtures = loadFixtures();

test.describe("ingest API", () => {
  test("POST with seeded key updates counts visible on profile reload", async ({
    page,
    request,
  }) => {
    const ingestDate = "2026-07-11";
    const ingestCount = 42;

    const res = await request.post("/api/ingest", {
      headers: {
        Authorization: `Bearer ${fixtures.apiKey}`,
        "Content-Type": "application/json",
      },
      data: [{ date: ingestDate, count: ingestCount }],
    });

    expect(res.status()).toBe(200);
    expect(await res.json()).toEqual({ upserted: 1 });

    await page.goto(`/${fixtures.handle}?year=2026`);
    const ingestChip = page.locator(
      `contrib-stack button.cs-chip[data-slug="${fixtures.connectionSlugs.ingest}"]`,
    );
    await expect(ingestChip).toBeVisible({ timeout: 15_000 });
    await expect(ingestChip).toContainText(String(ingestCount));
  });
});
