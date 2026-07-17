# Extend contribution history to last 10 years

## Context

Backfill today pulls almost no history: `runBackfill` uses the connection **row's** `createdAt` (set to `new Date()` at insert) as `since` — not the account creation date the connector's `validate()` returns (that value is discarded). A new connection therefore backfills only from the day it was created. The year picker (`years` in the profile API) is computed from all stored `daily_counts` rows, uncapped and without a zero-count filter.

Goal:
1. New connector creation backfills the last 10 calendar years.
2. Year picker shows only years within the last 10 years **that have data**.

## Decisions / assumptions

- **10-year boundary is calendar-aligned**: `Jan 1 of (currentYear − 9)` through today. Aligns backfill depth exactly with the year picker (a rolling "today − 10y" boundary would create a partial year the picker can't show).
- **Skip zero-count days during backfill.** GitHub's calendar returns every day incl. `count: 0` (`parseContributions`, [github.ts:143-155](packages/connectors/src/github.ts#L143-L155)); without filtering, 10y backfill writes ~3,650 mostly-zero rows per connection and empty years would appear "with data". Filter `count > 0` in `runBackfill` only — **not** in `upsertDailyCounts` (refresh must still be able to zero out rewritten history).
- **Years list additionally filters `count > 0`** so ingest-pushed or refresh-zeroed rows can't surface an empty year.
- **`range=all` / "All" tab stays lifetime** — requirement covers the year picker only; pre-10y ingest data stays reachable via "All".
- **Existing connections**: no auto-migration. Manual resync (deletes counts, re-runs backfill) now pulls 10 years — that's the upgrade path.
- **No connector changes**: `backfill(creds, since, until)` already takes `since`; `yearWindows` chunking handles a 10-year span (10 sequential requests per git connection).
- Known limitation to document: GitLab's events API has native retention (~3 years on gitlab.com); older windows just return empty pages.
- Admin route's `createdAt` body override ([admin/connections/route.ts:35](apps/web/src/app/api/admin/connections/route.ts#L35)) no longer influences backfill depth; it still sets the row timestamp. No code change, note only.

## Changes

### 1. Domain constant + helper — [apps/web/src/domain/calendar.ts](apps/web/src/domain/calendar.ts)

```ts
export const HISTORY_YEARS = 10;

// Jan 1 of the earliest year in the history window
export function historyStart(today: string): string {
  const year = Number(today.slice(0, 4)) - (HISTORY_YEARS - 1);
  return `${year}-01-01`;
}
```

Pure, `today` passed in (matches domain convention: no `Date.now()`).

### 2. Sync engine — [apps/web/src/sync/backfill.ts](apps/web/src/sync/backfill.ts)

- Line 75: `const since = sinceDate(connection.createdAt);` → `const since = historyStart(utcToday());`
- Remove now-unused `sinceDate` helper.
- In the backfill loop, drop zero-count days before upsert:
  `upsertDailyCounts(db, connectionId, batch.filter((d) => d.count > 0))`
- `upsertDailyCounts` itself unchanged (shared with refresh).

### 3. Profile API — [apps/web/src/app/api/profile/[handle]/route.ts](apps/web/src/app/api/profile/%5Bhandle%5D/route.ts)

Replace lines 104–106:

```ts
const minYear = Number(new Date().toISOString().slice(0, 4)) - (HISTORY_YEARS - 1);
const years = [
  ...new Set(
    allCounts
      .filter((row) => row.count > 0)
      .map((row) => Number(row.date.slice(0, 4))),
  ),
]
  .filter((year) => year >= minYear)
  .sort((a, b) => b - a);
```

Import `HISTORY_YEARS` from `@/domain/calendar`. Everything else (range filtering, `total`, `days`) unchanged.

No widget changes — the widget renders a single range; the year list is built by the profile page from `profile.years`.

## Tests (TDD — write failing first)

- **[apps/web/src/domain/calendar.test.ts](apps/web/src/domain/calendar.test.ts)** (or add to existing): `historyStart("2026-07-17") === "2017-01-01"`.
- **[apps/web/src/sync/backfill.test.ts](apps/web/src/sync/backfill.test.ts)**:
  - Rework "iterates year windows since connection creation" (currently asserts `since === "2022-06-15"` from seeded row createdAt): fake system time (`vi.setSystemTime`), assert `since === "2017-01-01"` when today is in 2026.
  - New: connector batch containing zero-count days → zero rows not persisted, positive rows are.
- **[apps/web/src/app/api/profile/[handle]/route.test.ts](apps/web/src/app/api/profile/%5Bhandle%5D/route.test.ts)** (system time already faked to 2026-07-11):
  - Seed a row older than 10y (e.g. 2015, count 5) → excluded from `years`.
  - Seed a zero-count-only year (e.g. 2023, count 0) → excluded from `years`.
  - Existing assertion `years === [2026, 2025, 2024]` still holds.
- Connector tests unchanged (backfill bounds are caller-supplied; existing window tests still valid).

## Docs

- [docs/specs/design.md](docs/specs/design.md):
  - §6 GitHub bullet: "Backfill loops 1-year windows back to `createdAt`" → back to the last 10 calendar years (`HISTORY_YEARS`). Add GitLab retention note.
  - §7: backfill bullet mentions 10-year depth.
  - §8: "year list navigates back to earliest data" → earliest data within the last 10 years.
- [docs/specs/plan.md](docs/specs/plan.md): changelog entry (problem/fix/files), matching existing convention.

## Verification

1. `pnpm --filter web exec vitest run src/domain src/sync/backfill.test.ts src/app/api/profile` — new + updated tests green.
2. `pnpm test` — full workspace green.
3. `pnpm build` — green.
4. End-to-end (local, no PAT needed): `pnpm dev`, create an ingest connection, push counts for an old year (e.g. 2014) and a recent year via `POST /api/ingest`; profile page year nav shows the recent year but not 2014; "All" tab still shows the 2014 data.
5. `pnpm --filter web e2e` — Playwright suite green.
