# Production Homepage and Shutdown Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the starter homepage and prevent expected Railway SIGTERM shutdowns from being reported as crashes.

**Architecture:** Keep the homepage as a server-rendered Next.js page with scoped CSS and existing Auth.js routes. Isolate process-status normalization in a small shell helper called by the Docker entrypoint so it can be tested without running Railway.

**Tech Stack:** Next.js 16, React 19, TypeScript, CSS Modules, Node test runner, POSIX shell, Litestream, Railway

## Global Constraints

- Work directly on `main`.
- Do not change authentication, profile, connection, database, or backup behavior.
- Translate only exit code 143 to success; preserve every other exit code.
- Deploy only through GitHub Actions.

---

### Task 1: Production homepage

**Files:**
- Modify: `apps/web/src/app/page.tsx`
- Modify: `apps/web/src/app/page.module.css`
- Modify: `apps/web/src/app/layout.tsx`
- Create: `apps/web/src/app/page.test.tsx`

**Interfaces:**
- Consumes: Auth.js route `/api/auth/signin?callbackUrl=/welcome` and public profile `/kevinlin`.
- Produces: a server-rendered root page with ContribStack content and actions.

- [ ] Write a rendering test that asserts the ContribStack heading, sign-in destination, example-profile destination, and production metadata.
- [ ] Run `pnpm --filter web exec vitest run src/app/page.test.tsx` and verify it fails against the starter page.
- [ ] Replace the starter markup, scoped styles, and Create Next App metadata with the approved landing page.
- [ ] Rerun the focused test and verify it passes.
- [ ] Commit with `fix: replace starter production homepage`.

### Task 2: Clean expected shutdowns

**Files:**
- Create: `scripts/normalize-exit-status.sh`
- Create: `scripts/normalize-exit-status.test.mjs`
- Modify: `docker-entrypoint.sh`
- Modify: `apps/web/package.json`

**Interfaces:**
- Consumes: a command and its process exit status.
- Produces: exit 0 for statuses 0 and 143; preserves all other statuses.

- [ ] Write Node tests that run the helper with child exit statuses 0, 143, and 42 and assert normalized statuses 0, 0, and 42.
- [ ] Run the focused Node test and verify it fails because the helper does not exist.
- [ ] Implement the POSIX shell helper and run Litestream through it from the entrypoint.
- [ ] Rerun the focused test and verify it passes.
- [ ] Commit with `fix: treat Railway SIGTERM as clean shutdown`.

### Task 3: Verify and deploy

**Files:**
- Modify: `docs/specs/plan.md`

**Interfaces:**
- Consumes: Tasks 1 and 2.
- Produces: verified production behavior and incident record.

- [ ] Run lint, unit tests, migration test, build, and Playwright E2E.
- [ ] Build and stop the Docker image, verifying the expected shutdown exits cleanly.
- [ ] Record the incident cause and verification result in `docs/specs/plan.md`.
- [ ] Commit with `docs: record production incident resolution`.
- [ ] Push `main`, verify GitHub Actions CI and deploy runs, then check `/`, `/api/health`, and Railway logs.

