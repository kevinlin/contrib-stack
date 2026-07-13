# ContribStack — Design

Date: 2026-07-11. Decisions and reasoning: [requirements/decision-log.md](requirements/decision-log.md) (D1–D19).

## 1. Product summary

Hosted multi-user web app. Each user gets a public developer-activity profile at `contribstack.app/<handle>`: one interactive heatmap where every connected source renders as its own colored layer — overlaid, never merged. The same heatmap embeds into any external site via a web-component scriptlet.

MVP sources: GitHub and GitLab (cloud or self-hosted), pulled server-side with user-supplied read-only PATs. A generic ingest API accepts daily counts from any future connector (Bitbucket crawler, AI-tool push agents, community tools) without server changes.

## 2. Goals and non-goals

**Goals (success criteria)**
1. Sign in with GitHub, claim a handle, connect GitHub PAT + self-hosted GitLab + gitlab.com; full history backfills.
2. Profile shows overlaid multi-year heatmap; layer toggles, stat tiles, and year navigation work.
3. `widget.js` on an external page renders the interactive rolling-year widget with click-through to the profile.
4. An ingest connection created in the UI plus a `curl` upsert appears as a new colored layer without a deploy.
5. Warm-cache profile load under ~1s. Private toggle hides both page and embed.
6. Profile page and widget are responsive and touch-friendly.

**Non-goals (MVP)**
Teams/orgs/leaderboards; badges or gamification beyond streak tiles; charts beyond the heatmap; data export; OG share images; iframe embed fallback; Bitbucket connector; AI-tool connectors; native mobile apps.

## 3. Architecture

pnpm monorepo, three packages:

| Package | Contents | Depends on |
|---|---|---|
| `apps/web` | Next.js (App Router, TS): SSR profile pages, settings UI, API routes, Auth.js GitHub OAuth | `packages/widget`, `packages/connectors` |
| `packages/widget` | Framework-free vanilla TS + SVG web component `<contrib-stack>`; Vite lib build → self-contained `widget.js` (~10–15 KB budget) | nothing |
| `packages/connectors` | Source-pull logic (GitHub GraphQL, GitLab events), backfill/refresh loops | nothing (no Next.js imports) |

Deployment: Railway single node with volume. SQLite via Drizzle ORM + better-sqlite3. Litestream streams the DB to Cloudflare R2 for backup. Single-writer constraint accepted (D10); scale path is Turso/libSQL if ever needed.

## 4. Data model

| Table | Columns | Notes |
|---|---|---|
| `users` | id, github_id, handle (unique), timezone, is_private, created_at | timezone default browser-detected at signup (D17) |
| `connections` | id, user_id, slug, type (`github`\|`gitlab`\|`ingest`), label, color, base_url, credential_encrypted, api_key_hash, status (`ok`\|`backfilling`\|`error`), last_synced_at, created_at | slug: URL-safe, derived from label, unique per user — referenced by the widget `sources` attribute. base_url null = cloud host (D15). credential_encrypted: AES-256-GCM PAT, null for ingest. api_key_hash: ingest only, key shown once at creation (D16) |
| `daily_counts` | connection_id, date, count; PK (connection_id, date) | the only fact table; all source types land here |
| Auth.js tables | via Drizzle adapter | sessions/accounts |

**Layer = connection** (not platform). Color defaults to the platform signature (GitHub green, GitLab orange); a second connection of the same platform auto-gets a distinguishable shade; user can change any color from a preset palette (includes known AI-tool signature colors for future ingest connections).

## 5. API surface

| Route | Auth | Behavior |
|---|---|---|
| `GET /api/profile/:handle?year=` | none, open CORS | Profile meta + per-connection daily counts for the year (or rolling year). Private profile → same response as unknown handle. Triggers stale-refresh (§7) |
| `POST /api/ingest` | `Authorization: Bearer <connection API key>` | Body `[{date, count}, ...]`. Upsert: replaces count per (connection, date) — idempotent (D16). Validates ISO dates and count ≥ 0; caps payload size; rate-limits per key; atomic per request (all rows or none) |
| `GET /api/health` | none | `{ "status": "ok" }`, `Cache-Control: no-store`. Railway health check target |
| `POST /api/admin/connections` | `Authorization: Bearer <ADMIN_API_KEY>` | Create a GitHub/GitLab connection for a user. Body: `{ handle, type, label, token, baseUrl?, createdAt? }`. Validates token against the source API, starts backfill. Disabled when `ADMIN_API_KEY` unset |
| `DELETE /api/admin/connections` | `Authorization: Bearer <ADMIN_API_KEY>` | Delete a connection by handle + slug. Body: `{ handle, slug }`. Cascades `daily_counts` |
| `/settings` (page) | Auth.js session (server gate) | `auth()` in page component; unauthenticated → redirect to sign-in; pending handle → redirect to `/welcome` (fixes criterion-1 defect). Signed-in header shows handle, "View profile" link, and sign-out button (server action deletes DB session) |
| Settings routes | Auth.js session | Connection CRUD (PAT validated against the source API on save), color/label edit, full resync, privacy toggle, handle claim, timezone |
| `/widget.js` | none | Static widget bundle, long-cache with hash busting |

