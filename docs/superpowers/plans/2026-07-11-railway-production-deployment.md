# Railway Production Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deploy ContribStack through GitHub Actions to a new single-replica Railway service with persistent SQLite storage, Litestream backups in a new Cloudflare R2 bucket, production GitHub OAuth, and a local git-ignored credential copy.

**Architecture:** Harden the existing container with a health endpoint and fail-fast migration startup, then add a GitHub Actions verification and deployment workflow. Railway hosts one container and a `/data` volume; Litestream restores and replicates SQLite to R2; Railway remains the runtime secret store while root `.env` is the local recovery copy.

**Tech Stack:** Node.js 22, pnpm 10.31.0, Next.js 16.2.10, Vitest, Playwright, Docker, GitHub Actions, Railway, SQLite, Drizzle ORM, Litestream 0.3.13, Cloudflare R2, GitHub OAuth.

## Global Constraints

- Read `docs/specs/design.md` and `docs/superpowers/specs/2026-07-11-railway-production-deployment-design.md` before execution.
- Run exactly one Railway application replica.
- Mount the Railway volume at `/data` and set `DATABASE_PATH=/data/contribstack.db`.
- Never print or commit secret values.
- Store a recovery copy of generated credentials in root `.env`, set mode `600`, and confirm Git ignores it.
- Keep application secrets in Railway; store only the Railway project deployment token in GitHub Actions.
- All production deployments must originate from the GitHub Actions deployment job after verification passes.
- Do not delete, replace, or restore over the production database during verification.
- Use the Railway-provided public domain. Custom domain setup is out of scope.

---

### Task 1: Establish the verified baseline

**Files:**
- Inspect: `package.json`
- Inspect: `apps/web/package.json`
- Inspect: `Dockerfile`
- Inspect: `railway.json`

**Interfaces:**
- Consumes: current `main` branch at the approved deployment-design commits.
- Produces: recorded proof that the existing application is green before deployment changes.

- [ ] **Step 1: Confirm the worktree is clean and record the revision**

Run: `git status --short && git rev-parse HEAD`

Expected: no status entries; one commit SHA.

- [ ] **Step 2: Install the locked dependency graph**

Run: `pnpm install --frozen-lockfile`

Expected: exit 0 and no lockfile changes.

- [ ] **Step 3: Run lint, tests, and production build**

Run: `pnpm lint && pnpm test && pnpm build`

Expected: all commands exit 0; widget size check stays below 15 KB gzip.

- [ ] **Step 4: Run Playwright E2E tests**

Run: `pnpm --filter web exec playwright install chromium && pnpm --filter web e2e`

Expected: all six E2E specs pass.

No commit is required for this verification-only task.

---

### Task 2: Add the production health endpoint

**Files:**
- Create: `apps/web/src/app/api/health/route.ts`
- Create: `apps/web/src/app/api/health/route.test.ts`
- Modify: `railway.json`

**Interfaces:**
- Consumes: Next.js App Router route-handler conventions for Next.js 16.2.10.
- Produces: `GET /api/health` returning HTTP 200 with `{ "status": "ok" }`; Railway health check at `/api/health`.

- [ ] **Step 1: Write the failing route test**

```ts
import { describe, expect, it } from "vitest";
import { GET } from "./route";

describe("GET /api/health", () => {
  it("returns an uncached healthy response", async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({ status: "ok" });
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `pnpm --filter web exec vitest run src/app/api/health/route.test.ts`

Expected: FAIL because `./route` does not exist.

- [ ] **Step 3: Implement the minimal route**

```ts
export function GET(): Response {
  return Response.json(
    { status: "ok" },
    { headers: { "Cache-Control": "no-store" } },
  );
}
```

- [ ] **Step 4: Configure Railway health checking**

Add to `railway.json` under `deploy`:

```json
"healthcheckPath": "/api/health",
"healthcheckTimeout": 120
```

Keep the existing restart policy unchanged.

- [ ] **Step 5: Verify the endpoint and configuration**

Run: `pnpm --filter web exec vitest run src/app/api/health/route.test.ts && pnpm --filter web build`

Expected: test passes and Next.js lists `/api/health` in the build output.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/api/health/route.ts apps/web/src/app/api/health/route.test.ts railway.json
git commit -m "feat: add deployment health check"
```

