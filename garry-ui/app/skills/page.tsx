"use client";
import { useEffect, useState } from "react";
import styles from "../panel.module.css";
import { apiBase } from "../lib/api";

interface Skill {
  name: string;
  stage: string;
  summary: string;
}

export default function Skills() {
  const [skills, setSkills] = useState<Skill[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${apiBase}/api/skills`)
      .then((r) => r.json())
      .then((d) => setSkills(d.skills as Skill[]))
      .catch((e: unknown) => setError(String(e)));
  }, []);

  if (error) return <main className={styles.main}><p className={styles.muted}>Cannot reach garry-server. Run garry serve.</p></main>;
  if (!skills) return <main className={styles.main}><p>Loading...</p></main>;

  const stages = [...new Set(skills.map((s) => s.stage))];

  return (
    <main className={styles.main}>
      <h1>Skills</h1>
      {stages.map((stage) => (
        <section key={stage}>
          <h2>{stage}</h2>
          <table className={styles.table}>
            <tbody>
              {skills
                .filter((s) => s.stage === stage)
                .map((s) => (
                  <tr key={s.name}>
                    <td>{s.name}</td>
                    <td className={styles.muted}>{s.summary}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </section>
      ))}
    </main>
  );
}
