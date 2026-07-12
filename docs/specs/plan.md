# ContribStack MVP — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the ContribStack MVP per [design.md](design.md): hosted multi-user activity profiles with an overlaid per-connection heatmap, GitHub + GitLab connectors, generic ingest API, and an embeddable web-component widget.

**Architecture:** pnpm monorepo — `apps/web` (Next.js App Router: SSR pages, API routes, Auth.js), `packages/widget` (framework-free web component, Vite lib build), `packages/connectors` (pure source-pull logic). SQLite (Drizzle + better-sqlite3) on a Railway volume, Litestream → R2 backup.

**Tech Stack:** TypeScript, Next.js (App Router), Auth.js (GitHub OAuth), Drizzle ORM, better-sqlite3, Vite, Vitest, Playwright, Litestream, Railway.

## Global Constraints

- Node 22 LTS, pnpm 9, TypeScript strict everywhere.
- `packages/widget` and `packages/connectors` must not import from Next.js or `apps/web`.
- Widget bundle budget: ≤ 15 KB min+gzip, zero runtime dependencies.
- PATs: AES-256-GCM at rest, key from `ENCRYPTION_KEY` env (32-byte base64); never logged, never sent to the client.
- Ingest API keys stored as SHA-256 hashes; plaintext shown once.
- Private profiles must be indistinguishable from unknown handles on public endpoints.
- All dates are `YYYY-MM-DD` strings in domain code and DB; timezone bucketing per D17.
- Every task ends green: `pnpm test` (and `pnpm build` where relevant) passes before commit.
- TDD: write the failing test first for domain, connector, and API tasks.

---

## Phase 1 — Foundation

### Task 1: Monorepo scaffold

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `.gitignore`, `.nvmrc`
- Create: `apps/web` via `create-next-app` (App Router, TS, no Tailwind prompt — accept defaults, add later if needed)
- Create: `packages/widget/{package.json,tsconfig.json,vite.config.ts,src/index.ts}`
- Create: `packages/connectors/{package.json,tsconfig.json,src/index.ts}`
- Create: `vitest.workspace.ts`

**Steps:**
- [ ] Scaffold workspace: root `package.json` (private, scripts: `dev`, `build`, `test`, `lint`), `pnpm-workspace.yaml` listing `apps/*`, `packages/*`.
- [ ] `pnpm create next-app apps/web` (TS, App Router, ESLint); wire `tsconfig.base.json` extends into all three packages.
- [ ] Stub `packages/widget/src/index.ts` (`export const VERSION = "0.0.1"`) with Vite lib-mode config (single IIFE output `widget.js`, no externals); stub `packages/connectors/src/index.ts`.
- [ ] Add Vitest workspace config covering `apps/web`, `packages/*`; one smoke test per package (e.g. `expect(VERSION).toBe("0.0.1")`).
- [ ] Verify: `pnpm install && pnpm test && pnpm build` all pass.
- [ ] Commit: `chore: scaffold pnpm monorepo (web, widget, connectors)`

### Task 2: Database schema + crypto util

**Files:**
- Create: `apps/web/src/db/schema.ts`, `apps/web/src/db/client.ts`, `apps/web/drizzle.config.ts`
- Create: `apps/web/src/lib/crypto.ts`
- Test: `apps/web/src/db/schema.test.ts`, `apps/web/src/lib/crypto.test.ts`

**Interfaces (produces):**

```ts
// schema.ts — Drizzle tables
users:        { id, githubId, handle /*unique*/, timezone, isPrivate, createdAt }
connections:  { id, userId, slug, type: 'github'|'gitlab'|'ingest', label, color,
                baseUrl?, credentialEncrypted?, apiKeyHash?, status: 'ok'|'backfilling'|'error',
                lastSyncedAt?, createdAt }   // unique (userId, slug)
dailyCounts:  { connectionId, date, count }  // composite PK (connectionId, date)
// + Auth.js tables via @auth/drizzle-adapter

// crypto.ts
encryptSecret(plain: string): string   // "iv:tag:cipher" base64, AES-256-GCM, key from ENCRYPTION_KEY
decryptSecret(sealed: string): string
hashApiKey(key: string): string        // sha256 hex
```

