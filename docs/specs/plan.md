# ContribStack MVP — Implementation Plan

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

Scaffolded the pnpm monorepo with three packages: `apps/web` (Next.js App Router via `create-next-app`), `packages/widget` (Vite lib-mode IIFE build), and `packages/connectors` (pure source-pull logic). Set up `vitest.workspace.ts` covering all packages with smoke tests.

### Task 2: Database schema + crypto util

Implemented the Drizzle ORM schema (`users`, `connections`, `daily_counts` with composite PK) and the in-memory SQLite client for tests. Built AES-256-GCM encryption for PATs (`encryptSecret`/`decryptSecret`) and SHA-256 hashing for ingest API keys (`hashApiKey`). Generated the initial migration. See [design.md §4](design.md#4-data-model) for the schema.

### Task 3: Domain math (pure functions)

Built pure domain functions in `apps/web/src/domain/`: timezone bucketing (`bucketByTimezone`), year-window chunking for backfill, streak computation (current/longest, alive-via-yesterday convention), intensity-level quartiles, and cross-layer union for combined streak calculation. No I/O, no `Date.now()` — today is always passed in.

## Phase 2 — Connectors

### Task 4: Connector interface + GitHub connector

Defined the `Connector` interface (`validate`, `backfill`, `refresh`) in `packages/connectors/src/types.ts` and implemented the GitHub connector using GraphQL `contributionsCollection`. Pre-bucketed day counts are taken as-is (D17). Backfill iterates year windows back to account creation. Tests use recorded fixture responses with mocked fetch. See [design.md §6](design.md#6-connectors) for the interface.

### Task 5: GitLab connector

Implemented the GitLab connector via `makeGitlabConnector(tz)`. Pages `/users/:id/events`, buckets raw timestamps into the user's timezone server-side. Supports gitlab.com and self-managed instances via `baseUrl`. Native event granularity, no normalization (D6).

## Phase 3 — Web app core

### Task 6: Auth + handle claim

Set up Auth.js GitHub OAuth with the Drizzle adapter. New users land with a `__pending__` handle and are redirected to `/welcome` to claim one. Handle validation enforces `^[a-z0-9-]{3,30}$` with a reserved word list (`api`, `settings`, `welcome`, `embed`, `widget`, `admin`). Handle is immutable after claim.

### Task 7: Connection CRUD + ingest key issuance

Implemented REST connection management at `/api/settings/connections`: git connections validate the PAT via the connector, encrypt and store it; ingest connections generate a `csk_` key (shown once, stored as SHA-256 hash). Slug derived from label, unique per user with collision suffixes. Auto-shade assigns distinguishable colors for same-platform duplicates (D14). See [design.md §5](design.md#5-api-surface) for the API surface.

### Task 8: Sync engine

Built the fire-and-forget backfill loop (iterates connector year windows, upserts into `daily_counts`, transitions status `backfilling` → `ok`/`error`), stale-while-revalidate refresh (trailing 35 days if `last_synced_at` > 10 min), and in-process `Map<string, Promise>` mutex to prevent concurrent refresh stampedes. Sync functions never block callers (D10). See [design.md §7](design.md#7-sync-engine) for the design.

### Task 9: Public profile API + ingest API

Implemented the public profile JSON API (`GET /api/profile/:handle` with open CORS, year/range filtering, private → 404 indistinguishable from unknown) and the ingest API (`POST /api/ingest` with Bearer auth, atomic upsert, rate limiting at 60 req/min per key). Profile responses trigger `refreshIfStale` per connection.

## Phase 4 — UI

### Task 10: Heatmap web component

Built the `<contrib-stack>` custom element in `packages/widget/`: Shadow DOM, 53-week SVG grid with split-cell rendering (N active layers → N vertical stripes), legend chips with toggle/isolate, stat tiles (streaks, active days, totals recomputed per visible layers), tooltip (hover/tap), responsive horizontal scroll, light/dark/auto theme, and click-through to profile. Bundle: 5.31 KB gzip (budget: 15 KB). See [design.md §9](design.md#9-embed-widget) for the embed spec.

### Task 11: Profile page + settings UI

Built the SSR profile page (`/[handle]`) mounting the widget with `link="off"`, year navigation, and the settings UI with connection CRUD forms, backfill status polling, error banners, privacy toggle, and ingest-key reveal-once modal. `next.config.ts` copies `widget.js` from the widget package at build with content-hash cache busting.

### Task 12: Embed test page

Added `apps/web/public/embed-test.html` with two widget instances (default and dark/filtered) plus host-page CSS to verify Shadow DOM isolation.

## Phase 5 — E2E + deploy

### Task 13: Playwright E2E

Created E2E specs covering: seeded profile rendering with 3 legend chips, chip toggle, year navigation, ingest upsert visibility, embed page widget rendering, and private-profile 404 behavior. Direct-DB seed (`apps/web/e2e/seed.ts`) with session cookie injection instead of live OAuth.

### Task 14: Railway deploy + backups

Created the multi-stage `Dockerfile` (pnpm build → node runtime + Litestream binary), `litestream.yml`, and `docker-entrypoint.sh` (restore-if-missing → migrate → replicate). Added `railway.json` with volume mount and health check, `.env.example`, and `README.md`. See [design.md §13](design.md#13-deployment) for the deployment architecture.

### Task 15: Success-criteria walkthrough

Executed [design.md §2](design.md#2-goals-and-non-goals) goals 1–6 against production and recorded results in the MVP Success-Criteria Results section below.

## Phase 6 — Post-deploy fixes

### Task 16: Production homepage

Replaced the default Next.js starter page with a ContribStack landing page: product description, sign-in via Auth.js, and link to the example profile. Added a rendering test (`apps/web/src/app/page.test.tsx`), scoped CSS, and production metadata. See [design.md §14](design.md#14-homepage).

### Task 17: Clean expected shutdowns

Added `scripts/normalize-exit-status.sh` to translate exit code 143 (SIGTERM from Railway deployment rotation) to 0, preserving all other exit codes. Wired it into `docker-entrypoint.sh` to wrap Litestream. Node tests (`scripts/normalize-exit-status.test.mjs`) verify the normalization for exit codes 0, 143, and 42.

### Task 18: Verify and deploy (homepage + shutdown)

Ran the full verification suite (lint, tests, migration, build, E2E), confirmed clean Docker shutdown behavior, and deployed through GitHub Actions.

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

---

## Changelog

- 2026-07-12 — **Fix external embedding**: auto-detect API origin from script URL

**Problem:** The widget's `apiBase` defaulted to `location.origin` when no `api` attribute was specified. On external sites, `location.origin` resolves to the embedding page's domain (e.g. `https://myblog.com`), causing the profile fetch to target the wrong server. The design doc's canonical snippet (`<script src="https://contribstack.app/widget.js">` + `<contrib-stack user="...">`) would fail on any page not hosted on contribstack.app.

**Fix:** Added `SCRIPT_ORIGIN` detection in `packages/widget/src/contrib-stack.ts`. At script load time, `document.currentScript.src` is parsed to extract the origin of the script itself. The `apiBase` resolution order is now: explicit `api` attribute → script origin → `location.origin`. External embeds now work without an `api` attribute as long as the script is loaded from the ContribStack host.

**Files changed:**
- `packages/widget/src/contrib-stack.ts` — added `SCRIPT_ORIGIN` constant and updated `apiBase` getter
- `apps/web/public/widget.js` — rebuilt
- `docs/specs/design.md` — expanded §9 with detailed embedding instructions, attribute reference, API origin resolution docs, and a full HTML example

- 2026-07-13 — **Compacted post-implementation.** Removed step-by-step implementation tasks, file-by-file diffs, code snippets, interface definitions, and verification command lists now that the feature has shipped. Merged `plan_production-homepage-shutdown.md` tasks (16–18) into this plan. Preserved Goal, Global Constraints, per-task intent paragraphs, MVP Success-Criteria Results, and deployment evidence. Original plan is recoverable via git history.

- 2026-07-13 — **Config UI: server auth gate + sign-out + E2E**

**Problem:** `/settings` relied on a client-side 401 redirect — no server guard. Pending-handle users could land on `/settings` instead of being redirected to `/welcome` (criterion-1 defect). No signed-in indicator, no "View profile" link, no sign-out. Zero E2E coverage of the authenticated settings flow.

**Fix:** Extracted the client component to `settings-client.tsx` and rewrote `page.tsx` as an async server component: `auth()` → no session redirect, pending-handle → `/welcome` redirect, else render client with account prop. Added sign-out server action (deletes DB session via Auth.js `signOut`). Account bar shows handle, profile link, and sign-out button.

**Tests added:**
- `apps/web/src/app/settings/page.test.tsx` — 4 unit tests (no-session redirect, pending redirect, claimed user render, signOutAction)
- `apps/web/e2e/settings.spec.ts` — 5 E2E tests (unauth redirect, pending redirect, account bar + connections, add/delete ingest connection, sign-out)
- E2E seed updated with pending user + session fixture

**Files changed:**
- `apps/web/src/app/settings/settings-client.tsx` — new (extracted client UI + account bar)
- `apps/web/src/app/settings/page.tsx` — rewritten as server auth gate
- `apps/web/src/app/settings/actions.ts` — new (signOut server action)
- `apps/web/src/app/settings/page.module.css` — added `.accountBar` styles
- `apps/web/src/app/settings/page.test.tsx` — new (gate unit tests)
- `apps/web/e2e/seed.ts` — added pending user + session
- `apps/web/e2e/settings.spec.ts` — new (authenticated E2E)
- `docs/specs/design.md` — §5 settings gate, §12 E2E note
