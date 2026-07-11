import type {
  Connection,
  DateRange,
  DayLayer,
  GridCell,
  GridLayout,
  IntensityLevel,
  Stats,
} from "./types";

export const CELL_SIZE = 12;
export const CELL_GAP = 3;
export const GRID_COLS = 53;
export const GRID_ROWS = 7;
export const CELL_STEP = CELL_SIZE + CELL_GAP;

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function parseDate(date: string): Date {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDays(date: string, days: number): string {
  const next = parseDate(date);
  next.setUTCDate(next.getUTCDate() + days);
  return formatDate(next);
}

function daysBetween(from: string, to: string): number {
  const start = parseDate(from).getTime();
  const end = parseDate(to).getTime();
  return Math.round((end - start) / 86_400_000);
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function resolveRange(range: string, today = todayIso()): DateRange {
  if (range === "all") {
    return { from: "1970-01-01", to: today };
  }
  if (range === "1y") {
    return { from: addDays(today, -364), to: today };
  }
  const year = Number(range);
  if (Number.isInteger(year) && year >= 1970) {
    return { from: `${year}-01-01`, to: `${year}-12-31` };
  }
  return { from: addDays(today, -364), to: today };
}

export function gridStartSunday(from: string): string {
  const day = parseDate(from).getUTCDay();
  return addDays(from, -day);
}

export function dateToCell(gridStart: string, date: string): GridCell {
  const offset = daysBetween(gridStart, date);
  return {
    col: Math.floor(offset / 7),
    row: parseDate(date).getUTCDay(),
  };
}

export function cellPosition(col: number, row: number, originX = 0, originY = 0) {
  return {
    x: originX + col * CELL_STEP,
    y: originY + row * CELL_STEP,
  };
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0];
  const index = (sorted.length - 1) * p;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  const weight = index - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

export function intensityLevel(
  count: number,
  nonZeroCounts: number[],
): IntensityLevel {
  if (count === 0) return 0;
  const sorted = [...nonZeroCounts].sort((a, b) => a - b);
  const q1 = percentile(sorted, 0.25);
  const q2 = percentile(sorted, 0.5);
  const q3 = percentile(sorted, 0.75);
  if (count <= q1) return 1;
  if (count <= q2) return 2;
  if (count <= q3) return 3;
  return 4;
}

export const INTENSITY_OPACITY: Record<IntensityLevel, number> = {
  0: 0,
  1: 0.2,
  2: 0.4,
  3: 0.6,
  4: 0.8,
};

export function splitCellStripes(
  layerCount: number,
  cellX: number,
  cellY: number,
  cellSize = CELL_SIZE,
): Array<{ x: number; y: number; width: number; height: number }> {
  if (layerCount <= 0) return [];
  const stripeWidth = cellSize / layerCount;
  const stripes = [];
  for (let i = 0; i < layerCount; i++) {
    stripes.push({
      x: cellX + i * stripeWidth,
      y: cellY,
      width: stripeWidth,
      height: cellSize,
    });
  }
  return stripes;
}

export function buildGridLayout(range: DateRange): GridLayout {
  const gridStart = gridStartSunday(range.from);
  const cells = new Map<string, GridCell>();
  let cursor = range.from;
  while (cursor <= range.to) {
    cells.set(cursor, dateToCell(gridStart, cursor));
    cursor = addDays(cursor, 1);
  }

  const monthLabels: Array<{ col: number; label: string }> = [];
  let lastMonth = -1;
  cursor = range.from;
  while (cursor <= range.to) {
    const month = parseDate(cursor).getUTCMonth();
    const { col } = dateToCell(gridStart, cursor);
    if (month !== lastMonth && col < GRID_COLS) {
      monthLabels.push({ col, label: MONTHS[month] });
      lastMonth = month;
    }
    cursor = addDays(cursor, 1);
  }

  return { gridStart, range, cells, monthLabels };
}

export function nonZeroCountsBySlug(
  connections: Connection[],
): Map<string, number[]> {
  const map = new Map<string, number[]>();
  for (const conn of connections) {
    map.set(
      conn.slug,
      conn.days.filter((d) => d.count > 0).map((d) => d.count),
    );
  }
  return map;
}

export function countForDate(
  connection: Connection,
  date: string,
): number {
  for (const day of connection.days) {
    if (day.date === date) return day.count;
  }
  return 0;
}

export function dayLayers(
  connections: Connection[],
  visibleSlugs: Set<string>,
  date: string,
  nonZeroBySlug: Map<string, number[]>,
): DayLayer[] {
  const layers: DayLayer[] = [];
  for (const conn of connections) {
    if (!visibleSlugs.has(conn.slug)) continue;
    const count = countForDate(conn, date);
    if (count <= 0) continue;
    layers.push({
      slug: conn.slug,
      label: conn.label,
      color: conn.color,
      count,
      level: intensityLevel(count, nonZeroBySlug.get(conn.slug) ?? []),
    });
  }
  return layers;
}

function previousDay(date: string): string {
  return addDays(date, -1);
}

function longestConsecutiveRun(activeDates: Set<string>): number {
  if (activeDates.size === 0) return 0;
  const sorted = [...activeDates].sort();
  let longest = 1;
  let current = 1;
  for (let i = 1; i < sorted.length; i++) {
    if (addDays(sorted[i - 1], 1) === sorted[i]) {
      current += 1;
      longest = Math.max(longest, current);
    } else {
      current = 1;
    }
  }
  return longest;
}

function currentStreak(activeDates: Set<string>, today: string): number {
  const yesterday = previousDay(today);
  const anchor = activeDates.has(today)
    ? today
    : activeDates.has(yesterday)
      ? yesterday
      : null;
  if (anchor === null) return 0;
  let streak = 0;
  let cursor = anchor;
  while (activeDates.has(cursor)) {
    streak += 1;
    cursor = previousDay(cursor);
  }
  return streak;
}

export function unionActiveDates(
  connections: Connection[],
  visibleSlugs: Set<string>,
  range: DateRange,
): Set<string> {
  const dates = new Set<string>();
  for (const conn of connections) {
    if (!visibleSlugs.has(conn.slug)) continue;
    for (const day of conn.days) {
      if (
        day.count > 0 &&
        day.date >= range.from &&
        day.date <= range.to
      ) {
        dates.add(day.date);
      }
    }
  }
  return dates;
}

export function computeStats(
  connections: Connection[],
  visibleSlugs: Set<string>,
  range: DateRange,
  today = todayIso(),
): Stats {
  const activeDates = unionActiveDates(connections, visibleSlugs, range);
  const connectionTotals = connections
    .filter((c) => visibleSlugs.has(c.slug))
    .map((c) => {
      let total = 0;
      for (const day of c.days) {
        if (day.date >= range.from && day.date <= range.to) {
          total += day.count;
        }
      }
      return { slug: c.slug, label: c.label, total };
    });

  return {
    currentStreak: currentStreak(activeDates, today),
    longestStreak: longestConsecutiveRun(activeDates),
    activeDays: activeDates.size,
    connectionTotals,
  };
}

export function gridPixelSize(originX: number, originY: number) {
  return {
    width: originX + GRID_COLS * CELL_STEP - CELL_GAP,
    height: originY + GRID_ROWS * CELL_STEP - CELL_GAP,
  };
}
