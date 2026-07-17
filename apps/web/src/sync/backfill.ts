import type { Connector, ConnectorCreds, DayCount } from "@contrib-stack/connectors";
import { eq } from "drizzle-orm";
import type { Db } from "../db/client";
import { connections, dailyCounts } from "../db/schema";
import { historyStart } from "../domain/calendar";
import { decryptSecret } from "../lib/crypto";

export type ConnectorFactory = (connection: {
  type: string;
  baseUrl: string | null;
  credentialEncrypted: string | null;
  userId: string;
}) => Connector;

function utcToday(): string {
  return new Date().toISOString().slice(0, 10);
}

export function buildCreds(connection: {
  baseUrl: string | null;
  credentialEncrypted: string | null;
}): ConnectorCreds {
  const token = connection.credentialEncrypted
    ? decryptSecret(connection.credentialEncrypted)
    : "";

  return {
    token,
    ...(connection.baseUrl ? { baseUrl: connection.baseUrl } : {}),
  };
}

export function upsertDailyCounts(
  db: Db,
  connectionId: string,
  counts: DayCount[],
): void {
  for (const { date, count } of counts) {
    db.insert(dailyCounts)
      .values({ connectionId, date, count })
      .onConflictDoUpdate({
        target: [dailyCounts.connectionId, dailyCounts.date],
        set: { count },
      })
      .run();
  }
}

export async function runBackfill(
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

  db.update(connections)
    .set({ status: "backfilling" })
    .where(eq(connections.id, connectionId))
    .run();

  try {
    const connector = getConnector(connection);
    const creds = buildCreds(connection);
    const since = historyStart(utcToday());
    const until = utcToday();

    for await (const batch of connector.backfill(creds, since, until)) {
      upsertDailyCounts(db, connectionId, batch.filter((d) => d.count > 0));
    }

    db.update(connections)
      .set({
        status: "ok",
        lastSyncedAt: new Date().toISOString(),
      })
      .where(eq(connections.id, connectionId))
      .run();
  } catch {
    db.update(connections)
      .set({ status: "error" })
      .where(eq(connections.id, connectionId))
      .run();
  }
}

export function startBackfill(
  db: Db,
  connectionId: string,
  getConnector: ConnectorFactory,
): void {
  void runBackfill(db, connectionId, getConnector);
}