**Steps:**
- [ ] Failing tests: schema round-trip (insert user → connection → daily_counts upsert; composite-PK conflict replaces count), crypto round-trip + tamper detection (flipped byte throws), `hashApiKey` determinism.
- [ ] Implement schema, in-memory SQLite client for tests (`:memory:`), file path from `DATABASE_PATH` in prod; generate initial migration.
- [ ] Implement `crypto.ts` with node:crypto AES-256-GCM.
- [ ] Verify: `pnpm --filter web test` green.
- [ ] Commit: `feat: db schema, migrations, secret encryption`

### Task 3: Domain math (pure functions)

**Files:**
- Create: `apps/web/src/domain/{aggregate.ts,streaks.ts,calendar.ts}`
- Test: `apps/web/src/domain/*.test.ts`

**Interfaces (produces):**

```ts
type DayCount = { date: string; count: number }
bucketByTimezone(timestampsIso: string[], tz: string): DayCount[]      // GitLab events → days (D17)
yearWindows(fromIso: string, toIso: string): { from: string; to: string }[]  // ≤1y chunks for backfill
computeStreaks(activeDates: Set<string>, today: string): { current: number; longest: number }
// current streak alive if today OR yesterday active (GitHub convention)
activeDayCount(activeDates: Set<string>, year?: number): number
intensityLevel(count: number, nonZeroCounts: number[]): 0|1|2|3|4      // quartiles of the connection's own range
unionActiveDates(layers: DayCount[][]): Set<string>                    // streak = any visible connection (D12)
```

**Steps:**
- [ ] Failing tests first — cover: DST boundary bucketing (`Europe/Zurich`), year windows over multi-year span (exact boundaries, no overlap), streak alive-via-yesterday, streak broken today, single-day streak, empty set, intensity quartiles with ties, union across layers.
- [ ] Implement; no I/O, no Date.now() (today passed in).
- [ ] Verify: `pnpm --filter web test` green.
- [ ] Commit: `feat: aggregation, streak, calendar domain functions`

## Phase 2 — Connectors

### Task 4: Connector interface + GitHub connector

**Files:**
- Create: `packages/connectors/src/{types.ts,github.ts}`
- Create: `packages/connectors/fixtures/github/*.json` (recorded GraphQL responses)
- Test: `packages/connectors/src/github.test.ts`

**Interfaces (produces):**

```ts
type ConnectorCreds = { token: string; baseUrl?: string }  // baseUrl: GHE / self-managed GitLab (D15)
type AccountInfo = { username: string; accountCreatedAt: string }
type DayCount = { date: string; count: number }

interface Connector {
  validate(creds: ConnectorCreds): Promise<AccountInfo>                     // throws ConnectorAuthError
  backfill(creds: ConnectorCreds, since: string, until: string): AsyncIterable<DayCount[]>
  refresh(creds: ConnectorCreds, days: number): Promise<DayCount[]>         // trailing window
}
export const githubConnector: Connector
```

**Steps:**
- [ ] Failing tests against fixtures (fetch mocked): `validate` returns login + createdAt; bad token → `ConnectorAuthError`; `backfill` walks year windows via `contributionsCollection(from,to)` and yields pre-bucketed days as-is (D17); `refresh(35)` returns trailing window; baseUrl swaps the GraphQL endpoint.
- [ ] Implement with plain `fetch`; no retries beyond one 429/5xx backoff.
- [ ] Verify: `pnpm --filter connectors test` green; no live network in CI (assert via mocked fetch).
- [ ] Commit: `feat: connector interface + GitHub connector`

### Task 5: GitLab connector

