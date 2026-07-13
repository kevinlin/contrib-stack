import { expect, test } from "@playwright/test";
import { loadFixtures } from "./seed";

const fixtures = loadFixtures();

function sessionCookie(token: string) {
  return {
    name: "authjs.session-token",
    value: token,
    domain: "localhost",
    path: "/",
  };
}

test.describe("settings page", () => {
  test("unauthenticated request redirects to sign-in", async ({ page }) => {
    await page.goto("/settings");
    await page.waitForURL("**/api/auth/signin**");
    expect(page.url()).toContain("callbackUrl");
  });

  test("pending-handle session redirects to /welcome", async ({ context, page }) => {
    await context.addCookies([sessionCookie(fixtures.pendingSessionToken)]);
    await page.goto("/settings");
    await page.waitForURL("**/welcome**");
  });

  test("authenticated user sees account bar and connections", async ({
    context,
    page,
  }) => {
    await context.addCookies([sessionCookie(fixtures.sessionToken)]);
    await page.goto("/settings");

    await expect(page.getByText(`@${fixtures.handle}`)).toBeVisible();
    await expect(
      page.getByRole("link", { name: "View profile" }),
    ).toHaveAttribute("href", `/${fixtures.handle}`);

    const cards = page.locator('[class*="connectionCard"]');
    await expect(cards).toHaveCount(3);
  });

  test("add and delete ingest connection", async ({ context, page }) => {
    await context.addCookies([sessionCookie(fixtures.sessionToken)]);
    await page.goto("/settings");

    const cards = page.locator('[class*="connectionCard"]');
    await expect(cards).toHaveCount(3);

    await page.getByRole("combobox").selectOption("ingest");
    await page.getByRole("textbox", { name: "Label" }).fill("E2E Test Ingest");
    await page.getByRole("button", { name: "Add connection" }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    const apiKey = await dialog.locator("code").textContent();
    expect(apiKey).toMatch(/^csk_/);
    await dialog.getByRole("button", { name: "Done" }).click();

    await expect(cards).toHaveCount(4);

    const newCard = cards.filter({ hasText: "E2E Test Ingest" });
    page.once("dialog", (d) => d.accept());
    await newCard.getByRole("button", { name: "Delete" }).click();

    await expect(cards).toHaveCount(3);
  });

  test("sign out destroys session", async ({ context, page }) => {
    await context.addCookies([sessionCookie(fixtures.sessionToken)]);
    await page.goto("/settings");

    await expect(page.getByText(`@${fixtures.handle}`)).toBeVisible();
    await page.getByRole("button", { name: "Sign out" }).click();

    await page.waitForURL("/");

    await page.goto("/settings");
    await page.waitForURL("**/api/auth/signin**");
  });
});