---

### Task 3: Apply database migrations safely at container startup

**Files:**
- Create: `apps/web/scripts/migrate.mjs`
- Create: `apps/web/scripts/migrate.node-test.mjs`
- Create: `.dockerignore`
- Modify: `apps/web/package.json`
- Modify: `Dockerfile`
- Modify: `docker-entrypoint.sh`

**Interfaces:**
- Consumes: `DATABASE_PATH` and migration files copied to `/app/apps/web/.next/standalone/drizzle`.
- Produces: `pnpm --filter web migrate` locally; production startup that validates variables, creates the DB directory, restores if needed, migrates, then runs Next.js under Litestream.

- [ ] **Step 1: Write the failing migration integration test**

Create `apps/web/scripts/migrate.node-test.mjs`:

```js
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import Database from "better-sqlite3";

test("applies migrations to an empty database and can run again", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "contrib-stack-migrate-"));
  const databasePath = path.join(directory, "contribstack.db");
  const env = { ...process.env, DATABASE_PATH: databasePath };

  try {
    execFileSync(process.execPath, ["scripts/migrate.mjs"], { env });
    execFileSync(process.execPath, ["scripts/migrate.mjs"], { env });

    const sqlite = new Database(databasePath, { readonly: true });
    try {
      const tableNames = sqlite
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
        .all()
        .map(({ name }) => name);

      for (const name of [
        "__drizzle_migrations",
        "connections",
        "daily_counts",
        "users",
      ]) {
        assert.ok(tableNames.includes(name), `missing table: ${name}`);
      }
    } finally {
      sqlite.close();
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `cd apps/web && node --test scripts/migrate.node-test.mjs`

Expected: FAIL because `scripts/migrate.mjs` does not exist.

- [ ] **Step 3: Implement the migration runner**

Create `apps/web/scripts/migrate.mjs`:

```js
import Database from "better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { mkdirSync } from "node:fs";
import path from "node:path";

const databasePath = process.env.DATABASE_PATH;
if (!databasePath) throw new Error("DATABASE_PATH is required");

mkdirSync(path.dirname(databasePath), { recursive: true });
const sqlite = new Database(databasePath);
try {
  migrate(drizzle(sqlite), {
    migrationsFolder: path.resolve(process.cwd(), "drizzle"),
  });
} finally {
  sqlite.close();
}
```

Add to `apps/web/package.json`:

```json
"migrate": "node scripts/migrate.mjs",
"test:migrate": "node --test scripts/migrate.node-test.mjs"
```

- [ ] **Step 4: Run the migration test twice**

Run: `pnpm --filter web test:migrate`

Expected: the test passes after applying migrations twice to the same database, proving initial migration and idempotent re-entry.

- [ ] **Step 5: Copy runtime migration assets into the standalone image**

Add these lines after the standalone copy in `Dockerfile`:

```dockerfile
COPY --from=build /app/apps/web/drizzle ./apps/web/.next/standalone/drizzle
COPY --from=build /app/apps/web/scripts/migrate.mjs ./apps/web/.next/standalone/migrate.mjs
```

- [ ] **Step 6: Harden the entrypoint**

Replace `docker-entrypoint.sh` with logic that checks all required variables by name without printing values, creates the database directory, restores, migrates from the standalone working directory, then starts replication:

```sh
#!/bin/sh
set -eu

for name in DATABASE_PATH ENCRYPTION_KEY AUTH_SECRET AUTH_GITHUB_ID AUTH_GITHUB_SECRET AUTH_URL R2_ENDPOINT R2_BUCKET R2_ACCESS_KEY_ID R2_SECRET_ACCESS_KEY; do
  eval "value=\${$name:-}"
  if [ -z "$value" ]; then
    echo "Missing required environment variable: $name" >&2
    exit 1
  fi
