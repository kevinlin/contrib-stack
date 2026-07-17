export const HISTORY_YEARS = 10;

export function historyStart(today: string): string {
  const year = Number(today.slice(0, 4)) - (HISTORY_YEARS - 1);
  return `${year}-01-01`;
}

function parseDate(date: string): Date {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(date: string, days: number): string {
  const next = parseDate(date);
  next.setUTCDate(next.getUTCDate() + days);
  return formatDate(next);
}

function addYears(date: string, years: number): string {
  const [year, month, day] = date.split("-").map(Number);
  return formatDate(new Date(Date.UTC(year + years, month - 1, day)));
}

export function yearWindows(
  fromIso: string,
  toIso: string,
): { from: string; to: string }[] {
  const windows: { from: string; to: string }[] = [];
  let cursor = fromIso;

  while (cursor <= toIso) {
    const windowEnd = addDays(addYears(cursor, 1), -1);
    const to = windowEnd < toIso ? windowEnd : toIso;
    windows.push({ from: cursor, to });
    cursor = addDays(to, 1);
  }

  return windows;
}
