# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

ContribStack — a hosted developer-activity profile service. Each user gets a public page at `contribstack.app/<handle>` with an overlaid multi-source contribution heatmap (GitHub, GitLab, and generic ingest each render as their own colored layer, never merged). An embeddable `widget.js` web component renders the same heatmap on any external site.

Design and rationale live in [docs/specs/design.md](docs/specs/design.md); numbered decisions (D1–D19) in [docs/requirements/decision-log.md](docs/requirements/decision-log.md). Read the design doc before non-trivial changes.

## Commands

Toolchain: Node 22+ (`.nvmrc`), pnpm 10.31.0. Run from repo root unless noted.

```bash
pnpm install
pnpm dev                    # Next.js dev server (apps/web) → http://localhost:3000
pnpm build                  # recursive build (widget first, then web)
pnpm test                   # Vitest across all workspaces (vitest.workspace.ts)
pnpm lint                   # recursive eslint

# Single package / single test
pnpm --filter web test
pnpm --filter web exec vitest run src/app/api/ingest/route.test.ts
pnpm --filter @contrib-stack/widget test

# E2E (Playwright): boots its own dev server, single worker, not parallel
pnpm --filter web e2e

# DB migrations (Drizzle) — edit schema.ts then:
pnpm --filter web exec drizzle-kit generate   # writes to apps/web/drizzle/
```

Path alias in apps/web: `@/` → `apps/web/src/`.

Minimum env for local dev (`cp .env.example apps/web/.env.local`): `ENCRYPTION_KEY` (32-byte base64), `AUTH_SECRET`, `AUTH_GITHUB_ID`/`AUTH_GITHUB_SECRET`. `DATABASE_PATH` is optional — unset means in-memory SQLite.

## Next.js version warning

`apps/web` runs Next.js 16.2.10 + React 19. Per `apps/web/AGENTS.md`: this version has breaking changes from older Next.js — APIs, conventions, and file structure may differ from training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing Next.js code. `params`/`searchParams` are Promises in App Router routes here.

## Architecture

pnpm monorepo, three packages:

| Package | Role | Constraint |
|---|---|---|
| `apps/web` | Next.js App Router: SSR profile pages, settings UI, API routes, Auth.js GitHub OAuth, DB, sync engine | — |
| `packages/widget` (`@contrib-stack/widget`) | Framework-free vanilla-TS + SVG `<contrib-stack>` web component; Vite IIFE build → `widget.js` | no framework deps; gzip budget 15 KB enforced by `scripts/size-check.mjs` at build |
| `packages/connectors` (`@contrib-stack/connectors`) | Source-pull logic (GitHub GraphQL, GitLab events); backfill/refresh loops | must NOT import Next.js — pure logic |

### One rendering path
The profile page and every external embed mount the **same** `<contrib-stack>` web component from `widget.js`. There is no separate server-rendered heatmap — avoid re-implementing rendering in `apps/web`. `next.config.ts` copies `packages/widget/dist/widget.js` into `apps/web/public/widget.js` at build with a content-hash for cache busting, so the widget must be built before/with web.

### SSR calls route handlers directly
`apps/web/src/app/[handle]/page.tsx` imports and invokes the `GET` handler from `api/profile/[handle]/route.ts` in-process (not an HTTP fetch). When changing the profile API shape, both the route and the page consume it.

### Data model — one fact table
SQLite via Drizzle + better-sqlite3. Schema: `apps/web/src/db/schema.ts`; migrations: `apps/web/drizzle/`. Auth.js tables share the same DB via the Drizzle adapter.

- **`daily_counts` (connection_id, date, count)** is the only fact table. Every source type — github, gitlab, ingest — lands here. **A layer = a connection**, not a platform.
- `connections.credential_encrypted` = AES-256-GCM PAT (git sources); `api_key_hash` = SHA-256 of ingest key. `base_url` null = cloud host.
- DB access is a lazy singleton via `getDb()` (`src/db/client.ts`); `createDb()` defaults to `:memory:`.

### Sync engine (`apps/web/src/sync/`)
Single node, in-process, no queue — single-writer is accepted by design (scale path is Turso/libSQL).
- **Backfill**: fire-and-forget on connection create (`startBackfill`), status `backfilling` → `ok`/`error`, iterates connector year-window batches into `daily_counts`.
- **Stale-while-revalidate**: `GET /api/profile/:handle` always serves persisted data immediately, then kicks `refreshIfStale` (trailing 35 days) if `last_synced_at` older than the stale threshold. `connectionMutex` (in-memory) prevents refresh stampedes per connection. Refresh failures serve stale silently.
- **Manual resync** deletes the connection's `daily_counts` and re-runs backfill.

### Connectors
Interface in `packages/connectors/src/types.ts`: `validate` (on save), `backfill` (async-iterable year windows), `refresh` (trailing N days). GitHub uses the GraphQL `contributionsCollection` calendar (pre-bucketed, taken as-is); GitLab pages `/users/:id/events` and buckets timestamps into the user's timezone server-side (so the GitLab connector is constructed per-user via `makeGitlabConnector(timezone)`). Ingest has no connector — external agents push pre-bucketed daily counts to `/api/ingest`.

### Security invariants
- PATs decrypted only inside the connector/sync layer (`lib/crypto.ts`), never sent to the client, never logged.
- Ingest keys stored hashed only; plaintext (`csk_…`) returned once at creation. A leaked key writes one layer of one profile.
- Private profiles return the **same 404** as an unknown handle on the public API — don't leak existence.
- New OAuth users start with a `__pending__` handle and are redirected to `/welcome` to claim one; handle rules in `lib/handle.ts`.

## Test conventions
- Vitest runs in the `node` environment for `apps/web`; `e2e/**` is excluded from Vitest (Playwright only). Widget tests use jsdom.
- API-route tests build a fresh in-memory SQLite by exec'ing the migration SQL from `apps/web/drizzle/`, then `vi.mock("@/db/client")` and `vi.mocked(getDb).mockReturnValue(db)` to inject it. Follow this pattern for new route tests rather than hitting a real file DB.
- Connector tests use recorded fixtures; no live API calls.

## Deploy
Railway single node, built from the root `Dockerfile` (multi-stage, `output: "standalone"`). Litestream continuously replicates the SQLite file to Cloudflare R2; `docker-entrypoint.sh` restores from R2 on first boot if the DB is missing, then runs Next under `litestream replicate`. `DATABASE_PATH` points at a mounted volume in production.
