# Config UI: GitHub sign-in gate + connection management, verified end-to-end

## Context

Task asked for a config UI with GitHub OIDC auth and view/add/delete of connections. Exploration showed most of it already exists:

- GitHub sign-in exists via Auth.js OAuth ([apps/web/src/auth.ts](apps/web/src/auth.ts)) — GitHub has no OIDC endpoint for user login, so OAuth stays (user confirmed).
- The settings page ([apps/web/src/app/settings/page.tsx](apps/web/src/app/settings/page.tsx), ~470-line client component) already does view/add/delete/resync/recolor for all connection types, privacy toggle, ingest-key modal. User confirmed: keep all types including GitHub.

Real gaps this plan closes:

1. `/settings` has no server-side auth guard — only a client redirect after a 401 fetch. Also, pending-handle users (unclaimed `__pending__` handle) can land on `/settings`; this is the known criterion-1 defect recorded in plan.md.
2. No signed-in indicator, no "View profile" link, no sign-out control anywhere.
3. Zero E2E coverage of the authenticated settings flow. The seed already inserts a DB session row (`e2e-session-token-testuser`) but no spec injects it as a cookie.

Design facts verified in this repo's node_modules (next@16.2.10, next-auth@5.0.0-beta.31, @auth/core@0.41.2):

- `redirect()` from `next/navigation` throws `NEXT_REDIRECT` (assertable via `error.digest`); never wrap in try/catch.
- `signOut()` from `@/auth` inside a server action deletes the DB session row (database strategy) and redirects; CSRF is skipped internally.
- Server actions used by a client component must live in a separate `"use server"` file.
- E2E cookie on http://localhost is `authjs.session-token` (no `__Secure-` prefix); with DB sessions the cookie value is the raw session token, so the seeded token works directly.

## Steps

### 1. Extract client component (mechanical move)

- Create `apps/web/src/app/settings/settings-client.tsx`: move current page.tsx content verbatim, keep `"use client"` and `import styles from "./page.module.css"`.
  - Rename export to `SettingsClient`, add prop `{ account: { handle: string; name: string | null } }`.
  - Add account bar to the header: "Signed in as {name ?? handle} (@handle)", `Link` to `/${handle}` ("View profile"), and `<form action={signOutAction}><button>Sign out</button></form>`.
  - Render the header also in the `loading` early-return so it's visible immediately.
  - Keep the existing 401 → `window.location.href` fallback (covers mid-session expiry).
- `apps/web/src/app/settings/page.module.css`: add `.accountBar` styles only.

### 2. Server gate + sign-out action

- Rewrite `apps/web/src/app/settings/page.tsx` as async server component (~25 lines):
  - `await auth()`; no session → `redirect("/api/auth/signin?callbackUrl=/settings")`.
  - Load user via `getDb()`; missing user → same redirect.
  - `isPendingHandle(user.handle)` ([apps/web/src/lib/handle.ts](apps/web/src/lib/handle.ts)) → `redirect("/welcome")` — fixes criterion-1 defect.
  - Else render `<SettingsClient account={{ handle, name }} />`. No SessionProvider, no middleware.
- Create `apps/web/src/app/settings/actions.ts`: `"use server"`; `signOutAction()` → `await signOut({ redirectTo: "/" })` (import from `@/auth`).

### 3. Unit tests

- Create `apps/web/src/app/settings/page.test.tsx` following [apps/web/src/app/\[handle\]/page.test.tsx](apps/web/src/app/[handle]/page.test.tsx) conventions (node env, `renderToStaticMarkup`, in-memory SQLite + drizzle migrate, `vi.mock("@/auth")` incl. `signOut`, `vi.mock("@/db/client")` getDb):
  1. No session → rejects with digest containing `NEXT_REDIRECT` + `/api/auth/signin?callbackUrl=/settings`.
  2. Pending-handle user → digest contains `/welcome`.
  3. Claimed user → markup contains `@handle`, "View profile" href, "Sign out".
  4. `signOutAction()` calls `signOut({ redirectTo: "/" })`.

### 4. E2E (the mandated end-to-end verification)

- Modify `apps/web/e2e/seed.ts`: add pending-handle user (`e2e-user-pending`, no connections) + session row `e2e-session-token-pending`; expose `pendingSessionToken` in fixtures.json.
- Create `apps/web/e2e/settings.spec.ts` (sorts last alphabetically; `workers: 1` so ordering holds). Cookie inject: `context.addCookies([{ name: "authjs.session-token", value: token, domain: "localhost", path: "/" }])`. Tests in order:
  1. Unauthenticated `/settings` → redirected to `/api/auth/signin` with callbackUrl.
  2. Pending-session cookie → `/settings` lands on `/welcome`.
  3. Authenticated: header shows `@testuser` + View profile link; 3 seeded connection cards visible; add connection via form (select "Ingest API", fill Label, click "Add connection") → reveal-once modal (`role="dialog"`, key `csk_` prefix; skip the clipboard "Copy" assertion — permission-gated headless) → click "Done" → 4 cards; delete the NEW card via its "Delete" button (register `page.once("dialog", accept)` before click — delete goes through `confirm()` and Playwright auto-dismisses dialogs otherwise; never touch seeded connections, profile.spec depends on them) → 3 cards.
  4. Sign out (last test — irreversibly deletes the seeded session row): click Sign out → lands on `/` signed out → `/settings` redirects to sign-in again.

### 5. Docs

- `docs/specs/design.md` §5: note `/settings` server gate (auth() in page, sign-in redirect, pending → `/welcome`), signed-in header + sign-out server action (deletes DB session). §12: authenticated settings E2E added.
- `docs/specs/plan.md`: append changelog entry (2026-07-13): problem (client-only gate, criterion-1 pending-handle defect, no sign-out), fix, files changed, tests added.

## Files

| File | Change |
|---|---|
| `apps/web/src/app/settings/settings-client.tsx` | new — moved client UI + account bar |
| `apps/web/src/app/settings/page.tsx` | rewrite — server auth gate |
| `apps/web/src/app/settings/actions.ts` | new — signOut server action |
| `apps/web/src/app/settings/page.module.css` | add account-bar styles |
| `apps/web/src/app/settings/page.test.tsx` | new — gate unit tests |
| `apps/web/e2e/seed.ts` | add pending user + session fixture |
| `apps/web/e2e/settings.spec.ts` | new — authenticated E2E |
| `docs/specs/design.md`, `docs/specs/plan.md` | doc updates |

## Verification

```bash
pnpm --filter web test    # new page tests + existing 115 stay green
pnpm --filter web e2e     # all specs incl. new settings.spec.ts
pnpm build && pnpm lint
```

Playwright is the end-to-end proof: real dev server, real file DB, real browser driving sign-in gate, connection add/delete, and sign-out. Existing profile/ingest/embed specs must stay green (shared seeded DB — settings spec only creates/deletes its own connection; sign-out test runs last).

## Gotchas

- `redirect()`/`signOut()` throw — no try/catch around them.
- Cookie name is `authjs.session-token` only on http; production uses `__Secure-` prefix (no app code depends on it).
- Keep the client-component move mechanical — polling/modal/color-picker flows have no unit coverage.
