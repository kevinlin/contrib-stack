import { eq } from "drizzle-orm";
import type { Db } from "../db/client";
import { connections, dailyCounts } from "../db/schema";
import {
  buildCreds,
  type ConnectorFactory,
  runBackfill,
  upsertDailyCounts,
} from "./backfill";
import { connectionMutex } from "./mutex";

const REFRESH_DAYS = 35;

let staleThresholdMs = 10 * 60 * 1000;

export function setStaleThresholdMs(ms: number): void {
  staleThresholdMs = ms;
}

export function getStaleThresholdMs(): number {
  return staleThresholdMs;
}

async function runRefreshIfStale(
  db: Db,
  connectionId: string,
  getConnector: ConnectorFactory,
): Promise<void> {
  const connection = db
    .select()
    .from(connections)
    .where(eq(connections.id, connectionId))
    .get();

  if (!connection) {
    return;
  }

  if (connection.lastSyncedAt) {
    const elapsed = Date.now() - new Date(connection.lastSyncedAt).getTime();
    if (elapsed < staleThresholdMs) {
      return;
    }
  }

  if (!connectionMutex.tryAcquire(connectionId)) {
    return;
  }

  try {
    const connector = getConnector(connection);
    const creds = buildCreds(connection);
    const counts = await connector.refresh(creds, REFRESH_DAYS);
    upsertDailyCounts(db, connectionId, counts);
    db.update(connections)
      .set({ lastSyncedAt: new Date().toISOString() })
      .where(eq(connections.id, connectionId))
      .run();
  } catch {
    // Serve stale data on refresh failure.
  } finally {
    connectionMutex.release(connectionId);
  }
}

export function refreshIfStale(
  db: Db,
  connectionId: string,
  getConnector: ConnectorFactory,
): void {
  void runRefreshIfStale(db, connectionId, getConnector);
}

export async function resync(
  db: Db,
  connectionId: string,
  getConnector: ConnectorFactory,
): Promise<void> {
  db.delete(dailyCounts)
    .where(eq(dailyCounts.connectionId, connectionId))
    .run();

  await runBackfill(db, connectionId, getConnector);
}
