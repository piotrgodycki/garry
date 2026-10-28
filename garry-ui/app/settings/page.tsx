import { PageHeader } from "../ui";
import GithubConnect from "./GithubConnect";
import styles from "./settings.module.css";

/** Garry's own settings: the GitHub connection. Per project push and branch settings live on the Build page. */
export default function Settings() {
  return (
    <main className="page">
      <PageHeader eyebrow="Settings" title="Settings" lede="How Garry connects to the outside world. Changed on the computer running Garry." />
      <section className={`card ${styles.section}`} aria-labelledby="github">
        <h2 id="github" className={styles.title}>
          GitHub
        </h2>
        <GithubConnect />
      </section>
      <p className={styles.note} style={{ marginTop: 16 }}>
        What Garry may push, and where, is set per project: Build, Push and branch settings.
      </p>
    </main>
  );
}
