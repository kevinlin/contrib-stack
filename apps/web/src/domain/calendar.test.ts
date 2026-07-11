import { describe, it, expect } from "vitest";
import { yearWindows } from "./calendar";

describe("yearWindows", () => {
  it("splits a multi-year span into ≤1-year chunks with exact boundaries and no overlap", () => {
    const windows = yearWindows("2020-03-01", "2022-09-15");
    expect(windows).toEqual([
      { from: "2020-03-01", to: "2021-02-28" },
      { from: "2021-03-01", to: "2022-02-28" },
      { from: "2022-03-01", to: "2022-09-15" },
    ]);
  });

  it("returns a single window when range fits within one year", () => {
    expect(yearWindows("2024-01-15", "2024-12-31")).toEqual([
      { from: "2024-01-15", to: "2024-12-31" },
    ]);
  });

  it("returns a single day when from equals to", () => {
    expect(yearWindows("2024-06-01", "2024-06-01")).toEqual([
      { from: "2024-06-01", to: "2024-06-01" },
    ]);
  });

  it("covers the full range with contiguous windows", () => {
    const from = "2019-07-04";
    const to = "2021-01-01";
    const windows = yearWindows(from, to);

    expect(windows[0].from).toBe(from);
    expect(windows[windows.length - 1].to).toBe(to);

    for (let i = 1; i < windows.length; i++) {
      const prevEnd = windows[i - 1].to;
      const [y, m, d] = prevEnd.split("-").map(Number);
      const nextStart = new Date(Date.UTC(y, m - 1, d + 1))
        .toISOString()
        .slice(0, 10);
      expect(windows[i].from).toBe(nextStart);
    }
  });
});
