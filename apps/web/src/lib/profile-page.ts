export type ProfileSearchParams = {
  year?: string;
  range?: string;
};

export type ProfileView = {
  widgetRange: string;
  apiQuery: string;
  activeTab: "rolling" | "year" | "all";
  activeYear?: number;
};

export function resolveProfileView(
  searchParams: ProfileSearchParams,
): ProfileView {
  if (searchParams.range === "all") {
    return { widgetRange: "all", apiQuery: "range=all", activeTab: "all" };
  }

  if (searchParams.year) {
    const year = Number(searchParams.year);
    if (Number.isInteger(year) && year >= 1970) {
      return {
        widgetRange: String(year),
        apiQuery: `year=${year}`,
        activeTab: "year",
        activeYear: year,
      };
    }
  }

  return { widgetRange: "1y", apiQuery: "", activeTab: "rolling" };
}

export function profilePath(
  handle: string,
  view: Pick<ProfileView, "activeTab" | "activeYear">,
): string {
  if (view.activeTab === "all") {
    return `/${handle}?range=all`;
  }
  if (view.activeTab === "year" && view.activeYear) {
    return `/${handle}?year=${view.activeYear}`;
  }
  return `/${handle}`;
}
