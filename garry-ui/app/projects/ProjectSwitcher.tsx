import { useEffect, useRef, useState } from "react";
import type { GarryProjects } from "garry-client";
import { client } from "../lib/client";
import Link from "../lib/router";
import { Icon } from "../icons";
import styles from "./projects.module.css";

/**
 * The project in use, at the top of the sidebar: everything below it (the
 * registry, stacks, architecture, routing, the repositories in Build) is this
 * project's. Switching reloads the dashboard on the other project.
 */
export default function ProjectSwitcher() {
  const [data, setData] = useState<GarryProjects | null>(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    client.garryProjects().then(setData, () => undefined);
  }, []);
  // close on a click outside or Escape
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  if (!data) return null;
  const active = data.projects.find((p) => p.id === data.active);
  const pick = async (id: string) => {
    if (id === data.active) return setOpen(false);
    try {
      await client.useGarryProject(id);
      window.location.reload();
    } catch (e) {
      setError(String((e as Error).message ?? e));
    }
  };

  return (
    <div className={styles.switcher} ref={box}>
      <button
        className={styles.current}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => {
          // the list may have changed in Settings since the page loaded
          if (!open) client.garryProjects().then(setData, () => undefined);
          setOpen(!open);
        }}
      >
        <span className={styles.avatar} aria-hidden="true">
          {(active?.name ?? "?").slice(0, 1).toUpperCase()}
        </span>
        <span className={styles.currentText}>
          <span className={styles.currentLabel}>Project</span>
          <span className={styles.currentName}>{active?.name ?? data.active}</span>
        </span>
        <span className={`${styles.chevron} ${open ? styles.chevronOpen : ""}`}>{Icon.chevron}</span>
      </button>
      {open && (
        <div className={styles.menu} role="listbox" aria-label="projects">
          {data.projects.map((p) => (
            <button key={p.id} role="option" aria-selected={p.id === data.active} className={`${styles.option} ${p.id === data.active ? styles.optionOn : ""}`} onClick={() => void pick(p.id)}>
              <span className={styles.avatar} aria-hidden="true">
                {p.name.slice(0, 1).toUpperCase()}
              </span>
              <span className={styles.currentText}>
                <span className={styles.currentName}>{p.name}</span>
                <span className={styles.currentLabel}>
                  {p.repos?.length ?? 0} repo{p.repos?.length === 1 ? "" : "s"}
                  {p.pendingRepos?.length ? ` · ${p.pendingRepos.length} to clone` : ""}
                </span>
              </span>
              {p.id === data.active && <span className={styles.check}>{Icon.check}</span>}
            </button>
          ))}
          <div className={styles.menuFoot}>
            <Link href="/settings#projects" className={styles.manage} onClick={() => setOpen(false)}>
              New, import, export…
            </Link>
          </div>
          {error && <span className="badge danger">{error}</span>}
        </div>
      )}
    </div>
  );
}