## 6. Connectors

Common interface in `packages/connectors`:

```ts
interface Connector {
  validate(creds, baseUrl): Promise<AccountInfo>   // called on save
  backfill(creds, baseUrl, since): AsyncIterable<DailyCount[]>  // year windows
  refresh(creds, baseUrl, window): Promise<DailyCount[]>        // trailing ~35 days
}
```

- **GitHub**: GraphQL `contributionsCollection` — returns the contribution calendar pre-bucketed by GitHub; taken as-is (D17). Backfill loops 1-year windows back to `createdAt`. Works for github.com and GHE via base_url.
- **GitLab**: `GET /users/:id/events` paged, timestamps bucketed into the user's profile timezone server-side. Native event definition, no normalization (D6). Works for gitlab.com and self-managed via base_url.
- **Ingest**: no connector code — external agents push pre-bucketed dates.

Known limitation (documented, not solved): the server must be able to reach self-hosted instances; VPN-only hosts won't work.

## 7. Sync engine

- **Persist forever**: `daily_counts` rows are permanent; history never re-pulled (D9).
- **Backfill** on connection create: fire-and-forget async loop over year windows, `status = backfilling`, progress polled by the settings UI. No queue system — single node, in-process.
- **Stale-while-revalidate** on profile/embed requests: always serve persisted data immediately; if `last_synced_at` > 10 min, kick a background refresh of the trailing 35 days. Per-connection in-process mutex prevents stampedes.
- **Manual full resync** button in settings covers history-mutating cases (rebases, backdated commits).

## 8. Profile page UX

- Year-at-a-time 53-week heatmap; year list navigates back to earliest data. No month zoom.
- **Split-cell rendering** (D7): a day with N active layers divides into N stripes, each in its connection color, shade = that source's intensity for the day. Hover/tap tooltip lists exact per-connection counts.
- **Legend chips** = one per connection (color swatch + label + total). Click toggles/isolates layers; toggles also filter stat tiles.
- **Stat tiles**: current streak, longest streak, total active days, per-connection totals. Streak = activity on any visible connection (D12). Tiles recompute per selected year; "All" tab = lifetime.
- Responsive (D19): heatmap fixed cell size scrolling horizontally in its container (auto-scrolled to most recent); tiles reflow 4→2 columns; touch tap replaces hover.

## 9. Embed widget

### Quick start

Add two lines to any HTML page:

```html
<script src="https://contribstack.app/widget.js" async></script>
<contrib-stack user="kevinlin"></contrib-stack>
```

The widget auto-detects the ContribStack API origin from its own script URL — no extra configuration needed when loading from the canonical host.

### Attributes

| Attribute | Required | Default | Description |
|-----------|----------|---------|-------------|
| `user` | yes | — | The ContribStack handle to display |
| `theme` | no | `auto` | `light`, `dark`, or `auto` (follows `prefers-color-scheme`) |
| `sources` | no | all | Comma-separated connection slugs to display (e.g. `github-personal,gitlab-work`) |
| `range` | no | `1y` | `1y` (rolling year), a 4-digit year (`2025`), or `all` (lifetime) |
| `api` | no | script origin | Override the API base URL (see below) |
| `link` | no | `on` | Set `off` to disable click-through to the profile page |

### API origin resolution

The widget determines where to fetch profile data in this priority order:

1. **Explicit `api` attribute** — use when self-hosting or proxying: `<contrib-stack user="me" api="https://my-instance.example.com">`
2. **Script origin** — automatically derived from the `<script src="...">` URL at load time. This is the standard path: loading the script from `https://contribstack.app/widget.js` makes all API calls go to `https://contribstack.app`.
3. **Page origin** — fallback when the script origin cannot be determined (e.g. inline bundles). Uses `location.origin`.

### Full external embedding example

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>My Portfolio</title>
  <script src="https://contribstack.app/widget.js" async></script>
</head>
<body>
  <h1>My Contributions</h1>

  <!-- All sources, auto theme, rolling year -->
  <contrib-stack user="kevinlin"></contrib-stack>

  <!-- Filtered to one source, dark theme -->
  <contrib-stack user="kevinlin" theme="dark" sources="github-personal"></contrib-stack>

  <!-- Specific year, explicit API for a self-hosted instance -->
  <contrib-stack user="kevinlin" range="2025" api="https://my-contribstack.example.com"></contrib-stack>
