import type { ProfileData } from "./types";

export function profileUrl(
  apiBase: string,
  handle: string,
  range: string,
): string {
  const base = apiBase.replace(/\/$/, "");
  const params = new URLSearchParams();
  if (range === "all") {
    params.set("range", "all");
  } else if (range !== "1y") {
    params.set("year", range);
  }
  const qs = params.toString();
  return `${base}/api/profile/${encodeURIComponent(handle)}${qs ? `?${qs}` : ""}`;
}

export async function fetchProfile(
  apiBase: string,
  handle: string,
  range: string,
): Promise<ProfileData> {
  const url = profileUrl(apiBase, handle, range);
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Profile not found (${res.status})`);
  }
  return res.json() as Promise<ProfileData>;
}

export function filterSources(
  profile: ProfileData,
  sources: string | null,
): ProfileData {
  if (!sources) return profile;
  const slugs = new Set(
    sources
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
  if (slugs.size === 0) return profile;
  return {
    ...profile,
    connections: profile.connections.filter((c) => slugs.has(c.slug)),
  };
}
