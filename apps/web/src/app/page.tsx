import Link from "next/link";
import styles from "./page.module.css";

export default function Home() {
  return (
    <main className={styles.main}>
      <section className={styles.hero}>
        <p className={styles.eyebrow}>ContribStack</p>
        <h1>Your developer activity, in one profile.</h1>
        <p className={styles.summary}>
          Bring GitHub, GitLab, and custom activity together in an interactive
          contribution heatmap you can share or embed anywhere.
        </p>
        <div className={styles.actions}>
          <Link
            className={styles.primary}
            href="/api/auth/signin?callbackUrl=/welcome"
          >
            Get started with GitHub
          </Link>
          <Link className={styles.secondary} href="/kevinlin">
            View example profile
          </Link>
          <Link className={styles.secondary} href="/settings">
            Settings
          </Link>
        </div>
      </section>
      <section className={styles.features} aria-label="Features">
        <article>
          <h2>One profile</h2>
          <p>Show every source as its own visible contribution layer.</p>
        </article>
        <article>
          <h2>Full history</h2>
          <p>Browse yearly activity, totals, streaks, and active days.</p>
        </article>
        <article>
          <h2>Embeddable</h2>
          <p>Use the same interactive heatmap on your own website.</p>
        </article>
      </section>
    </main>
  );
}