done

mkdir -p "$(dirname "$DATABASE_PATH")"
litestream restore -if-db-not-exists -config /app/litestream.yml "$DATABASE_PATH"

cd /app/apps/web/.next/standalone
node migrate.mjs
exec litestream replicate -exec "node server.js" -config /app/litestream.yml
```

- [ ] **Step 7: Verify the migration test and image build**

Run: `pnpm --filter web test:migrate`

Run: `docker build -t contrib-stack:deployment-test .`

Expected: test passes; image builds successfully and contains `migrate.mjs` and `drizzle/` beside `server.js`.

- [ ] **Step 8: Commit**

```bash
git add .dockerignore apps/web/scripts/migrate.mjs apps/web/scripts/migrate.node-test.mjs apps/web/package.json Dockerfile docker-entrypoint.sh
git commit -m "fix: run database migrations before startup"
```

---

### Task 4: Add GitHub Actions verification and Railway deployment

**Files:**
- Create: `.github/workflows/ci.yml`
- Create: `.github/workflows/deploy.yml`
- Modify: `README.md`

**Interfaces:**
- Consumes: GitHub secret `RAILWAY_TOKEN`; GitHub variables `RAILWAY_SERVICE_ID`; pushes and pull requests for `main`.
- Produces: required CI checks and serialized deployment of verified `main` revisions to the existing Railway service.

- [ ] **Step 1: Create the CI workflow**

Create `.github/workflows/ci.yml` with:

```yaml
name: CI

on:
  pull_request:
  push:
    branches: [main]

permissions:
  contents: read

jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 10.31.0
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint
      - run: pnpm test
      - run: pnpm --filter web test:migrate
      - run: pnpm build
      - run: pnpm --filter web exec playwright install --with-deps chromium
      - run: pnpm --filter web e2e
```

- [ ] **Step 2: Create the deployment workflow**

Create `.github/workflows/deploy.yml` so deployment runs only after the `CI` workflow succeeds for `main`:

```yaml
name: Deploy production

on:
  workflow_run:
    workflows: [CI]
    types: [completed]
    branches: [main]

permissions:
  contents: read

concurrency:
  group: production
  cancel-in-progress: false

jobs:
  deploy:
    if: ${{ github.event.workflow_run.conclusion == 'success' }}
    runs-on: ubuntu-latest
    environment: production
    steps:
      - uses: actions/checkout@v4
        with:
          ref: ${{ github.event.workflow_run.head_sha }}
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: npm install --global @railway/cli
      - run: railway up --ci --service "$RAILWAY_SERVICE_ID"
        env:
          RAILWAY_TOKEN: ${{ secrets.RAILWAY_TOKEN }}
          RAILWAY_SERVICE_ID: ${{ vars.RAILWAY_SERVICE_ID }}
```

- [ ] **Step 3: Document pipeline ownership and secrets**

Update `README.md` to state that GitHub Actions deploys verified `main` commits, list `RAILWAY_TOKEN` and `RAILWAY_SERVICE_ID` as GitHub configuration, and state that Railway repository auto-deploy must be disabled.

- [ ] **Step 4: Validate workflow syntax and local checks**

Run: `pnpm lint && pnpm test && pnpm --filter web test:migrate && pnpm build && git diff --check`

Expected: all commands exit 0. Inspect both workflows with GitHub's workflow parser after push; do not treat local YAML parsing alone as sufficient.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/ci.yml .github/workflows/deploy.yml README.md
git commit -m "ci: verify and deploy through GitHub Actions"
```

---

### Task 5: Verify the production container locally

**Files:**
- Create locally, ignored: `.env`
- Use: `Dockerfile`
- Use: `litestream.yml`
- Use: `docker-entrypoint.sh`

**Interfaces:**
- Consumes: temporary R2 credentials or the newly created R2 credentials after Task 6.
- Produces: evidence that startup, migration, health, persistence, and restart behavior work before production accepts data.

