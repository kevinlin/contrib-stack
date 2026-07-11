import { eq } from "drizzle-orm";
import type { Connector, DayCount } from "@contrib-stack/connectors";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { connections, dailyCounts } from "../db/schema";
import { resetConnectionMutexForTests } from "./mutex";
import { refreshIfStale, setStaleThresholdMs } from "./refresh";
import { setupTestDb } from "./test-helpers";

function makeFakeConnector(handlers: {
  refresh?: Connector["refresh"];
}): Connector {
  return {
    validate: vi.fn(),
    backfill: vi.fn(async function* () {}),
    refresh: handlers.refresh ?? vi.fn(async () => []),
  };
}

async function waitForRefresh(refresh: ReturnType<typeof vi.fn>, timeoutMs = 5000) {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    if (refresh.mock.calls.length > 0) {
      await new Promise((resolve) => setTimeout(resolve, 150));
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }

  throw new Error("Timed out waiting for refresh");
}

beforeEach(() => {
  setStaleThresholdMs(10 * 60 * 1000);
});

afterEach(() => {
  setStaleThresholdMs(10 * 60 * 1000);
  resetConnectionMutexForTests();
});

describe("refreshIfStale", () => {
  it("skips refresh when lastSyncedAt is within the stale threshold", async () => {
    const { db, connectionId } = setupTestDb();
    const now = new Date().toISOString();

    db.update(connections)
      .set({ lastSyncedAt: now })
      .where(eq(connections.id, connectionId))
      .run();

    const refresh = vi.fn(async () => [{ date: "2025-01-01", count: 1 }]);
    const connector = makeFakeConnector({ refresh });
    const getConnector = vi.fn(() => connector);

    refreshIfStale(db, connectionId, getConnector);
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(refresh).not.toHaveBeenCalled();
  });

  it("refreshes trailing days when stale", async () => {
    const { db, connectionId } = setupTestDb();
    const stale = new Date(Date.now() - 20 * 60 * 1000).toISOString();

    db.update(connections)
      .set({ lastSyncedAt: stale })
      .where(eq(connections.id, connectionId))
      .run();

    const refresh = vi.fn(async () => [
      { date: "2025-06-01", count: 9 },
    ] satisfies DayCount[]);
    const connector = makeFakeConnector({ refresh });
    const getConnector = vi.fn(() => connector);

    refreshIfStale(db, connectionId, getConnector);
    await waitForRefresh(refresh);

    expect(refresh).toHaveBeenCalledOnce();
    expect(refresh).toHaveBeenCalledWith(expect.anything(), 35);

    const row = db
      .select()
      .from(dailyCounts)
      .where(eq(dailyCounts.connectionId, connectionId))
      .get();

    expect(row?.count).toBe(9);

    const connection = db
      .select()
      .from(connections)
      .where(eq(connections.id, connectionId))
      .get();

    expect(connection?.lastSyncedAt).not.toBe(stale);
  });

  it("mutex prevents concurrent refresh of the same connection", async () => {
    const { db, connectionId } = setupTestDb();
    const stale = new Date(Date.now() - 20 * 60 * 1000).toISOString();

    db.update(connections)
      .set({ lastSyncedAt: stale })
      .where(eq(connections.id, connectionId))
      .run();

    const refresh = vi.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 100));
      return [{ date: "2025-06-02", count: 3 }];
    });
    const connector = makeFakeConnector({ refresh });
    const getConnector = vi.fn(() => connector);

    for (let i = 0; i < 10; i++) {
      refreshIfStale(db, connectionId, getConnector);
    }

    await waitForRefresh(refresh);

    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("re-running refresh replaces counts instead of doubling them", async () => {
    const { db, connectionId } = setupTestDb();
    setStaleThresholdMs(0);

    let refreshCount = 0;
    const refresh = vi.fn(async () => {
      refreshCount += 1;
      return [{ date: "2025-07-01", count: refreshCount === 1 ? 5 : 12 }];
    });
    const connector = makeFakeConnector({ refresh });
    const getConnector = vi.fn(() => connector);

    refreshIfStale(db, connectionId, getConnector);
    await waitForRefresh(refresh);

    refreshIfStale(db, connectionId, getConnector);
    await waitForRefresh(refresh);

    expect(refresh).toHaveBeenCalledTimes(2);

    const rows = db
      .select()
      .from(dailyCounts)
      .where(eq(dailyCounts.connectionId, connectionId))
      .all();

    expect(rows).toHaveLength(1);
    expect(rows[0]?.count).toBe(12);
  });
});
