import { describe, it, expect } from "vitest";
import { computeStreaks, activeDayCount } from "./streaks";

describe("computeStreaks", () => {
  it("keeps current streak alive when yesterday is active (GitHub convention)", () => {
    const activeDates = new Set(["2024-01-07", "2024-01-08", "2024-01-09"]);
    // today = Jan 10; yesterday (Jan 9) is active, today is not
    expect(computeStreaks(activeDates, "2024-01-10")).toEqual({
      current: 3,
      longest: 3,
    });
  });

  it("breaks current streak when neither today nor yesterday is active", () => {
    const activeDates = new Set(["2024-01-05", "2024-01-06", "2024-01-07"]);
    expect(computeStreaks(activeDates, "2024-01-10")).toEqual({
      current: 0,
      longest: 3,
    });
  });

  it("counts a single-day streak when today is the only active day", () => {
    const activeDates = new Set(["2024-01-10"]);
    expect(computeStreaks(activeDates, "2024-01-10")).toEqual({
      current: 1,
      longest: 1,
    });
  });

  it("returns zero streaks for an empty set", () => {
    expect(computeStreaks(new Set(), "2024-01-10")).toEqual({
      current: 0,
      longest: 0,
    });
  });

  it("extends current streak through today when today is active", () => {
    const activeDates = new Set(["2024-01-08", "2024-01-09", "2024-01-10"]);
    expect(computeStreaks(activeDates, "2024-01-10")).toEqual({
      current: 3,
      longest: 3,
    });
  });

  it("reports longest streak across non-contiguous runs", () => {
    const activeDates = new Set([
      "2024-01-01",
      "2024-01-02",
      "2024-01-05",
      "2024-01-06",
      "2024-01-07",
      "2024-01-08",
      "2024-01-09",
    ]);
    expect(computeStreaks(activeDates, "2024-01-10")).toEqual({
      current: 5,
      longest: 5,
    });
  });
});

describe("activeDayCount", () => {
  it("counts all active dates when no year filter", () => {
    const activeDates = new Set(["2023-12-31", "2024-01-01", "2024-06-15"]);
    expect(activeDayCount(activeDates)).toBe(3);
  });

  it("filters to a specific year", () => {
    const activeDates = new Set(["2023-12-31", "2024-01-01", "2024-06-15"]);
    expect(activeDayCount(activeDates, 2024)).toBe(2);
  });

  it("returns 0 for empty set", () => {
    expect(activeDayCount(new Set())).toBe(0);
  });
});