- [ ] **Step 1: Confirm `.env` is ignored before writing it**

Run: `git check-ignore -v .env`

Expected: `.gitignore` matches `.env`.

- [ ] **Step 2: Create the local credential file without printing values**

Create root `.env` with the exact keys from `.env.example`. Generate `ENCRYPTION_KEY` and `AUTH_SECRET` with a cryptographically secure generator. Use placeholder OAuth and R2 values only until provider resources exist. Never display the file.

Run: `chmod 600 .env && stat -f '%Lp' .env && git status --short`

Expected: mode `600`; `.env` absent from Git status.

- [ ] **Step 3: Build and start with a named volume**

Run: `docker build -t contrib-stack:deployment-test .`

Run the container with `--env-file .env`, a named volume mounted at `/data`, and port `3000`. Use the real R2 values once Task 6 is complete.

Expected: logs show restore check, migration completion, Litestream replication, and Next.js ready without showing credentials.

- [ ] **Step 4: Verify health and schema**

Run: `curl --fail --silent http://localhost:3000/api/health`

Expected: `{"status":"ok"}`.

- [ ] **Step 5: Verify persistence across restart**

Create non-secret test data through the application or SQLite, stop the container, then start a new container against the same named volume.

Expected: health passes and test data remains.

- [ ] **Step 6: Stop the local container without deleting the volume**

Expected: the container stops; the named volume remains available for inspection until production verification finishes.

No commit is required for local environment data or verification output.

---

### Task 6: Create R2, Railway, OAuth, and local credential resources

**Files:**
- Modify locally, ignored: `.env`

**Interfaces:**
- Consumes: signed-in Cloudflare, Railway, and GitHub browser sessions.
- Produces: R2 bucket and scoped token, Railway project/service/volume/domain, GitHub OAuth app, Railway runtime variables, local credential copy, and Railway deployment token.

- [ ] **Step 1: Create Cloudflare R2 storage**

In Cloudflare, create a bucket named `contribstack-production`. Create an R2 API token restricted to Object Read & Write for this bucket. Record the S3 endpoint, bucket name, access key ID, and secret access key directly into root `.env` without echoing them.

Expected: the token cannot administer unrelated Cloudflare resources.

- [ ] **Step 2: Create the Railway project and service**

Create project `contrib-stack`, add a service sourced from `kevinlin/contrib-stack`, select the root `Dockerfile`, and disable repository-triggered auto-deploy so GitHub Actions owns deployment.

Expected: one service exists with no replicas beyond the default one.

- [ ] **Step 3: Attach persistent storage and create a domain**

Attach a Railway volume mounted at `/data`. Generate the Railway public domain and record the complete HTTPS origin as `AUTH_URL` in `.env`.

Expected: `DATABASE_PATH=/data/contribstack.db` is inside the mounted volume.

- [ ] **Step 4: Create the GitHub OAuth app**

Create a GitHub OAuth app named `ContribStack Production` with homepage `<AUTH_URL>` and callback `<AUTH_URL>/api/auth/callback/github`. Record the client ID and generated client secret directly in `.env`.

- [ ] **Step 5: Configure Railway runtime variables**

Copy the required application values from `.env` into Railway variables without logging them. Confirm the variable names match `.env.example` exactly.

- [ ] **Step 6: Create the Railway project deployment token**

Create a token scoped to the ContribStack Railway project. Keep a recovery copy in `.env` as `RAILWAY_TOKEN`; do not add it to `.env.example` because it is pipeline administration, not application runtime configuration.

- [ ] **Step 7: Verify local secret safety**

Run: `chmod 600 .env && git check-ignore .env && git status --short`

Expected: exit 0; `.env` is not listed by Git.

No repository commit is required for provider resources or `.env`.

---

### Task 7: Configure GitHub and deploy through the pipeline

**Files:**
- Use: `.github/workflows/ci.yml`
- Use: `.github/workflows/deploy.yml`

**Interfaces:**
- Consumes: Railway project token and service ID from Task 6.
- Produces: GitHub production environment, Actions secret/variable, passing CI, and a Railway deployment created by GitHub Actions.

