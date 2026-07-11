# ContribStack — Decision Log

Decisions from the grilling + brainstorming sessions, 2026-07-11. Each entry: decision, options considered, reasoning.

## D1. Product form: hosted multi-user web app with embeddable widget

- Options: local-first tool / hosted web app / static site generator.
- **Decision: hosted web app.** Core use case is a public profile embeddable into other sites via a simple HTML/JS scriptlet.

## D2. AI coding tools (Claude Code, Codex, Cursor): dropped from MVP

- Preferred mechanism was API pull ("live on request, or at least daily"). Local-log upload options were rejected.
- Research verdict (3 parallel web-research passes, 2026-07-11):
  - **Claude Code**: no individual API. Analytics API requires org admin key; docs state "unavailable for individual accounts". Internal endpoints (`api.anthropic.com/api/oauth/usage`, `claude.ai/api/organizations/*/usage`) are undocumented and third-party OAuth use violates Anthropic consumer ToS (enforced — OpenClaw/OpenCode bans).
  - **Codex**: no individual API. Enterprise-only analytics (`api.chatgpt.com/v1/analytics/codex`, admin-granted scope). Internal `wham/usage` endpoint returns only current rate-limit snapshots, no historical daily ledger; scraping violates OpenAI ToS.
  - **Cursor**: no individual API, staff-confirmed. Admin/Analytics APIs are Business/Enterprise-only. Dashboard cookie scraping violates Cursor ToS §1.5.
- **Decision: drop all three from MVP.** Building on ToS-violating endpoints risks breakage and user account bans.
- Mitigation: generic ingest API (D3) keeps the door open for future connectors.

## D3. Generic ingest API as the extension point

- Options: drop AI tools entirely / local-log push agent / git-only MVP with AI-ready ingest API.
- **Decision: git-only MVP + generic `POST /ingest` endpoint** taking `{date, source, count}` with per-user API key. Any future connector (local-push CLI, official vendor API, community-built) plugs in without server changes. If vendors ship personal usage APIs later, connectors swap from push to pull behind the same contract.

## D4. Git platform auth: user-supplied PAT

- Options: public-data only / user-supplied PAT / OAuth apps per platform.
- **Decision: PAT.** Full activity including private repos, no OAuth app registration per platform.
- Consequences: tokens encrypted at rest (AES-256-GCM), read-only scopes documented, never logged or sent to client.

## D5. MVP sources: GitHub + GitLab; Bitbucket post-MVP

- GitHub: GraphQL `contributionsCollection` returns the contribution calendar directly. Trivial.
- GitLab: user events API, aggregated server-side to daily counts. Straightforward.
- Bitbucket: no activity/calendar API; daily counts require crawling every repo for commits/PRs. Disproportionate effort, would force a background-job system into the MVP.
- **Decision: GitHub + GitLab now; Bitbucket later via the same connector interface.**

## D6. Contribution semantics: platform-native, no normalization

- **Decision: each source keeps its own definition of "contribution".** Overlay design never merges counts across sources, so cross-platform comparability is not needed; only per-source day intensity matters.

## D7. Heatmap rendering: split-cell + layer toggles

- Options: split cell / stacked per-source rows / dominant color + hover / layer toggles.
- **Decision: split-cell default (per-source stripes, platform signature color, shade = intensity) combined with legend-chip layer toggles** (click chip to isolate/hide a source). Hover tooltip shows exact per-source counts.
- Reasoning: keeps single unified-profile identity (vs stacked rows), stays legible, toggle interaction makes the embed feel alive.

## D8. Identity and privacy

- **Sign-in: GitHub OAuth, identity only.** Audience all has GitHub; no password infrastructure. Contribution data still flows via PATs (D4).
- **Handle claimed at signup** → `contribstack.app/<handle>`; embed targets the handle.
- **Profiles public by default** with a per-profile private toggle. Embedding requires anonymous public read. Known exposure: public heatmap reveals activity rhythm; toggle covers it.

## D9. Data lifecycle: persist forever, refresh trailing window

- Daily counts persisted permanently (user × connection × date). History accumulates; past not re-pulled.
- Full backfill once at connector setup (loop year-windows back to account creation).
- On profile/embed request: refresh only trailing ~35 days when cache older than 10 minutes. Request-triggered; no cron.
- Manual "full resync" button covers history-mutating edge cases (rebases, backdated commits).
- Reasoning: GitHub GraphQL returns max 1 year per query; multi-year on every view is wasteful. This design keeps "live on request" at one cheap API call per source.

## D10. Database: SQLite

