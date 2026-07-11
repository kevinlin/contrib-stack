import styles from "./ProfileNotFound.module.css";

export function ProfileNotFound() {
  return (
    <main className={styles.main}>
      <h1 className={styles.title}>Profile not found</h1>
      <p className={styles.message}>
        This profile does not exist or is not publicly visible.
      </p>
    </main>
  );
}