- [ ] **Step 1: Create the GitHub production environment**

Create environment `production`. Add secret `RAILWAY_TOKEN` and variable `RAILWAY_SERVICE_ID`. Do not add application or R2 secrets to GitHub.

- [ ] **Step 2: Push the verified commits to `main`**

Run: `git status --short && git log --oneline -5`

Expected: clean worktree and the health, migration, and CI commits are present.

Run: `git push origin main`

Expected: push succeeds and triggers the `CI` workflow.

- [ ] **Step 3: Verify CI before deployment**

Inspect the GitHub Actions run for the pushed SHA.

Expected: install, lint, unit/integration tests, build, and all Playwright E2E tests pass. If any check fails, diagnose and fix it in a new commit; do not bypass the gate.

- [ ] **Step 4: Verify the deployment run**

Expected: `Deploy production` checks out the exact successful CI SHA, uploads it to the intended Railway service, and completes successfully. Confirm Railway shows the same revision and exactly one healthy replica.

---

### Task 8: Verify production, backup, and restore

**Files:**
- Modify: `docs/specs/plan.md`
- Never modify or commit: `.env`

**Interfaces:**
- Consumes: deployed Railway URL and authorized production test accounts/credentials.
- Produces: current-instance production verdict, isolated backup restore proof, and recorded success-criteria results.

- [ ] **Step 1: Verify public runtime endpoints**

Run against the Railway URL:

```bash
curl --fail --silent "$AUTH_URL/api/health"
curl --fail --silent --output /dev/null "$AUTH_URL/"
curl --fail --silent --output /dev/null "$AUTH_URL/widget.js"
```

Expected: all exit 0; health returns `{"status":"ok"}`.

- [ ] **Step 2: Verify OAuth and profile creation**

Sign in with GitHub, complete the production callback, claim a handle, and load its public profile.

Expected: the callback returns to the Railway domain; the claimed profile renders.

- [ ] **Step 3: Verify connection and ingest flows**

Create a GitHub connection with a read-only PAT and wait for backfill. Where reachable credentials are available, test gitlab.com and a self-hosted GitLab connection. Create an ingest connection, submit one dated count with its one-time key, and confirm the new layer appears without redeployment.

- [ ] **Step 4: Verify widget, interaction, and privacy**

Open `/embed-test.html`, verify layer toggles, tooltip/tap behavior, stat recomputation, and profile click-through. Enable privacy and confirm both the public profile API and page match the unknown-handle 404 behavior; then restore the intended privacy setting.

- [ ] **Step 5: Verify Railway volume persistence**

Restart the Railway service without removing the volume.

Expected: health returns after restart and the claimed user, connection metadata, and daily counts remain.

- [ ] **Step 6: Verify R2 replication**

Confirm the bucket contains a Litestream replica for `contribstack.db` with current generations/snapshots after database writes.

- [ ] **Step 7: Perform an isolated restore test**

Run Litestream restore to a temporary local path or a separate temporary volume, never to `DATABASE_PATH`. Open the restored database read-only and verify expected tables plus a known non-secret record.

Expected: restore exits 0 and the restored database is readable.

- [ ] **Step 8: Record production results**

Replace the pre-deploy-only status in `docs/specs/plan.md` with a dated production table covering all six design success criteria. State any criterion that could not be exercised and why; do not mark it passing based only on code inspection.

- [ ] **Step 9: Run final repository verification**

Run: `pnpm lint && pnpm test && pnpm --filter web test:migrate && pnpm build && git diff --check && git status --short`

Expected: code checks pass; only the production-results document is modified; `.env` remains absent.

- [ ] **Step 10: Commit the verified production record**

```bash
git add docs/specs/plan.md
git commit -m "docs: record production deployment verification"
```

- [ ] **Step 11: Push the verification record through CI/CD**

Run: `git push origin main`

Expected: CI passes and the pipeline deploys the documentation-only revision through the same controlled path.
