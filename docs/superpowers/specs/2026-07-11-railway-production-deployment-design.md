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

## Deployment sequence

1. Run the local verification baseline.
2. Implement and test any required startup migration and health-check changes.
3. Build the production container and verify that data survives a local restart.
4. Create the R2 bucket and scoped credentials.
5. Create the Railway project, service, volume, and public domain.
6. Configure non-OAuth variables and deploy far enough to validate the runtime.
7. Create the GitHub OAuth app using the Railway domain.
8. Configure OAuth variables and complete the production deployment.
9. Verify R2 replication and perform a non-destructive restore test into a separate temporary database.
10. Run the product success-criteria walkthrough against production.

## Verification

Deployment is complete only when all of the following pass:

- Railway reports the service healthy and running as one replica.
- The public home page and health endpoint respond over HTTPS.
- GitHub sign-in returns through the production OAuth callback.
- A user can claim a handle and open the public profile.
- GitHub, GitLab, and ingest connection flows behave as specified where credentials and reachable source instances are available.
- The profile widget loads from the Railway origin and works on the embed test page.
- The privacy toggle makes the profile page and public API indistinguishable from an unknown handle.
- SQLite data remains after a service restart.
- Litestream writes backup data to R2.
- A backup restores successfully into an isolated temporary path.
- Production results are recorded in the existing MVP success-criteria document.

## Failure handling and rollback

- A failed health check prevents Railway from treating the new deployment as healthy.
- If startup migration fails, the application must exit instead of serving against an incompatible schema.
- If R2 restore or replication fails, stop deployment and fix backup configuration before accepting user data.
- Preserve the Railway volume during application rollbacks.
- Do not scale beyond one replica.
- Do not test disaster recovery by deleting or replacing the production database. Restore to an isolated path instead.

## Out of scope

- Purchasing or configuring `contribstack.app`
- Multiple Railway replicas or horizontal scaling
- Moving SQLite to another database
- CI/CD redesign beyond the settings required for this deployment
- Product changes unrelated to production readiness
