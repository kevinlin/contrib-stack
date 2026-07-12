import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/font/google", () => ({
  Geist: () => ({ variable: "font-sans" }),
  Geist_Mono: () => ({ variable: "font-mono" }),
}));
import RootLayout, { metadata } from "./layout";
import Home from "./page";

describe("production homepage", () => {
  it("presents ContribStack with working entry points", () => {
    const html = renderToStaticMarkup(<Home />);

    expect(html).toContain("ContribStack");
    expect(html).toContain(
      'href="/api/auth/signin?callbackUrl=/welcome"',
    );
    expect(html).toContain('href="/kevinlin"');
  });

  it("uses ContribStack metadata", () => {
    expect(metadata.title).toBe("ContribStack");
    expect(metadata.description).toContain("developer activity");
  });

  it("keeps the root layout renderable", () => {
    const html = renderToStaticMarkup(
      <RootLayout>
        <Home />
      </RootLayout>,
    );

    expect(html).toContain("ContribStack");
  });
});
