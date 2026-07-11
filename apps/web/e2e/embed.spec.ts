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
    await expect(widget.locator(".cs-legend .cs-chip").first()).toBeVisible({
      timeout: 15_000,
    });

    const isolation = await widget.evaluate((el) => {
      const shadow = el.shadowRoot;
      if (!shadow) {
        return null;
      }

      const legend = shadow.querySelector(".cs-legend");
      const styleTag = shadow.querySelector("style");
      const legendInLightDom = el.querySelector(".cs-legend");

      return {
        mode: shadow.mode,
        legendInShadow: legend !== null,
        legendInLightDom: legendInLightDom !== null,
        hasInternalStyles:
          styleTag !== null && styleTag.textContent?.includes("--cs-text") === true,
        chipBackground: legend
          ? getComputedStyle(legend.querySelector(".cs-chip")!).backgroundColor
          : null,
      };
    });

    expect(isolation).not.toBeNull();
    expect(isolation!.mode).toBe("open");
    expect(isolation!.legendInShadow).toBe(true);
    expect(isolation!.legendInLightDom).toBe(false);
    expect(isolation!.hasInternalStyles).toBe(true);
    expect(isolation!.chipBackground).not.toBe("");
  });
});
