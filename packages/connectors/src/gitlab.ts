import {
  type AccountInfo,
  type Connector,
  type ConnectorCreds,
  ConnectorAuthError,
  type DayCount,
} from "./types";
import { safeFetch, validateUrl } from "./safe-fetch";

const GITLAB_DEFAULT_BASE = "https://gitlab.com";
const MAX_PAGES_PER_WINDOW = 100;

function apiBase(creds: ConnectorCreds): string {
  const base = creds.baseUrl ?? GITLAB_DEFAULT_BASE;
  const cleaned = base.replace(/\/$/, "");
  validateUrl(`${cleaned}/api/v4/user`);
  return cleaned;
}

function bucketByTimezone(timestamps: string[], tz: string): DayCount[] {
  const counts = new Map<string, number>();
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  for (const iso of timestamps) {
    const date = formatter.format(new Date(iso));
    counts.set(date, (counts.get(date) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function parseDate(date: string): Date {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(date: string, days: number): string {
  const next = parseDate(date);
  next.setUTCDate(next.getUTCDate() + days);
  return formatDate(next);
}

function addYears(date: string, years: number): string {
  const [year, month, day] = date.split("-").map(Number);
  return formatDate(new Date(Date.UTC(year + years, month - 1, day)));
}

function yearWindows(
  fromIso: string,
  toIso: string,
): { from: string; to: string }[] {
  const windows: { from: string; to: string }[] = [];
  let cursor = fromIso;

  while (cursor <= toIso) {
    const windowEnd = addDays(addYears(cursor, 1), -1);
    const to = windowEnd < toIso ? windowEnd : toIso;
    windows.push({ from: cursor, to });
    cursor = addDays(to, 1);
  }

  return windows;
}

function utcToday(): string {
  return new Date().toISOString().slice(0, 10);
}

type GitLabUser = {
  id: number;
  username: string;
  created_at: string;
};

type GitLabEvent = {
  id: number;
  action_name: string;
  created_at: string;
};

async function gitlabFetch(
  creds: ConnectorCreds,
  path: string,
): Promise<Response> {
  const url = `${apiBase(creds)}${path}`;
  return safeFetch(url, {
    headers: {
      "PRIVATE-TOKEN": creds.token,
    },
    sensitiveHeaders: ["PRIVATE-TOKEN"],
  });
}

async function fetchUser(creds: ConnectorCreds): Promise<GitLabUser> {
  const response = await gitlabFetch(creds, "/api/v4/user");

  if (response.status === 401) {
    throw new ConnectorAuthError("Invalid GitLab token");
  }

  if (!response.ok) {
    throw new Error(`GitLab API error: ${response.status}`);
  }

  return response.json() as Promise<GitLabUser>;
}

async function fetchAllEvents(
  creds: ConnectorCreds,
  userId: number,
  after: string,
  before: string,
): Promise<string[]> {
  const timestamps: string[] = [];
  let page = 1;

  while (page <= MAX_PAGES_PER_WINDOW) {
    const path =
      `/api/v4/users/${userId}/events` +
      `?after=${after}&before=${before}&per_page=100&page=${page}`;
    const response = await gitlabFetch(creds, path);

    if (response.status === 401) {
      throw new ConnectorAuthError("Invalid GitLab token");
    }

    if (!response.ok) {
      throw new Error(`GitLab API error: ${response.status}`);
    }

    const events = (await response.json()) as GitLabEvent[];
    if (events.length === 0) {
      break;
    }

    for (const event of events) {
      timestamps.push(event.created_at);
    }

    page++;
  }

  return timestamps;
}

export function makeGitlabConnector(tz: string): Connector {
  return {
    async validate(creds: ConnectorCreds): Promise<AccountInfo> {
      const user = await fetchUser(creds);
      return {
        username: user.username,
        accountCreatedAt: user.created_at,
      };
    },

    async *backfill(
      creds: ConnectorCreds,
      since: string,
      until: string,
    ): AsyncIterable<DayCount[]> {
      const user = await fetchUser(creds);
      const windows = yearWindows(since, until);

      for (const window of windows) {
        const timestamps = await fetchAllEvents(
          creds,
          user.id,
          window.from,
          window.to,
        );
        yield bucketByTimezone(timestamps, tz);
      }
    },

    async refresh(creds: ConnectorCreds, days = 35): Promise<DayCount[]> {
      const user = await fetchUser(creds);
      const until = utcToday();
      const since = addDays(until, -(days - 1));
      const timestamps = await fetchAllEvents(creds, user.id, since, until);
      return bucketByTimezone(timestamps, tz);
    },
  };
}
