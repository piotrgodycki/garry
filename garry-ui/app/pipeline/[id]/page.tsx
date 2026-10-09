"use client";
import { use, useEffect, useState } from "react";
import Link from "next/link";
import styles from "./pipeline.module.css";
import { apiBase } from "../../lib/api";

interface TaskData {
  stage: string;
  service?: string;
  agent: string;
  model: string;
  skills: string[];
}

interface StreamEvent {
  type: "feature" | "task";
  feature?: { order?: string[] };
  task?: TaskData;
}

export default function Pipeline({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [events, setEvents] = useState<StreamEvent[]>([]);
  const [done, setDone] = useState(false);

  useEffect(() => {
    setEvents([]);
    setDone(false);
    const es = new EventSource(`${apiBase}/api/features/${id}/stream`);

    es.addEventListener("feature", (e) => {
      const data = JSON.parse((e as MessageEvent).data) as { order?: string[] };
      setEvents((prev) => [...prev, { type: "feature", feature: data }]);
    });
    es.addEventListener("task", (e) => {
      const data = JSON.parse((e as MessageEvent).data) as { task: TaskData };
      setEvents((prev) => [...prev, { type: "task", task: data.task }]);
    });
    es.addEventListener("done", () => {
      setDone(true);
      es.close();
    });
    es.onerror = () => es.close();

    return () => es.close();
  }, [id]);

  return (
    <main className={styles.main}>
      <p>
        <Link href="/">back</Link>
      </p>
      <h1>Pipeline {id}</h1>
      <div className={styles.stream}>
        {events.map((ev, i) =>
          ev.type === "feature" ? (
            <div key={i} className={styles.feature}>
              delegation order: {ev.feature?.order?.join(" -> ")}
            </div>
          ) : (
            <div key={i} className={styles.task}>
              <span className={styles.stage}>{ev.task?.stage}</span>
              <span className={styles.who}>{ev.task?.service ?? "supervisor"}</span>
              <span className={styles.route}>
                {ev.task?.agent}:{ev.task?.model}
              </span>
              <div className={styles.skills}>{ev.task?.skills.join(", ")}</div>
            </div>
          ),
        )}
      </div>
      {done && <p className={styles.done}>Plan complete (dry run).</p>}
    </main>
  );
}
