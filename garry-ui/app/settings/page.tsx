import { PageHeader } from "../ui";
import GithubConnect from "./GithubConnect";
import ProjectsPanel from "../projects/ProjectsPanel";
import styles from "./settings.module.css";

/** Garry's own settings: projects and the GitHub connection. Per project push and branch settings live on the Build page. */
export default function Settings() {
  return (
    <main className="page">
      <PageHeader eyebrow="Settings" title="Settings" lede="Your projects and how Garry connects to the outside world. Changed on the computer running Garry." />
      <section id="projects" className={`card ${styles.section}`} aria-labelledby="projects-title">
        <h2 id="projects-title" className={styles.title}>
          Projects
        </h2>
        <ProjectsPanel />
      </section>
      <section className={`card ${styles.section}`} style={{ marginTop: 16 }} aria-labelledby="github">
        <h2 id="github" className={styles.title}>
          GitHub
        </h2>
        <GithubConnect />
      </section>
      <p className={styles.note} style={{ marginTop: 16 }}>
        What Garry may push, and where, is set per repository: Build, the gear next to the repository.
      </p>
    </main>
  );
}
