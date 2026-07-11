import { expect, test } from "@playwright/test";
import { loadFixtures } from "./seed";

const fixtures = loadFixtures();

async function waitForWidget(page: import("@playwright/test").Page) {
  const widget = page.locator("contrib-stack").first();
  await expect(widget).toBeVisible();
  await expect(widget.locator(".cs-legend .cs-chip")).toHaveCount(3, {
    timeout: 15_000,
  });
}

test.describe("profile page", () => {
  test("renders heatmap with three legend chips", async ({ page }) => {
    await page.goto(`/${fixtures.handle}`);
    await waitForWidget(page);

    await expect(page.locator("contrib-stack .cs-chip")).toHaveCount(3);
    await expect(page.getByRole("button", { name: /GitHub/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /GitLab/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /Ingest/ })).toBeVisible();
    await expect(page.locator("contrib-stack svg")).toBeVisible();
  });

  test("chip toggle hides a layer", async ({ page }) => {
    await page.goto(`/${fixtures.handle}`);
    await waitForWidget(page);

    const githubChip = page.locator(
      `contrib-stack button.cs-chip[data-slug="${fixtures.connectionSlugs.github}"]`,
    );
    await expect(githubChip).not.toHaveClass(/off/);

    const githubTileBefore = page.locator(
      'contrib-stack .cs-tile:has(.cs-tile-lbl:text("GitHub")) .cs-tile-val',
    );
    await expect(githubTileBefore).toBeVisible();
    const totalBefore = await githubTileBefore.textContent();

    await githubChip.click();
    await expect(githubChip).toHaveClass(/off/);
    await expect(githubTileBefore).toHaveCount(0);

    const visibleChips = page.locator("contrib-stack button.cs-chip:not(.off)");
    await expect(visibleChips).toHaveCount(2);

    await githubChip.click();
    await expect(githubChip).not.toHaveClass(/off/);
    await expect(githubTileBefore).toHaveText(totalBefore ?? "");
  });

  test("year navigation swaps displayed data", async ({ page }) => {
    await page.goto(`/${fixtures.handle}`);
    await waitForWidget(page);

    const githubTile = page.locator(
      'contrib-stack .cs-tile:has(.cs-tile-lbl:text("GitHub")) .cs-tile-val',
    );
    const rollingTotal = await githubTile.textContent();

    await page.getByRole("link", { name: "2025" }).click();
    await page.waitForURL(`**/${fixtures.handle}?year=2025`);
    await waitForWidget(page);

    const year2025Total = await githubTile.textContent();
    expect(year2025Total).not.toBe(rollingTotal);

    await page.getByRole("link", { name: "Rolling year" }).click();
    await page.waitForURL(`**/${fixtures.handle}`);
    await waitForWidget(page);
    await expect(githubTile).toHaveText(rollingTotal ?? "");
  });
});