**Files:**
- Create: `packages/connectors/src/gitlab.ts`
- Create: `packages/connectors/fixtures/gitlab/*.json`
- Test: `packages/connectors/src/gitlab.test.ts`

**Interfaces:** consumes `Connector` types from Task 4; produces `gitlabConnector: Connector` with an extra constructor arg: `makeGitlabConnector(tz: string)` — events are raw timestamps, bucketed via the user's timezone (Task 3 `bucketByTimezone`).

**Steps:**
- [ ] Failing tests: `validate` via `GET /user` (returns username + created_at); `backfill` pages `GET /users/:id/events?after&before` until empty and buckets by tz; `refresh` pulls trailing days; baseUrl points at self-managed instance; pagination fixture ≥3 pages.
- [ ] Implement; native event granularity, no normalization (D6).
- [ ] Verify: `pnpm --filter connectors test` green.
- [ ] Commit: `feat: GitLab connector with timezone bucketing`

## Phase 3 — Web app core

### Task 6: Auth + handle claim

**Files:**
- Create: `apps/web/src/auth.ts` (Auth.js config, GitHub provider, Drizzle adapter)
- Create: `apps/web/src/app/api/auth/[...nextauth]/route.ts`
- Create: `apps/web/src/app/welcome/page.tsx` (handle claim plus timezone auto-detect form), `apps/web/src/app/api/settings/handle/route.ts`
- Test: `apps/web/src/app/api/settings/handle/route.test.ts`

**Steps:**
- [ ] Failing tests for handle claim route: rejects taken handle, rejects invalid format (`^[a-z0-9-]{3,30}$`, reserved list: `api settings welcome embed widget admin`), sets handle once (immutable after claim).
- [ ] Implement Auth.js GitHub OAuth (identity only, D8); first sign-in without handle redirects to `/welcome`; form posts handle + browser-detected timezone.
- [ ] Verify: tests green; manual `pnpm dev` sign-in flow works with a dev OAuth app.
- [ ] Commit: `feat: GitHub OAuth sign-in and handle claim`

### Task 7: Connection CRUD + ingest key issuance

**Files:**
- Create: `apps/web/src/app/api/settings/connections/route.ts` (+ `[id]/route.ts`)
- Create: `apps/web/src/lib/colors.ts` (signature palette + auto-shade for same-platform duplicates, D14)
- Create: `apps/web/src/lib/slug.ts`
- Test: `apps/web/src/app/api/settings/connections/route.test.ts`, `apps/web/src/lib/colors.test.ts`

**Interfaces (produces):** REST used by settings UI (Task 11):
`POST /api/settings/connections` body `{type, label, baseUrl?, token?}` →
- git types: validates token via connector `validate()`, stores `encryptSecret(token)`, kicks backfill (Task 8), returns connection.
- ingest type: generates `csk_` + 32 hex key, stores `hashApiKey(key)`, returns `{connection, apiKey}`; key appears only in this response.
`PATCH` label/color, `DELETE`, `POST [id]/resync`.

**Steps:**
- [ ] Failing tests: create git connection encrypts token (raw token absent from DB dump), invalid PAT → 422 with connector error message; ingest create returns plaintext key once, stores only hash; second GitHub connection auto-gets distinct shade; slug derived from label, unique per user (`github-work`), collision suffixes `-2`; delete cascades daily_counts.
- [ ] Implement; token validation calls connector `validate` with 5s timeout.
- [ ] Verify: tests green.
- [ ] Commit: `feat: connection CRUD, PAT encryption, ingest key issuance`

### Task 8: Sync engine

**Files:**
- Create: `apps/web/src/sync/{backfill.ts,refresh.ts,mutex.ts}`
- Test: `apps/web/src/sync/*.test.ts`

**Interfaces (produces):**

