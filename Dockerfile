# syntax=docker/dockerfile:1

FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@10.31.0 --activate
WORKDIR /app

FROM base AS deps
RUN apk add --no-cache python3 make g++
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json ./apps/web/
COPY packages/widget/package.json ./packages/widget/
COPY packages/connectors/package.json ./packages/connectors/
RUN pnpm install --frozen-lockfile

FROM base AS build
RUN apk add --no-cache python3 make g++
COPY --from=deps /app/ ./
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm build

FROM node:22-alpine AS runtime
ARG TARGETARCH
RUN apk add --no-cache ca-certificates curl \
  && curl -fsSL "https://github.com/benbjohnson/litestream/releases/download/v0.3.13/litestream-v0.3.13-linux-${TARGETARCH}.tar.gz" \
    | tar xz -C /usr/local/bin
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

COPY --from=build /app/apps/web/.next/standalone ./apps/web/.next/standalone
COPY --from=build /app/apps/web/node_modules/drizzle-orm ./apps/web/.next/standalone/node_modules/drizzle-orm
COPY --from=build /app/apps/web/drizzle ./apps/web/.next/standalone/drizzle
COPY --from=build /app/apps/web/scripts/migrate.mjs ./apps/web/.next/standalone/migrate.mjs
COPY --from=build /app/apps/web/.next/static ./apps/web/.next/standalone/apps/web/.next/static
COPY --from=build /app/apps/web/public ./apps/web/.next/standalone/apps/web/public

COPY litestream.yml docker-entrypoint.sh ./
COPY scripts/normalize-exit-status.sh ./scripts/normalize-exit-status.sh
RUN ln -s .pnpm/node_modules/better-sqlite3 ./apps/web/.next/standalone/node_modules/better-sqlite3 \
  && chmod +x docker-entrypoint.sh scripts/normalize-exit-status.sh

EXPOSE 3000
ENTRYPOINT ["./docker-entrypoint.sh"]
