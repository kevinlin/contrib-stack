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

function previousDay(date: string): string {
  return addDays(date, -1);
}

function longestConsecutiveRun(activeDates: Set<string>): number {
  if (activeDates.size === 0) {
    return 0;
  }

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

  if (anchor === null) {
    return 0;
  }

  let streak = 0;
  let cursor = anchor;

  while (activeDates.has(cursor)) {
    streak += 1;
    cursor = previousDay(cursor);
  }

  return streak;
}

export function computeStreaks(
  activeDates: Set<string>,
  today: string,
): { current: number; longest: number } {
  return {
    current: currentStreak(activeDates, today),
    longest: longestConsecutiveRun(activeDates),
  };
}

export function activeDayCount(
  activeDates: Set<string>,
  year?: number,
): number {
  if (year === undefined) {
    return activeDates.size;
  }

  const prefix = `${year}-`;
  let count = 0;

  for (const date of activeDates) {
    if (date.startsWith(prefix)) {
      count += 1;
    }
  }

  return count;
}