```ts
startBackfill(connectionId: string): void      // fire-and-forget; status backfilling→ok|error
refreshIfStale(connectionId: string): void     // no-op if lastSyncedAt <10min or mutex held;
                                               // else background-refresh trailing 35 days
resync(connectionId: string): Promise<void>    // wipe daily_counts for connection, full backfill
```

**Steps:**
- [ ] Failing tests (fake connector + in-memory DB): backfill iterates year windows since account creation and upserts, sets `ok` on success and `error` on connector throw (partial data kept); refresh skips when fresh, refreshes when stale, mutex prevents concurrent refresh of same connection (spy call count = 1 under 10 parallel calls); upsert idempotency — re-running refresh doesn't double counts (D16 replace semantics).
- [ ] Implement with in-process `Map<string, Promise>` mutex (single node, D10); serve-stale philosophy: sync functions never block callers.
- [ ] Verify: tests green.
- [ ] Commit: `feat: backfill + stale-while-revalidate sync engine`

### Task 9: Public profile API + ingest API

**Files:**
- Create: `apps/web/src/app/api/profile/[handle]/route.ts`
- Create: `apps/web/src/app/api/ingest/route.ts`
- Create: `apps/web/src/lib/rate-limit.ts` (in-memory token bucket)
- Test: both `route.test.ts` files

**Interfaces (produces):** the wire contract the widget (Task 10) consumes:

```jsonc
// GET /api/profile/:handle?year=2026   (open CORS; omit year → rolling 365d; ?range=all → lifetime)
{
  "handle": "kevinlin",
  "years": [2026, 2025],
  "connections": [
    { "slug": "github-personal", "label": "GitHub (personal)", "color": "#2da44e",
      "total": 1234, "days": [{ "date": "2026-07-11", "count": 5 }] }
  ]
}
// POST /api/ingest  Authorization: Bearer csk_...   body: [{ "date": "2026-07-11", "count": 12 }]
// → { "upserted": 1 }
```

**Steps:**
- [ ] Failing tests — profile: unknown handle → 404; private profile → identical 404 body/headers (D8); year filter; `range=all` returns lifetime days; `Access-Control-Allow-Origin: *`; response triggers `refreshIfStale` per connection (spy). Ingest: bad/missing key → 401; malformed date / negative count / >5000 rows → 400, nothing written (atomic); valid upsert replaces existing count; over-rate-limit → 429.
- [ ] Implement; ingest wrapped in one transaction; rate limit 60 req/min per key.
- [ ] Verify: tests green; `curl` smoke against `pnpm dev`.
- [ ] Commit: `feat: public profile JSON API + ingest API`

## Phase 4 — UI

### Task 10: Heatmap web component

**Files:**
- Create: `packages/widget/src/{contrib-stack.ts,render.ts,layout.ts,tooltip.ts,theme.ts,api.ts}`
- Test: `packages/widget/src/{layout.test.ts,render.test.ts}` (jsdom)
- Create: `packages/widget/scripts/size-check.mjs`

**Interfaces:** consumes Task 9 profile JSON. Produces `<contrib-stack>` custom element:

```html
<contrib-stack user="kevinlin" theme="auto" range="1y" sources="github-personal,gitlab-work" api="https://contribstack.app"></contrib-stack>
<!-- range: "1y" (default, rolling year) | "2026" (calendar year) | "all" (lifetime) -->

```

- Shadow DOM; 53-week SVG grid; **split-cell**: N active layers that day → N equal vertical stripes, connection color, shade = `intensityLevel` (Task 3 logic duplicated locally since the widget has zero deps; keep the function tiny and test both).
- Legend chips per connection (swatch + label + total): click = toggle layer; chips filter stat tiles too.
- Stat tiles: current streak, longest streak, active days, per-connection totals (computed over **visible** layers).
- Tooltip: hover (desktop) / tap (touch) with per-connection counts.
- Responsive: fixed cell size, horizontal scroll auto-positioned to latest; `theme` light/dark/auto via `prefers-color-scheme`.
- Click-through: cells/header link to `{api}/{user}` when embedded (attribute `link="off"` disables — profile page uses that).

