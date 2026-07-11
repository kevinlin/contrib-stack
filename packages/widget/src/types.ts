export interface DayCount {
  date: string;
  count: number;
}

export interface Connection {
  slug: string;
  label: string;
  color: string;
  total: number;
  days: DayCount[];
}

export interface ProfileData {
  handle: string;
  years: number[];
  connections: Connection[];
}

export type Theme = "light" | "dark" | "auto";
export type IntensityLevel = 0 | 1 | 2 | 3 | 4;

export interface GridCell {
  col: number;
  row: number;
}

export interface DateRange {
  from: string;
  to: string;
}

export interface GridLayout {
  gridStart: string;
  range: DateRange;
  cells: Map<string, GridCell>;
  monthLabels: Array<{ col: number; label: string }>;
}

export interface DayLayer {
  slug: string;
  label: string;
  color: string;
  count: number;
  level: IntensityLevel;
}

export interface Stats {
  currentStreak: number;
  longestStreak: number;
  activeDays: number;
  connectionTotals: Array<{ slug: string; label: string; total: number }>;
}

export interface RenderState {
  profile: ProfileData;
  layout: GridLayout;
  visibleSlugs: Set<string>;
  stats: Stats;
  nonZeroBySlug: Map<string, number[]>;
  theme: "light" | "dark";
  linkEnabled: boolean;
  profileUrl: string;
}
