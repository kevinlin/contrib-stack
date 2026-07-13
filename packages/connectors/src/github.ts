import {
  type AccountInfo,
  type Connector,
  type ConnectorCreds,
  ConnectorAuthError,
  type DayCount,
} from "./types";
import { safeFetch, validateUrl } from "./safe-fetch";

const GITHUB_GRAPHQL_URL = "https://api.github.com/graphql";

const VIEWER_QUERY = `query { viewer { login createdAt } }`;

const CONTRIBUTIONS_QUERY = `query($from: DateTime!, $to: DateTime!) {
  viewer {
    contributionsCollection(from: $from, to: $to) {
      contributionCalendar {
        weeks {
          contributionDays {
            date
            contributionCount
          }
        }
      }
    }
  }
}`;

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

function toDateTime(date: string): string {
  return `${date}T00:00:00Z`;
}

function graphqlUrl(creds: ConnectorCreds): string {
  if (creds.baseUrl) {
    const base = creds.baseUrl.replace(/\/$/, "");
    const url = `${base}/api/graphql`;
    validateUrl(url);
    return url;
  }
  return GITHUB_GRAPHQL_URL;
}

function isRetryable(status: number): boolean {
  return status === 429 || status >= 500;
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function githubFetch(
  creds: ConnectorCreds,
  query: string,
  variables?: Record<string, string>,
): Promise<unknown> {
  const url = graphqlUrl(creds);
  const body = JSON.stringify({ query, variables });

  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await safeFetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${creds.token}`,
        "Content-Type": "application/json",
      },
      body,
      sensitiveHeaders: ["Authorization"],
    });

    if (response.status === 401) {
      throw new ConnectorAuthError("Invalid GitHub token");
    }

    if (isRetryable(response.status) && attempt === 0) {
      await sleep(1000);
      continue;
    }

    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status}`);
    }

    return response.json();
  }

  throw new Error("GitHub API request failed after retry");
}

type ContributionsResponse = {
  data: {
    viewer: {
      contributionsCollection: {
        contributionCalendar: {
          weeks: Array<{
            contributionDays: Array<{
              date: string;
              contributionCount: number;
            }>;
          }>;
        };
      };
    };
  };
};

function parseContributions(data: ContributionsResponse): DayCount[] {
  const weeks =
    data.data.viewer.contributionsCollection.contributionCalendar.weeks;
  const days: DayCount[] = [];

  for (const week of weeks) {
    for (const day of week.contributionDays) {
      days.push({ date: day.date, count: day.contributionCount });
    }
  }

  return days;
}

async function fetchContributions(
  creds: ConnectorCreds,
  from: string,
  to: string,
): Promise<DayCount[]> {
  const data = (await githubFetch(creds, CONTRIBUTIONS_QUERY, {
    from: toDateTime(from),
    to: toDateTime(to),
  })) as ContributionsResponse;

  return parseContributions(data);
}

function utcToday(): string {
  return new Date().toISOString().slice(0, 10);
}

export const githubConnector: Connector = {
  async validate(creds: ConnectorCreds): Promise<AccountInfo> {
    const data = (await githubFetch(creds, VIEWER_QUERY)) as {
      data: { viewer: { login: string; createdAt: string } };
    };

    return {
      username: data.data.viewer.login,
      accountCreatedAt: data.data.viewer.createdAt,
    };
  },

  async *backfill(
    creds: ConnectorCreds,
    since: string,
    until: string,
  ): AsyncIterable<DayCount[]> {
    const windows = yearWindows(since, until);

    for (const window of windows) {
      yield await fetchContributions(creds, window.from, window.to);
    }
  },

  async refresh(creds: ConnectorCreds, days = 35): Promise<DayCount[]> {
    const until = utcToday();
    const since = addDays(until, -(days - 1));
    return fetchContributions(creds, since, until);
  },
};
