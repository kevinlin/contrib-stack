import { GET as getProfile } from "@/app/api/profile/[handle]/route";
import { ProfileNotFound } from "@/components/ProfileNotFound";
import {
  profilePath,
  resolveProfileView,
  type ProfileSearchParams,
} from "@/lib/profile-page";
import styles from "./page.module.css";

type PageProps = {
  params: Promise<{ handle: string }>;
  searchParams: Promise<ProfileSearchParams>;
};

async function fetchProfile(handle: string, apiQuery: string) {
  const query = apiQuery ? `?${apiQuery}` : "";
  const res = await getProfile(
    new Request(`http://localhost/api/profile/${handle}${query}`),
    { params: Promise.resolve({ handle }) },
  );
  if (res.status === 404) {
    return null;
  }
  return res.json() as Promise<{
    handle: string;
    years: number[];
    connections: unknown[];
  }>;
}

export default async function ProfilePage({ params, searchParams }: PageProps) {
  const { handle } = await params;
  const resolvedSearchParams = await searchParams;
  const view = resolveProfileView(resolvedSearchParams);
  const profile = await fetchProfile(handle, view.apiQuery);

  if (!profile) {
    return <ProfileNotFound />;
  }

  const currentView = resolveProfileView(resolvedSearchParams);

  return (
    <main className={styles.main}>
      <header className={styles.header}>
        <h1 className={styles.handle}>@{profile.handle}</h1>
        <nav className={styles.yearNav} aria-label="Year navigation">
          <a
            href={profilePath(handle, { activeTab: "rolling" })}
            className={
              currentView.activeTab === "rolling"
                ? styles.tabActive
                : styles.tab
            }
          >
            Rolling year
          </a>
          {profile.years.map((year) => (
            <a
              key={year}
              href={profilePath(handle, { activeTab: "year", activeYear: year })}
              className={
                currentView.activeTab === "year" &&
                currentView.activeYear === year
                  ? styles.tabActive
                  : styles.tab
              }
            >
              {year}
            </a>
          ))}
          <a
            href={profilePath(handle, { activeTab: "all" })}
            className={
              currentView.activeTab === "all" ? styles.tabActive : styles.tab
            }
          >
            All
          </a>
        </nav>
      </header>

      <section className={styles.widgetSection}>
        <contrib-stack
          user={handle}
          theme="auto"
          range={view.widgetRange}
          link="off"
        />
      </section>

      <script src="/widget.js" async />
    </main>
  );
}
