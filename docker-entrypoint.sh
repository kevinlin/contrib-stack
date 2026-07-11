#!/bin/sh
set -e
# Restore DB from R2 if it doesn't exist locally
litestream restore -if-db-not-exists -config /app/litestream.yml "$DATABASE_PATH"
# Start Next.js under litestream replication
exec litestream replicate -exec "node /app/apps/web/.next/standalone/server.js" -config /app/litestream.yml