**Steps:**
- [ ] Failing layout tests: 53-column grid math for a leap year, split-cell stripe geometry (1/2/3 layers), intensity levels, toggle recompute of tiles/streaks.
- [ ] Implement component; no framework, no fetch polyfill.
- [ ] Size gate: `size-check.mjs` fails build if `dist/widget.js` gzip > 15 KB; wire into `pnpm --filter widget build`.
- [ ] Verify: widget tests green; build passes size gate; manual check via a static `packages/widget/dev.html` against a JSON fixture.
- [ ] Commit: `feat: contrib-stack heatmap web component`

### Task 11: Profile page + settings UI

**Files:**
- Create: `apps/web/src/app/[handle]/page.tsx` (SSR: fetch profile server-side, mount widget with `link="off"`, year list nav, "All" tab)
- Create: `apps/web/src/app/settings/page.tsx` (connections list/create forms incl. base-URL field, color picker, resync + delete buttons, backfill status polling, error-status banner per §11, privacy toggle, ingest-key reveal-once modal)
- Create: `apps/web/src/app/api/settings/privacy/route.ts`
- Test: `apps/web/src/app/[handle]/page.test.tsx` (RSC render smoke), privacy route test
- Modify: `apps/web/next.config.ts` (serve `widget.js` — copy from `packages/widget/dist` at build, immutable cache header)

**Steps:**
- [ ] Failing tests: private profile page renders the same not-found UI as unknown handle; privacy toggle route flips flag; profile page passes year param through.
- [ ] Implement pages; mobile: tiles 4→2 columns via CSS grid, heatmap container `overflow-x: auto` (D19).
- [ ] Verify: tests green; `pnpm dev` manual pass — connect real GitHub PAT, watch backfill status, profile renders layers.
- [ ] Commit: `feat: profile page, settings UI, widget serving`

### Task 12: Embed test page

**Files:**
- Create: `apps/web/public/embed-test.html` (plain HTML loading `/widget.js` + `<contrib-stack>`, simulating a third-party site)

**Steps:**
- [ ] Add page with two widget instances (default + `theme="dark" sources=` filtered) and a paragraph of host-page CSS that must not leak in (shadow-DOM check).
- [ ] Verify manually: widget renders, toggles work, click-through navigates to profile; no CORS errors from a different origin (`python3 -m http.server` serving a copy).
- [ ] Commit: `feat: embed test page`

## Phase 5 — E2E + deploy

### Task 13: Playwright E2E

**Files:**
- Create: `apps/web/playwright.config.ts`, `apps/web/e2e/{profile.spec.ts,ingest.spec.ts,embed.spec.ts}`
- Create: `apps/web/e2e/seed.ts` (direct-DB seed: user + 2 git connections with fixture counts + 1 ingest connection; session cookie injection instead of live OAuth)

**Steps:**
- [ ] Specs: seeded profile renders heatmap with 3 legend chips; chip toggle hides layer and updates tiles; year nav swaps data; `POST /api/ingest` with seeded key then reload → new counts visible; embed-test page renders widget; private toggle → profile 404s.
- [ ] Verify: `pnpm --filter web e2e` green headless.
- [ ] Commit: `test: Playwright E2E for profile, ingest, embed`

### Task 14: Railway deploy + backups

**Files:**
- Create: `Dockerfile` (multi-stage: pnpm build → node runtime + litestream binary), `litestream.yml`, `docker-entrypoint.sh` (litestream restore-if-missing → `litestream replicate -exec "node server.js"`)
- Create: `railway.json` (volume mount `/data`), `.env.example` (documented: `DATABASE_PATH`, `ENCRYPTION_KEY`, `AUTH_SECRET`, `AUTH_GITHUB_ID/SECRET`, `R2_*`, `PUBLIC_URL`)
- Create: `README.md` (what it is, local dev quickstart, deploy steps, ingest API usage with curl example)

