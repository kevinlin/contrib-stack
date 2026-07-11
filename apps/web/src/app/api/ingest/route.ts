import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { connections, dailyCounts } from "@/db/schema";
import { hashApiKey } from "@/lib/crypto";
import { getIngestRateLimiter } from "@/lib/rate-limit";

const MAX_ROWS = 5000;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

type IngestRow = { date: string; count: number };

function isValidIsoDate(date: string): boolean {
  if (!ISO_DATE_RE.test(date)) {
    return false;
  }

  const [year, month, day] = date.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}

function parseBearerToken(request: Request): string | null {
  const header = request.headers.get("Authorization");
  if (!header?.startsWith("Bearer ")) {
    return null;
  }

  const token = header.slice("Bearer ".length).trim();
  return token || null;
}

function validatePayload(body: unknown): IngestRow[] | null {
  if (!Array.isArray(body)) {
    return null;
  }

  if (body.length > MAX_ROWS) {
    return null;
  }

  const rows: IngestRow[] = [];

  for (const item of body) {
    if (
      typeof item !== "object" ||
      item === null ||
      !("date" in item) ||
      !("count" in item) ||
      typeof item.date !== "string" ||
      typeof item.count !== "number" ||
      !Number.isInteger(item.count) ||
      item.count < 0 ||
      !isValidIsoDate(item.date)
    ) {
      return null;
    }

    rows.push({ date: item.date, count: item.count });
  }

  return rows;
}

export async function POST(request: Request) {
  const token = parseBearerToken(request);
  if (!token) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const keyHash = hashApiKey(token);
  const limit = getIngestRateLimiter().check(keyHash);
  if (!limit.allowed) {
    const headers: Record<string, string> = {};
    if (limit.retryAfterMs !== undefined) {
      headers["Retry-After"] = String(Math.ceil(limit.retryAfterMs / 1000));
    }
    return NextResponse.json({ error: "rate_limited" }, { status: 429, headers });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const rows = validatePayload(body);
  if (!rows) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const db = getDb();
  const connection = db
    .select()
    .from(connections)
    .where(eq(connections.apiKeyHash, keyHash))
    .get();

  if (!connection) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    db.transaction((tx) => {
      for (const row of rows) {
        tx.insert(dailyCounts)
          .values({
            connectionId: connection.id,
            date: row.date,
            count: row.count,
          })
          .onConflictDoUpdate({
            target: [dailyCounts.connectionId, dailyCounts.date],
            set: { count: row.count },
          })
          .run();
      }
    });
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  return NextResponse.json({ upserted: rows.length });
}
