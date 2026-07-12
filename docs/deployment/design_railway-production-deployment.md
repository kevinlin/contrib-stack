# Railway Production Deployment Design

## Goal

Deploy ContribStack to a new Railway project using Railway's generated domain. Run one application replica with SQLite on a persistent volume and continuously replicate the database to a new Cloudflare R2 bucket with Litestream.

## Provider resources

- Create a new Cloudflare R2 bucket dedicated to ContribStack database backups.
- Create credentials scoped to that bucket for Litestream.
- Create a new Railway project from `kevinlin/contrib-stack`.
- Deploy one service from the root `Dockerfile`.
- Attach one persistent volume at `/data`.
- Generate a Railway public domain and use it as `AUTH_URL`.
- Use GitHub Actions as the CI/CD platform. Railway must not deploy directly from repository pushes outside the workflow.
- Create a new GitHub OAuth app after the Railway domain exists.
- Set the OAuth callback to `https://<railway-domain>/api/auth/callback/github`.

No custom domain or DNS configuration is part of this deployment.

## Application readiness

Before creating production resources, verify the existing unit tests, E2E tests, and production build. Make only deployment-blocking changes.

The container startup path must:

1. Validate required production environment variables.
2. Restore the SQLite database from R2 only when the volume has no database.
3. Apply committed Drizzle migrations before starting the application.
4. Start Next.js under Litestream replication.

Railway must use an application health endpoint and wait for it during deployment. The service must remain single-replica because SQLite and the in-process refresh mutex assume one writer.

## Runtime configuration

Configure these Railway variables without committing their values:

- `DATABASE_PATH=/data/contribstack.db`
- `ENCRYPTION_KEY`, generated as 32 random bytes encoded with base64
- `AUTH_SECRET`, generated randomly
- `AUTH_GITHUB_ID`
- `AUTH_GITHUB_SECRET`
- `AUTH_URL=https://<railway-domain>`
- `R2_ENDPOINT`
- `R2_BUCKET`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`

Secrets must not appear in command output, documentation, commits, or deployment verification notes.

Keep a recovery copy of the generated production credentials in the repository root `.env` file. The existing `.gitignore` excludes `.env`; verify this with `git check-ignore .env` before writing credentials and verify the file remains untracked afterward. Restrict local file permissions to the current user. Railway remains the runtime source of application configuration, and GitHub Actions stores only the Railway deployment credential required by the pipeline.

## CI/CD pipeline

Create GitHub Actions workflows with two gates:

1. Pull requests and pushes run install, lint, unit/integration tests, the production build, and Playwright E2E tests using Node 22 and pnpm 10.31.0.
2. A push to `main` may deploy to Railway only after every verification job passes.

The deployment job uses a Railway project token stored as a GitHub Actions secret. It deploys the committed root `Dockerfile` to the existing Railway service. GitHub environment protection and concurrency prevent overlapping production deployments. Application secrets stay in Railway and are not copied into the workflow.

## Deployment sequence

1. Run the local verification baseline.
2. Implement and test any required startup migration and health-check changes.
3. Build the production container and verify that data survives a local restart.
4. Create the R2 bucket and scoped credentials.
5. Create the Railway project, service, volume, and public domain.
6. Write a local recovery copy of generated credentials to the git-ignored root `.env` with user-only permissions.
7. Configure non-OAuth variables and deploy far enough to validate the runtime.
8. Create the GitHub OAuth app using the Railway domain and add its credentials to Railway and the local `.env`.
9. Add the Railway deployment token to GitHub Actions secrets and enable the CI/CD workflow.
10. Complete the production deployment through GitHub Actions.
11. Verify R2 replication and perform a non-destructive restore test into a separate temporary database.
12. Run the product success-criteria walkthrough against production.

## Verification

Deployment is complete only when all of the following pass:

- Railway reports the service healthy and running as one replica.
- GitHub Actions passes lint, tests, build, and E2E checks before deploying `main`.
- A successful deployment originates from the GitHub Actions deployment job.
- The public home page and health endpoint respond over HTTPS.
- GitHub sign-in returns through the production OAuth callback.
- A user can claim a handle and open the public profile.
- GitHub, GitLab, and ingest connection flows behave as specified where credentials and reachable source instances are available.
- The profile widget loads from the Railway origin and works on the embed test page.
- The privacy toggle makes the profile page and public API indistinguishable from an unknown handle.
- SQLite data remains after a service restart.
- Litestream writes backup data to R2.
- A backup restores successfully into an isolated temporary path.
- The root `.env` contains the generated recovery credentials, has user-only permissions, is ignored by Git, and is not tracked.
- Production results are recorded in the existing MVP success-criteria document.

## Failure handling and rollback

- A failed health check prevents Railway from treating the new deployment as healthy.
- If startup migration fails, the application must exit instead of serving against an incompatible schema.
- If R2 restore or replication fails, stop deployment and fix backup configuration before accepting user data.
- Preserve the Railway volume during application rollbacks.
- GitHub Actions serializes production deployments so two revisions cannot deploy concurrently.
- Roll back by redeploying a previously verified Git revision through the same GitHub Actions path.
- Do not scale beyond one replica.
- Do not test disaster recovery by deleting or replacing the production database. Restore to an isolated path instead.

## Out of scope

- Purchasing or configuring `contribstack.app`
- Multiple Railway replicas or horizontal scaling
- Moving SQLite to another database
- Product changes unrelated to production readiness