</body>
</html>
```

### How it works

- The `<script>` registers a `<contrib-stack>` custom element. Any matching element in the DOM (present or future) upgrades automatically.
- On upgrade, the widget fetches `GET {api}/api/profile/{user}?...` (open CORS, no auth required for public profiles).
- Rendering uses Shadow DOM — host-page styles cannot leak in; the widget's styles cannot leak out.
- Split-cell SVG: a day with N active layers divides into N vertical stripes, each in its connection color, shade = intensity level.
- Interactive: legend chips toggle/isolate layers and recompute stat tiles; tooltip on hover (desktop) or tap (touch) shows per-connection counts.
- Click-through: cells/header link to the profile page in a new tab (disabled when `link="off"`, as on the profile page itself).

### CORS

The profile API returns `Access-Control-Allow-Origin: *` on all responses, enabling cross-origin fetches from any embedding domain. No preflight is triggered because the widget uses a simple GET request with no custom headers.

### Profile page integration

The profile page at `/{handle}` mounts the same `<contrib-stack>` component with `link="off"` — one rendering path, no drift (D11). The widget is loaded from `/widget.js` with immutable cache headers (content-hash ETag).

## 10. Security

- PATs encrypted at rest with AES-256-GCM; key from environment; decrypted only inside the connector layer; never sent to the client; never logged. Users instructed to create read-only, minimal-scope tokens.
- Ingest API keys stored hashed (SHA-256); plaintext shown once at creation. Per-connection scope: a leaked key writes one layer of one profile, nothing else (D16).
- Private profiles indistinguishable from nonexistent handles on the public API.
- Standard rate limiting on public endpoints.

## 11. Error handling

- Failed PAT / source API error → connection `status = error`, banner in settings; profile keeps serving persisted history. Degrade, never blank.
- Rate-limited pull → skip the refresh, serve stale.
- Ingest: invalid payload rejected atomically with a specific error message.

## 12. Testing

- **Unit**: streak and aggregation math, split-cell layout, upsert idempotency, encryption round-trip.
- **Connector**: recorded API fixtures (GitHub GraphQL, GitLab events); no live calls in CI.
- **E2E (Playwright)**: mocked sign-in → connect source → profile renders → external embed test page renders widget. Authenticated settings flow: auth gate redirect, pending-handle redirect, account bar, connection add/delete, sign-out.
- **CI budget check**: widget bundle size.

## 13. Deployment

Railway single node, root `Dockerfile` (multi-stage: pnpm build → node runtime + Litestream binary). One service, one replica, persistent volume at `/data` for SQLite. Public domain generated by Railway; no custom domain.

**Container startup sequence:**
1. Validate required environment variables (fail-fast, no credential logging).
2. Restore SQLite from Cloudflare R2 via Litestream if the volume has no database.
3. Apply Drizzle migrations.
4. Start Next.js under `litestream replicate`.

Expected SIGTERM shutdowns (Railway deployment rotation) are normalized to exit 0 so the platform does not report them as crashes.

**Backup:** Litestream continuously replicates the SQLite WAL to a dedicated Cloudflare R2 bucket (`contribstack-production`). On first boot (empty volume), Litestream restores from R2 before the app starts.

**CI/CD (GitHub Actions):**
- PR / push to `main`: install → lint → unit/integration tests → migration test → build → Playwright E2E.
- Push to `main` (CI green): deploy committed `Dockerfile` to Railway via project token. Serialized via concurrency group — no overlapping production deployments.
- Railway repository auto-deploy is disabled; all production deploys originate from GitHub Actions.

**Runtime configuration** (Railway variables, never committed):
`DATABASE_PATH`, `ENCRYPTION_KEY`, `AUTH_SECRET`, `AUTH_GITHUB_ID`, `AUTH_GITHUB_SECRET`, `AUTH_URL`, `R2_ENDPOINT`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `ADMIN_API_KEY`.

A git-ignored root `.env` (mode 600) holds a recovery copy of generated credentials.

**Failure handling:**
- Failed health check → Railway does not promote the deployment.
- Failed startup migration → process exits before serving.
- R2 restore/replication failure → stop deployment; fix backup configuration before accepting user data.
- Rollback = redeploy a previously verified Git revision through the same GitHub Actions path.
- Volume preserved across rollbacks. Single replica enforced (SQLite + in-process mutex).

**Out of scope:** custom domain (`contribstack.app`), multiple replicas, horizontal scaling, migrating SQLite to another database engine.

## 14. Homepage

The root page identifies ContribStack, explains the multi-source contribution profile in one paragraph, and provides three actions: sign in with GitHub (via Auth.js to `/welcome`), view the deployed example profile, and go to settings (server-guarded — unauthenticated users are redirected to sign-in). Local CSS, responsive, production metadata replacing Create Next App defaults.
