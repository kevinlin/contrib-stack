import { eq } from "drizzle-orm";
import type { Connector, DayCount } from "@contrib-stack/connectors";
import { describe, expect, it, vi } from "vitest";
import { connections, dailyCounts } from "../db/schema";
import { startBackfill } from "./backfill";
import { setupTestDb, waitForConnectionStatus } from "./test-helpers";

function makeFakeConnector(handlers: {
  backfill?: Connector["backfill"];
}): Connector {
  return {
    validate: vi.fn(),
    backfill: handlers.backfill ?? vi.fn(async function* () {}),
    refresh: vi.fn(),
  };
}

describe("startBackfill", () => {
  it("iterates year windows since connection creation, upserts daily counts, sets status ok", async () => {
    const { db, connectionId } = setupTestDb();
    const backfillCalls: Array<{ since: string; until: string }> = [];

    const backfill = vi.fn(async function* (
      _creds,
      since: string,
      until: string,
    ): AsyncIterable<DayCount[]> {
      backfillCalls.push({ since, until });
      yield [{ date: "2023-01-01", count: 4 }];
      yield [{ date: "2024-06-01", count: 7 }];
    });

    const connector = makeFakeConnector({ backfill });
    const getConnector = vi.fn(() => connector);

    startBackfill(db, connectionId, getConnector);

    await waitForConnectionStatus(db, connectionId, "ok");

    expect(getConnector).toHaveBeenCalledOnce();
    expect(backfill).toHaveBeenCalledOnce();
    expect(backfillCalls[0]?.since).toBe("2022-06-15");
    expect(backfillCalls[0]?.until).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    const rows = db
      .select()
      .from(dailyCounts)
      .where(eq(dailyCounts.connectionId, connectionId))
      .all();

    expect(rows).toHaveLength(2);
    expect(rows.find((row) => row.date === "2023-01-01")?.count).toBe(4);
    expect(rows.find((row) => row.date === "2024-06-01")?.count).toBe(7);

    const connection = db
      .select()
      .from(connections)
      .where(eq(connections.id, connectionId))
      .get();

    expect(connection?.status).toBe("ok");
    expect(connection?.lastSyncedAt).toBeTruthy();
  });

  it("sets status error on connector throw and keeps partial data", async () => {
    const { db, connectionId } = setupTestDb();

    const backfill = vi.fn(async function* (): AsyncIterable<DayCount[]> {
      yield [{ date: "2023-03-10", count: 2 }];
      throw new Error("connector failed");
    });

    const connector = makeFakeConnector({ backfill });
    const getConnector = vi.fn(() => connector);

    startBackfill(db, connectionId, getConnector);

    await waitForConnectionStatus(db, connectionId, "error");

    const rows = db
      .select()
      .from(dailyCounts)
      .where(eq(dailyCounts.connectionId, connectionId))
      .all();

    expect(rows).toHaveLength(1);
    expect(rows[0]?.count).toBe(2);

    const connection = db
      .select()
      .from(connections)
      .where(eq(connections.id, connectionId))
      .get();

    expect(connection?.status).toBe("error");
  });
});
