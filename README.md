# ContribStack

ContribStack is a hosted developer-activity profile service. Each user gets a public page at `contribstack.app/<handle>` with an overlaid multi-source contribution heatmap — GitHub, GitLab, and custom ingest connections each render as their own colored layer. An embeddable `widget.js` web component lets you drop the same heatmap into any external site.

## Architecture

pnpm monorepo with three packages:

| Package | Role |
|---|---|
| `apps/web` | Next.js App Router — SSR profile pages, settings UI, API routes, Auth.js GitHub OAuth |
| `packages/widget` | Framework-free `<contrib-stack>` web component (Vite lib build → `widget.js`) |
| `packages/connectors` | Source-pull logic for GitHub and GitLab backfill/refresh |

Production runs as a single Railway node with SQLite on a persistent volume (`DATABASE_PATH`). [Litestream](https://litestream.io/) continuously replicates the database to Cloudflare R2 for backup and disaster recovery.

## Local development

**Prerequisites:** Node 22+, pnpm 10+

```bash
git clone <repo-url> contrib-stack && cd contrib-stack
pnpm install
cp .env.example apps/web/.env.local   # fill in secrets
pnpm dev                              # http://localhost:3000
```

`pnpm dev` starts the Next.js dev server. The widget is built automatically when needed.

### Environment variables

See `.env.example` for the full list. At minimum for local dev:

- `ENCRYPTION_KEY` — 32-byte key, base64-encoded (`openssl rand -base64 32`)
- `AUTH_SECRET` — random string (`openssl rand -base64 32`)
- `AUTH_GITHUB_ID` / `AUTH_GITHUB_SECRET` — GitHub OAuth app credentials
- `DATABASE_PATH` — optional; defaults to in-memory SQLite if unset

## Testing

```bash
pnpm test                    # Vitest unit tests (all packages)
pnpm --filter web e2e        # Playwright E2E (starts dev server automatically)
```

## Deploy to Railway

1. Create a Railway project and connect this repo.
2. Railway picks up `railway.json` and builds via the root `Dockerfile`.
3. Attach a volume mounted at `/data`.
4. Set environment variables from `.env.example` in the Railway dashboard:
   - `DATABASE_PATH=/data/contribstack.db`
   - `AUTH_URL` to your production domain
   - `ENCRYPTION_KEY`, `AUTH_SECRET`, GitHub OAuth credentials
   - R2 credentials for Litestream backup (`R2_ENDPOINT`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`)
5. Deploy. On first boot, `docker-entrypoint.sh` restores the DB from R2 if missing, then starts Next.js under Litestream replication.

## Ingest API

Create an ingest connection in Settings to get an API key (shown once). Push daily counts with:

```bash
curl -X POST https://contribstack.app/api/ingest \
  -H "Authorization: Bearer csk_your_api_key" \
  -H "Content-Type: application/json" \
  -d '[{"date":"2026-07-11","count":5}]'
```

The endpoint upserts counts per date for that connection. Payloads are capped at 5 000 rows and rate-limited per key.
