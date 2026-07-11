import {
  githubConnector,
  makeGitlabConnector,
} from "@contrib-stack/connectors";
import { eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { connections, dailyCounts, users } from "@/db/schema";
import type { ConnectorFactory } from "@/sync/backfill";
import { refreshIfStale } from "@/sync/refresh";

const CORS_HEADERS = { "Access-Control-Allow-Origin": "*" };

function makeConnectorFactory(db: ReturnType<typeof getDb>): ConnectorFactory {
  return (connection) => {
    if (connection.type === "github") {
      return githubConnector;
    }
    if (connection.type === "gitlab") {
      const user = db
        .select({ timezone: users.timezone })
        .from(users)
        .where(eq(users.id, connection.userId))
        .get();
      return makeGitlabConnector(user?.timezone ?? "UTC");
    }
    throw new Error(`No connector for type: ${connection.type}`);
  };
}

function notFoundResponse() {
  return NextResponse.json(
    { error: "not_found" },
    { status: 404, headers: CORS_HEADERS },
  );
}

function jsonResponse(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: CORS_HEADERS });
}

function addDays(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day));
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}

function resolveDateRange(
  searchParams: URLSearchParams,
): { from: string; to: string } | null {
  if (searchParams.get("range") === "all") {
    return null;
  }

  const yearParam = searchParams.get("year");
  if (yearParam) {
    const year = Number(yearParam);
    if (!Number.isInteger(year) || year < 1970) {
      return { from: "1970-01-01", to: "1970-01-01" };
    }
    return { from: `${year}-01-01`, to: `${year}-12-31` };
  }

  const today = new Date().toISOString().slice(0, 10);
  return { from: addDays(today, -364), to: today };
}

function inRange(date: string, range: { from: string; to: string } | null) {
  if (!range) {
    return true;
  }
  return date >= range.from && date <= range.to;
}

export async function GET(
  request: Request,
  context: { params: Promise<{ handle: string }> },
) {
  const { handle } = await context.params;
  const db = getDb();

  const user = db.select().from(users).where(eq(users.handle, handle)).get();
  if (!user || user.isPrivate) {
    return notFoundResponse();
  }

  const userConnections = db
    .select()
    .from(connections)
    .where(eq(connections.userId, user.id))
    .all();

  const connectionIds = userConnections.map((c) => c.id);
  const allCounts =
    connectionIds.length === 0
      ? []
      : db
          .select()
          .from(dailyCounts)
          .where(inArray(dailyCounts.connectionId, connectionIds))
          .all();

  const years = [
    ...new Set(allCounts.map((row) => Number(row.date.slice(0, 4)))),
  ].sort((a, b) => b - a);

  const range = resolveDateRange(new URL(request.url).searchParams);
  const getConnector = makeConnectorFactory(db);

  for (const connection of userConnections) {
    refreshIfStale(db, connection.id, getConnector);
  }

  const profileConnections = userConnections.map((connection) => {
    const connectionCounts = allCounts.filter(
      (row) => row.connectionId === connection.id,
    );
    const total = connectionCounts.reduce((sum, row) => sum + row.count, 0);
    const days = connectionCounts
      .filter((row) => inRange(row.date, range))
      .map((row) => ({ date: row.date, count: row.count }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return {
      slug: connection.slug,
      label: connection.label,
      color: connection.color,
      total,
      days,
    };
  });

  return jsonResponse({
    handle: user.handle,
    years,
    connections: profileConnections,
  });
}
