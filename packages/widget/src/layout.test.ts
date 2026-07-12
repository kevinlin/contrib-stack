import { describe, it, expect } from "vitest";
import {
  GRID_COLS,
  buildGridLayout,
  computeStats,
  dateToCell,
  gridStartSunday,
  intensityLevel,
  resolveRange,
  splitCellStripes,
  unionActiveDates,
} from "./layout";
import type { Connection } from "./types";

describe("grid layout", () => {
  it("maps leap year 2024 into at most 53 week columns", () => {
    const range = resolveRange("2024", "2024-12-31");
    const layout = buildGridLayout(range);

    expect(gridStartSunday(range.from)).toBe("2023-12-31");
    expect(dateToCell(layout.gridStart, "2024-01-01")).toEqual({ col: 0, row: 1 });
    expect(dateToCell(layout.gridStart, "2024-12-31")).toEqual({ col: 52, row: 2 });

    let maxCol = 0;
    for (const cell of layout.cells.values()) {
      maxCol = Math.max(maxCol, cell.col);
      expect(cell.col).toBeGreaterThanOrEqual(0);
      expect(cell.col).toBeLessThan(GRID_COLS);
      expect(cell.row).toBeGreaterThanOrEqual(0);
      expect(cell.row).toBeLessThan(7);
    }
    expect(maxCol).toBe(52);
    expect(layout.cells.size).toBe(366);
  });

  it("assigns unique row per weekday within a column", () => {
    const range = resolveRange("2024", "2024-06-15");
    const layout = buildGridLayout(range);
    const byCol = new Map<number, Set<number>>();

    for (const cell of layout.cells.values()) {
      const rows = byCol.get(cell.col) ?? new Set();
      rows.add(cell.row);
      byCol.set(cell.col, rows);
    }

    for (const rows of byCol.values()) {
      expect(rows.size).toBe(rows.size);
    }
  });
});

describe("splitCellStripes", () => {
  const cellX = 40;
  const cellY = 20;
  const cellSize = 12;

  it("returns one full-width stripe for a single layer", () => {
    const stripes = splitCellStripes(1, cellX, cellY, cellSize);
    expect(stripes).toEqual([
      { x: 40, y: 20, width: 12, height: 12 },
    ]);
  });

  it("splits into two equal vertical stripes", () => {
    const stripes = splitCellStripes(2, cellX, cellY, cellSize);
    expect(stripes).toHaveLength(2);
    expect(stripes[0]).toEqual({ x: 40, y: 20, width: 6, height: 12 });
    expect(stripes[1]).toEqual({ x: 46, y: 20, width: 6, height: 12 });
    expect(stripes[0].width + stripes[1].width).toBe(cellSize);
  });

  it("splits into three equal vertical stripes", () => {
    const stripes = splitCellStripes(3, cellX, cellY, cellSize);
    expect(stripes).toHaveLength(3);
    expect(stripes[0].x).toBe(40);
    expect(stripes[1].x).toBeCloseTo(44, 5);
    expect(stripes[2].x).toBeCloseTo(48, 5);
    expect(stripes[0].width).toBeCloseTo(4, 5);
    expect(stripes[1].width).toBeCloseTo(4, 5);
    expect(stripes[2].width).toBeCloseTo(4, 5);
    const totalWidth = stripes.reduce((sum, s) => sum + s.width, 0);
    expect(totalWidth).toBeCloseTo(cellSize, 5);
  });
});

describe("intensityLevel", () => {
  it("returns 0 for zero count", () => {
    expect(intensityLevel(0, [1, 5, 10, 20])).toBe(0);
  });

  it("assigns quartile levels 1–4", () => {
    const distribution = [1, 2, 3, 4, 5, 6, 7, 8];
    expect(intensityLevel(1, distribution)).toBe(1);
    expect(intensityLevel(3, distribution)).toBe(2);
    expect(intensityLevel(5, distribution)).toBe(3);
    expect(intensityLevel(8, distribution)).toBe(4);
  });
});

describe("computeStats with visible layers", () => {
  const connections: Connection[] = [
    {
      slug: "github",
      label: "GitHub",
      color: "#2da44e",
      total: 10,
      days: [
        { date: "2026-07-09", count: 2 },
        { date: "2026-07-10", count: 3 },
        { date: "2026-07-11", count: 1 },
      ],
    },
    {
      slug: "gitlab",
      label: "GitLab",
      color: "#fc6d26",
      total: 8,
      days: [
        { date: "2026-07-10", count: 4 },
        { date: "2026-07-11", count: 2 },
      ],
    },
  ];

  const range = { from: "2026-07-01", to: "2026-07-31" };

  it("computes union streaks across all visible connections", () => {
    const all = new Set(["github", "gitlab"]);
    const stats = computeStats(connections, all, range, "2026-07-11");
    expect(stats.currentStreak).toBe(3);
    expect(stats.longestStreak).toBe(3);
    expect(stats.activeDays).toBe(3);
    expect(stats.connectionTotals).toEqual([
      { slug: "github", label: "GitHub", total: 6 },
      { slug: "gitlab", label: "GitLab", total: 6 },
    ]);
  });

  it("recomputes when a layer is toggled off", () => {
    const githubOnly = new Set(["github"]);
    const stats = computeStats(connections, githubOnly, range, "2026-07-11");
    expect(stats.currentStreak).toBe(3);
    expect(stats.activeDays).toBe(3);
    // totals stay range-scoped for every connection so legend counts do not
    // jump when a layer is hidden
    expect(stats.connectionTotals).toEqual([
      { slug: "github", label: "GitHub", total: 6 },
      { slug: "gitlab", label: "GitLab", total: 6 },
    ]);

    const active = unionActiveDates(connections, githubOnly, range);
    expect(active).toEqual(new Set(["2026-07-09", "2026-07-10", "2026-07-11"]));
  });

  it("breaks streak when visible layer has a gap day", () => {
    const gitlabOnly = new Set(["gitlab"]);
    const stats = computeStats(connections, gitlabOnly, range, "2026-07-11");
    expect(stats.currentStreak).toBe(2);
    expect(stats.activeDays).toBe(2);
    expect(stats.connectionTotals[0].total).toBe(6);
  });
});
