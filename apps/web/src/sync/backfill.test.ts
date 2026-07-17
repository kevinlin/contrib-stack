import { eq } from "drizzle-orm";
import type { Connector, DayCount } from "@contrib-stack/connectors";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-17T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("backfills from the 10-year history start, upserts daily counts, sets status ok", async () => {
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
    expect(backfillCalls[0]?.since).toBe("2017-01-01");
    expect(backfillCalls[0]?.until).toBe("2026-07-17");

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

  it("filters out zero-count days during backfill", async () => {
    const { db, connectionId } = setupTestDb();

    const backfill = vi.fn(async function* (): AsyncIterable<DayCount[]> {
      yield [
        { date: "2023-01-01", count: 0 },
        { date: "2023-01-02", count: 3 },
        { date: "2023-01-03", count: 0 },
        { date: "2023-01-04", count: 5 },
      ];
    });

    const connector = makeFakeConnector({ backfill });
    const getConnector = vi.fn(() => connector);

    startBackfill(db, connectionId, getConnector);

    await waitForConnectionStatus(db, connectionId, "ok");

    const rows = db
      .select()
      .from(dailyCounts)
      .where(eq(dailyCounts.connectionId, connectionId))
      .all();

    expect(rows).toHaveLength(2);
    expect(rows.find((row) => row.date === "2023-01-02")?.count).toBe(3);
    expect(rows.find((row) => row.date === "2023-01-04")?.count).toBe(5);
    expect(rows.find((row) => row.date === "2023-01-01")).toBeUndefined();
    expect(rows.find((row) => row.date === "2023-01-03")).toBeUndefined();
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
