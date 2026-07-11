import { expect, test } from "@playwright/test";

test.describe("embed test page", () => {
  test("renders widget instances", async ({ page }) => {
    await page.goto("/embed-test.html");

    const widgets = page.locator("contrib-stack");
    await expect(widgets).toHaveCount(2);
    await expect(widgets.first().locator(".cs-legend .cs-chip")).toHaveCount(
      3,
      { timeout: 15_000 },
    );
    await expect(widgets.nth(1).locator(".cs-legend .cs-chip")).toHaveCount(1, {
      timeout: 15_000,
    });
    await expect(widgets.first().locator("svg")).toBeVisible();
  });

  test("host CSS does not leak into widget shadow DOM", async ({ page }) => {
    await page.goto("/embed-test.html");

    const widget = page.locator("contrib-stack").first();
    await expect(widget.locator(".cs-tile-val")).toBeVisible({ timeout: 15_000 });

    const styles = await widget.evaluate((el) => {
      const tileVal = el.shadowRoot?.querySelector(".cs-tile-val");
      const tileLbl = el.shadowRoot?.querySelector(".cs-tile-lbl");
      if (!tileVal || !tileLbl) {
        return null;
      }
      const valStyle = getComputedStyle(tileVal);
      const lblStyle = getComputedStyle(tileLbl);
      return {
        color: valStyle.color,
        fontFamily: lblStyle.fontFamily,
      };
    });

    expect(styles).not.toBeNull();
    expect(styles!.color).not.toBe("rgb(255, 0, 0)");
    expect(styles!.fontFamily.toLowerCase()).not.toContain("comic sans");
    expect(styles!.fontFamily.toLowerCase()).toContain("system-ui");
  });
});
