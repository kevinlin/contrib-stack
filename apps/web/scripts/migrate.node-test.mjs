import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import Database from "better-sqlite3";

test("applies migrations to an empty database idempotently", () => {
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