**Steps:**
- [ ] Local verify: `docker build` + run with a bind-mounted volume; sign-in, connect, profile — all work; kill container, restart, data persists; litestream replicates to a local MinIO or real R2 bucket.
- [ ] Deploy to Railway; run success criteria 1–5 from design.md §2 against production.
- [ ] Commit: `feat: dockerized Railway deploy with litestream backups`

### Task 15: Success-criteria walkthrough

**Steps:**
- [ ] Execute design.md §2 goals 1–6 on production as a checklist; fix anything that fails (each fix = its own commit).
- [ ] Record results at the bottom of this file (date + pass/fail per criterion).
- [ ] Commit: `docs: record MVP success-criteria results`

---

## MVP Success-Criteria Results

**Date:** 2026-07-12 (production verification)

| # | Criterion | Status | Notes |
|---|-----------|--------|-------|
| 1 | Sign in with GitHub, claim a handle, connect GitHub PAT + self-hosted GitLab + gitlab.com; full history backfills | PARTIAL | Production GitHub OAuth and handle claim succeeded. The first sign-in landed on `/settings` instead of redirecting a pending user to `/welcome`; opening `/welcome` manually allowed the claim. GitHub and GitLab PAT backfills were not exercised because no PATs were supplied. |
| 2 | Profile shows overlaid multi-year heatmap; layer toggles, stat tiles, and year navigation work | PASS | The production `/kevinlin` profile rendered the widget, ingest layer, total 7, streak 1, active days 1, and year controls. Automated widget and profile tests cover layer toggles and year changes. |
| 3 | `widget.js` on an external page renders the interactive rolling-year widget with click-through to the profile | PARTIAL | Production `/widget.js` returned 200 and the profile rendered the same component. The external-origin production check could not be run because the browser blocked the temporary `data:` test page. The external embed Playwright test passed in CI. |
| 4 | An ingest connection created in the UI plus a `curl` upsert appears as a new colored layer without a deploy | PASS | Created `Deployment smoke test` in production and upserted `{date: "2026-07-12", count: 7}`. The new layer and count appeared without a deploy and persisted through a Railway restart and R2 restore. |
| 5 | Warm-cache profile load under ~1s. Private toggle hides both page and embed | PASS | Five production API trials were 0.204200s, 0.067145s, 0.058851s, 0.057493s, and 0.053983s. Private and unknown profile APIs returned 404 with identical bodies; public access was restored afterward. |
| 6 | Profile page and widget are responsive and touch-friendly | PASS (automated) | Responsive layout and touch behavior pass the widget and Playwright suites. The production browser's viewport override was not honored, so no additional device-sized manual result is claimed. |

**Summary:** Production is live at `https://contrib-stack-production.up.railway.app`. Criteria 2, 4, 5, and 6 pass. Criteria 1 and 3 are partial because of the pending-user redirect defect, missing PAT credentials, and the blocked external-origin manual check.

**Deployment evidence:**

- GitHub Actions CI run `29178064676`: passed.
- GitHub Actions deploy run `29178104190`: passed.
- Railway deployment `4d162ad9-16f2-4906-a6ec-560252ca6618`: successful, one Singapore replica, 5 GB volume mounted at `/data`.
- Railway repository auto-deploy is disconnected. Production deploys only through GitHub Actions.
- Restart test preserved the production profile and ingest count.
- An isolated restore from Cloudflare R2 recovered handle `kevinlin` and count 7. Litestream retention is limited to 168 hours to keep usage bounded within the 10 GB/month free tier.

**Stats:**
- 115 unit/integration tests across 23 test files (all passing)
- 6 Playwright E2E specs (profile, ingest, embed)
- Widget bundle: 5.31 KB gzip (budget: 15 KB)
- Full build: all 3 packages + Next.js app build green
- Deployment work committed directly to `main`
