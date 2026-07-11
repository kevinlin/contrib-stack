import type { DayCount } from "./types";

export type { DayCount } from "./types";

const dayFormatterCache = new Map<string, Intl.DateTimeFormat>();

function dayFormatter(tz: string): Intl.DateTimeFormat {
  let formatter = dayFormatterCache.get(tz);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    dayFormatterCache.set(tz, formatter);
  }
  return formatter;
}

export function bucketByTimezone(
  timestampsIso: string[],
  tz: string,
): DayCount[] {
  const counts = new Map<string, number>();
  const formatter = dayFormatter(tz);

  for (const iso of timestampsIso) {
    const date = formatter.format(new Date(iso));
    counts.set(date, (counts.get(date) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) {
    return 0;
  }
  if (sorted.length === 1) {
    return sorted[0];
  }

  const index = (sorted.length - 1) * p;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);

  if (lower === upper) {
    return sorted[lower];
  }

  const weight = index - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

export function intensityLevel(
  count: number,
  nonZeroCounts: number[],
): 0 | 1 | 2 | 3 | 4 {
  if (count === 0) {
    return 0;
  }

  const sorted = [...nonZeroCounts].sort((a, b) => a - b);
  const q1 = percentile(sorted, 0.25);
  const q2 = percentile(sorted, 0.5);
  const q3 = percentile(sorted, 0.75);

  if (count <= q1) return 1;
  if (count <= q2) return 2;
  if (count <= q3) return 3;
  return 4;
}

export function unionActiveDates(layers: DayCount[][]): Set<string> {
  const dates = new Set<string>();

  for (const layer of layers) {
    for (const { date, count } of layer) {
      if (count > 0) {
        dates.add(date);
      }
    }
  }

  return dates;
}
