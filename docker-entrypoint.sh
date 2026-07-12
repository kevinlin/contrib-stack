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
if [ ! -f "$DATABASE_PATH" ]; then
  if ! restore_error=$(litestream restore -config /app/litestream.yml "$DATABASE_PATH" 2>&1); then
    case "$restore_error" in
      *"no matching backups found"*)
        echo "No existing backup found; initializing a new database"
        ;;
      *)
        echo "$restore_error" >&2
        exit 1
        ;;
    esac
  fi
fi

cd /app/apps/web/.next/standalone
node migrate.mjs
exec litestream replicate -exec "node apps/web/server.js" -config /app/litestream.yml
