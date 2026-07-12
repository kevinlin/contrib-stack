import { describe, it, expect } from "vitest";
import {
  buildGridLayout,
  computeStats,
  nonZeroCountsBySlug,
  resolveRange,
} from "./layout";
import {
  renderEmptyState,
  renderSkeleton,
  renderWidget,
  tooltipText,
} from "./render";
import type { Connection, RenderState } from "./types";

function makeState(
  connections: Connection[],
  visibleSlugs: Set<string>,
  range = "2026-07-01",
): RenderState {
  const dateRange = resolveRange(range, "2026-07-11");
  const layout = buildGridLayout(dateRange);
  const nonZeroBySlug = nonZeroCountsBySlug(connections);
  const stats = computeStats(connections, visibleSlugs, dateRange, "2026-07-11");
  return {
    profile: { handle: "test", years: [2026], connections },
    layout,
    visibleSlugs,
    stats,
    nonZeroBySlug,
    theme: "light",
    linkEnabled: true,
    profileUrl: "https://contribstack.app/test",
  };
}

const connections: Connection[] = [
  {
    slug: "github",
    label: "GitHub",
    color: "#2da44e",
    total: 5,
    days: [{ date: "2026-07-11", count: 5 }],
  },
  {
    slug: "gitlab",
    label: "GitLab",
    color: "#fc6d26",
    total: 3,
    days: [{ date: "2026-07-11", count: 3 }],
  },
];

describe("renderWidget", () => {
  it("renders split-cell stripes for multiple layers on one day", () => {
    const state = makeState(connections, new Set(["github", "gitlab"]));
    const html = renderWidget(state);
    const rects = [...html.matchAll(/<rect[^>]*>/g)].map((m) => m[0]);
    const stripeRects = rects.filter(
      (r) => r.includes('fill="#2da44e"') || r.includes('fill="#fc6d26"'),
    );
    expect(stripeRects.length).toBeGreaterThanOrEqual(2);
    expect(html).toContain('class="cs-cell');
    expect(html).toContain("GitHub");
    expect(html).toContain("GitLab");
  });

  it("renders a single full cell for one active layer", () => {
    const state = makeState(
      [connections[0]],
      new Set(["github"]),
      "2026",
    );
    const html = renderWidget(state);
    expect(html).toContain('fill="#2da44e"');
    expect(html).not.toContain('fill="#fc6d26"');
  });

  it("updates stat tiles when a layer is hidden", () => {
    const all = makeState(connections, new Set(["github", "gitlab"]));
    const githubOnly = makeState(connections, new Set(["github"]));

    const allHtml = renderWidget(all);
    const oneHtml = renderWidget(githubOnly);

    expect(allHtml).toContain("Active days");
    expect(all.stats.activeDays).toBe(1);
    expect(githubOnly.stats.activeDays).toBe(1);
    expect(all.stats.connectionTotals).toHaveLength(2);
    expect(githubOnly.stats.connectionTotals).toHaveLength(2);
    expect(oneHtml).toContain('data-slug="gitlab"');
    expect(oneHtml).toContain("cs-chip off");
    expect(allHtml).not.toContain("cs-chip off");
    expect(allHtml).toContain('cs-tile-lbl">GitLab</div>');
    expect(oneHtml).not.toContain('cs-tile-lbl">GitLab</div>');
    expect(allHtml).toContain(">5<");
    expect(oneHtml).toContain(">5<");
  });

  it("marks today's cell and emits structured tooltip data", () => {
    const state = makeState(connections, new Set(["github", "gitlab"]));
    state.today = "2026-07-11";
    const html = renderWidget(state);
    expect(html).toContain("cs-today");
    expect(html).toContain("data-tipr=");
    expect(html).toContain("#2da44e");
    expect(html).toContain('class="cs-oline"');
  });

  it("omits today marker when today is outside the grid", () => {
    const state = makeState(connections, new Set(["github"]));
    state.today = "2030-01-01";
    const html = renderWidget(state);
    expect(html).not.toContain("cs-today");
  });

  it("reflects layer visibility as aria-pressed on legend chips", () => {
    const html = renderWidget(makeState(connections, new Set(["github"])));
    expect(html).toContain('data-slug="github" aria-pressed="true"');
    expect(html).toContain('data-slug="gitlab" aria-pressed="false"');
  });

  it("formats large totals with thousands separators", () => {
    const big: Connection[] = [
      {
        slug: "github",
        label: "GitHub",
        color: "#2da44e",
        total: 1234,
        days: [{ date: "2026-07-11", count: 1234 }],
      },
    ];
    const html = renderWidget(makeState(big, new Set(["github"])));
    expect(html).toContain(">1,234<");
  });
});

describe("renderEmptyState", () => {
  it("renders a ghost grid with the message", () => {
    const html = renderEmptyState("No contribution activity yet");
    expect(html).toContain("cs-skel-p");
    expect(html).toContain("cs-empty-msg");
    expect(html).toContain("No contribution activity yet");
  });
});

describe("renderSkeleton", () => {
  it("renders ghost tiles, chips, and grid", () => {
    const html = renderSkeleton();
    expect(html).toContain("cs-skel");
    expect(html).toContain("cs-bone-val");
    expect(html).toContain("cs-skel-p");
    expect(html).toContain('role="status"');
  });
});

describe("tooltipText", () => {
  it("formats date and per-connection counts", () => {
    const text = tooltipText("2026-07-11", [
      {
        slug: "github",
        label: "GitHub",
        color: "#2da44e",
        count: 5,
        level: 4,
      },
      {
        slug: "gitlab",
        label: "GitLab",
        color: "#fc6d26",
        count: 3,
        level: 3,
      },
    ]);
    expect(text).toContain("Jul 11, 2026");
    expect(text).toContain("GitHub: 5");
    expect(text).toContain("GitLab: 3");
  });
});
