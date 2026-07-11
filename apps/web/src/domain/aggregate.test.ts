import { describe, it, expect } from "vitest";
import {
  bucketByTimezone,
  intensityLevel,
  unionActiveDates,
} from "./aggregate";

describe("bucketByTimezone", () => {
  it("buckets by local day in Europe/Zurich, not UTC (DST boundary)", () => {
    // 22:30 UTC on Mar 31 = 00:30 CEST on Apr 1 in Zurich — must not bucket as Mar 31
    const result = bucketByTimezone(
      ["2024-03-31T22:30:00.000Z"],
      "Europe/Zurich",
    );
    expect(result).toEqual([{ date: "2024-04-01", count: 1 }]);
  });

  it("aggregates multiple timestamps on the same local day", () => {
    const result = bucketByTimezone(
      [
        "2024-06-15T08:00:00.000Z",
        "2024-06-15T20:00:00.000Z",
        "2024-06-16T07:00:00.000Z",
      ],
      "Europe/Zurich",
    );
    expect(result).toEqual([
      { date: "2024-06-15", count: 2 },
      { date: "2024-06-16", count: 1 },
    ]);
  });

  it("returns unique dates with zero omitted", () => {
    expect(bucketByTimezone([], "Europe/Zurich")).toEqual([]);
  });
});

describe("intensityLevel", () => {
  it("returns 0 for zero count regardless of distribution", () => {
    expect(intensityLevel(0, [1, 5, 10, 20])).toBe(0);
  });

  it("assigns quartile levels 1–4 based on nonZeroCounts", () => {
    const distribution = [1, 2, 3, 4, 5, 6, 7, 8];
    expect(intensityLevel(1, distribution)).toBe(1);
    expect(intensityLevel(3, distribution)).toBe(2);
    expect(intensityLevel(5, distribution)).toBe(3);
    expect(intensityLevel(8, distribution)).toBe(4);
  });

  it("handles ties at quartile boundaries consistently", () => {
    // Many values tie at 2; q1/q2/q3 collapse to 2
    const distribution = [1, 2, 2, 2, 8];
    expect(intensityLevel(2, distribution)).toBe(1);
    expect(intensityLevel(8, distribution)).toBe(4);
  });
});

describe("unionActiveDates", () => {
  it("unions dates with count > 0 across all layers", () => {
    const layers = [
      [
        { date: "2024-01-01", count: 3 },
        { date: "2024-01-02", count: 0 },
      ],
      [
        { date: "2024-01-02", count: 1 },
        { date: "2024-01-03", count: 5 },
      ],
      [{ date: "2024-01-04", count: 0 }],
    ];
    const result = unionActiveDates(layers);
    expect(result).toEqual(
      new Set(["2024-01-01", "2024-01-02", "2024-01-03"]),
    );
  });

  it("returns empty set when no layer has activity", () => {
    const layers = [
      [{ date: "2024-01-01", count: 0 }],
      [{ date: "2024-01-02", count: 0 }],
    ];
    expect(unionActiveDates(layers)).toEqual(new Set());
  });
});