- **Decision: SQLite** (user choice, cost-driven). Consequence accepted: single-node deployment. Scale-out later via Turso/libSQL if ever needed.

## D11. Embed mechanics: web component only

- Options: iframe / web component / both.
- **Decision: web component** — `<script src=".../widget.js">` + `<contrib-stack user="handle">`, shadow DOM, inline SVG, auto-sizing, attributes for theme/range/sources, fetches public JSON over open CORS.
- Embed shows the full interactive widget (toggles, tooltips) for the current rolling year, without year navigation; click-through to full profile.
- Reasoning: same component powers the profile page — one rendering path. iframe fallback only if a CSP wall actually materializes.

## D12. Profile page UX

- Year-at-a-time 53-week heatmap; year list for navigation back to earliest data. No month zoom (hover tooltips cover exact values).
- Stat tiles: current streak, longest streak, total active days, per-source totals (platform colors). Streak counts activity on any connected source. Tiles recompute per selected year; "All" tab for lifetime.
- Legend row of platform chips (color swatch + count) doubles as layer toggles; toggles also filter stat tiles.

## D13. Tech stack

- Next.js (App Router) + TypeScript; SSR profile pages; API routes for ingest/profile JSON.
- Widget: framework-free vanilla TS + SVG, Vite lib build → self-contained `widget.js` (~10–15 KB target). Profile page mounts the same web component.
- Drizzle ORM + better-sqlite3. Auth.js for GitHub OAuth.
- **Hosting: Railway** single node + volume (user choice; swapped from Fly). Litestream streams SQLite backups to S3-compatible storage (Cloudflare R2).
- pnpm monorepo: `apps/web`, `packages/widget`, `packages/connectors`.

## D14. Connections as instances (multiple accounts per platform)

- Options: one connection per platform / connections as labeled instances.
- **Decision: instances.** A user has N connections, each `{platform, label, credentials}` (e.g. "github (personal)", "github (work)"). Retrofitting later is a painful migration; cost now is one label column.
- Resolved during design: **a heatmap layer = a connection**, not a platform. Color defaults to the platform signature; a second connection of the same platform auto-gets a distinguishable shade, user-changeable.

## D15. Self-hosted instances supported via base URL

- Options: cloud-only / optional base-URL field per connection.
- **Decision: optional base URL**, defaulting to the cloud host. GitLab self-managed API is identical; GitHub Enterprise nearly so. Excluding self-hosted would cut out exactly the work-account audience D14 targets.
- Documented limitation (not solved): the ContribStack server must be able to reach the instance — VPN-only corporate hosts won't work from public SaaS.

## D16. Ingest API contract

- **Custom sources are explicit ingest connections** created in the UI: user picks name + color (preset palette incl. known AI-tool signature colors), server issues an API key. Push payloads cannot invent sources; a push is scoped to its key's connection. Prevents typo-sources and garbage layers.
- **API key is per-connection**, not per-user: least privilege, individually revocable, leaked key writes only one layer of one profile.
- **Write semantics: upsert (replace)** — `[{date, count}, ...]` replaces the count per (connection, date). Idempotent; connectors can re-push windows safely. Increment would corrupt on retry.

## D17. Timezone handling

- GitHub: calendar arrives pre-bucketed by GitHub; taken as-is (users expect ContribStack to match their GitHub graph).
- GitLab: raw event timestamps bucketed into a **user-set profile timezone** (default: browser-detected at signup).
- Ingest API: plain `date` strings; bucketing is the connector's job (it sits where events occur).
- Accepted consequence: GitHub and GitLab may disagree by one day near zone boundaries; sources are separate layers, so tolerable.

## D18. Non-goals (MVP) and success criteria

- Out of scope: teams/orgs/leaderboards/cross-user comparison; badges/gamification beyond streak tiles; charts beyond heatmap; data export; OG share images; iframe fallback; Bitbucket; AI-tool connectors; native mobile apps.
- Done when: (1) sign in, claim handle, connect GitHub PAT + self-hosted GitLab + gitlab.com with full backfill; (2) profile shows overlaid multi-year heatmap with working toggles/tiles/year nav; (3) widget renders interactive rolling year on an external test page with click-through; (4) UI-created ingest connection + curl upsert appears as a new layer without deploy; (5) warm-cache profile load under ~1s; private toggle hides page and embed.

## D19. Responsive design required

- Profile page and widget must be mobile-friendly. Heatmap scrolls horizontally inside its container on narrow viewports; stat tiles reflow; touch replaces hover for tooltips. Native apps remain out of scope.
