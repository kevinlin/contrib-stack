# Production Homepage and Shutdown Design

## Context

The Railway service is healthy, but the root URL still renders the default Next.js starter page. Railway also sends a crash notification when it intentionally stops a deployment because Litestream reports the child process's SIGTERM exit code 143 as an error.

## Scope

Replace the root page with a small ContribStack landing page and make expected SIGTERM shutdowns exit cleanly. Do not change profile, connection, authentication, backup, or deployment architecture.

## Homepage

The root page will identify ContribStack, explain the multi-source contribution profile in one paragraph, and provide two actions:

- Get started with GitHub, using the existing Auth.js sign-in route with `/welcome` as the callback.
- View the deployed example profile at `/kevinlin`.

The page will use local CSS, remain responsive, and update the root metadata from Create Next App defaults to ContribStack values.

## Shutdown handling

The entrypoint will continue to run Litestream as the supervisor for Next.js. A small wrapper will translate only exit code 143, the conventional SIGTERM result observed in Railway logs, to exit code 0. Every other exit status remains unchanged so real failures still trigger Railway's restart policy and notifications.

## Verification

- A page test will assert the ContribStack heading and both action destinations.
- A shell test will exercise the exit-status normalization with 0, 143, and a genuine failure code.
- Lint, unit tests, migration test, build, and Playwright E2E will run before deployment.
- GitHub Actions will deploy from `main`; production `/` and `/api/health` will be checked after deployment.

