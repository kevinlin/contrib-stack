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
