import { useEffect, useState } from "react";
import type { GarryProjects } from "garry-client";
import Link, { usePathname } from "./lib/router";
import { client } from "./lib/client";
import { useGarryStatus } from "./lib/status";
import { GROUPS, matches } from "./Nav";
import GarryMark from "./GarryMark";
import { Icon } from "./icons";

/**
 * The rail on a wide screen: Garry (crawling while agents work), every page as
 * an icon with its name on hover and focus, the work that needs you as a badge
 * on Build, the projects as squares to switch between, and at the foot talking
 * to Garry, the theme and whether the server is up.
 */
export default function Rail() {
  const path = usePathname();
  const status = useGarryStatus();
  const needsYou = status?.counts.needsYou ?? 0;
  // one name label beside the rail, so the scrolling middle never clips it
  const [tip, setTip] = useState<{ text: string; y: number } | null>(null);
  const show = (e: { target: EventTarget | null }) => {
    const el = (e.target as HTMLElement | null)?.closest<HTMLElement>("[data-tip]");
    if (!el) return setTip(null);
    const r = el.getBoundingClientRect();
    setTip({ text: el.dataset.tip ?? "", y: r.top + r.height / 2 });
  };
  const hide = () => setTip(null);
  useEffect(() => setTip(null), [path]);
  return (
    <aside className="rail" aria-label="Garry" onMouseOver={show} onFocus={show} onMouseLeave={hide} onBlur={hide}>
      <Link href="/" className="railLogo" aria-label="Garry home">
        <GarryMark size={36} busy={(status?.counts.working ?? 0) > 0} />
      </Link>
      <div className="railMiddle" onScroll={hide}>
      <nav className="railNav" aria-label="main">
        {GROUPS.map((g, gi) => (
          <div key={g.label} className="railGroup" role="group" aria-label={g.label}>
            {gi > 0 && <span className="railSep" aria-hidden="true" />}
            {g.links.map((l) => {
              const on = matches(l, path);
              const badge = l.href === "/build" && needsYou > 0 ? needsYou : 0;
              return (
                <Link key={l.href} href={l.href} className={`railItem${on ? " on" : ""}`} aria-current={on ? "page" : undefined} aria-label={badge ? `${l.label}, ${badge} need you` : l.label} data-tip={l.label}>
                  {l.icon}
                  {badge > 0 && <span className="railBadge" aria-hidden="true">{badge}</span>}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
      <RailProjects />
      </div>
      <div className="railFoot">
        <button type="button" className="railTalk" aria-label="talk to Garry" data-tip="Talk to Garry  ⌘J" onClick={() => window.dispatchEvent(new Event("garry:voice"))}>
          {Icon.mic}
        </button>
        <ThemeCycle />
        <ServerDot />
      </div>
      {tip && (
        <span className="railFloat" style={{ top: tip.y }} aria-hidden="true">
          {tip.text}
        </span>
      )}
    </aside>
  );
}

/** The projects as squares: the one in use outlined, a dot while its agents work; + makes another. */
function RailProjects() {
  const [data, setData] = useState<GarryProjects | null>(null);
  const status = useGarryStatus();
  useEffect(() => {
    client.garryProjects().then(setData, () => undefined);
  }, []);
  if (!data) return null;
  const pick = async (id: string) => {
    if (id === data.active) return;
    await client.useGarryProject(id);
    window.location.reload();
  };
  return (
    <div className="railProjects" role="group" aria-label="projects">
      {data.projects.slice(0, 6).map((p) => (
        <button key={p.id} type="button" className={`railProject${p.id === data.active ? " on" : ""}`} aria-pressed={p.id === data.active} aria-label={`project ${p.name}`} data-tip={p.name} onClick={() => void pick(p.id)}>
          {p.name.slice(0, 1).toUpperCase()}
          {p.id === data.active && (status?.counts.working ?? 0) > 0 && <span className="railLive" aria-hidden="true" />}
        </button>
      ))}
      <Link href="/settings#projects" className="railProject add" aria-label="new project" data-tip="New project">
        +
      </Link>
    </div>
  );
}

type Theme = "light" | "system" | "dark";
const NEXT: Record<Theme, Theme> = { system: "light", light: "dark", dark: "system" };

/** One button for the theme: system, light, dark, round again. */
function ThemeCycle() {
  const [theme, setTheme] = useState<Theme>("system");
  useEffect(() => {
    try {
      const stored = localStorage.getItem("garry-theme");
      if (stored === "light" || stored === "dark") setTheme(stored);
    } catch {
      /* no storage: follow the system */
    }
  }, []);
  const next = () => {
    const t = NEXT[theme];
    setTheme(t);
    try {
      if (t === "system") localStorage.removeItem("garry-theme");
      else localStorage.setItem("garry-theme", t);
    } catch {
      /* the choice still holds for this visit */
    }
    if (t === "system") delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = t;
  };
  const icon = theme === "light" ? Icon.sun : theme === "dark" ? Icon.moon : Icon.monitor;
  return (
    <button type="button" className="railItem" aria-label={`theme: ${theme}`} data-tip={`Theme: ${theme}`} onClick={next}>
      {icon}
    </button>
  );
}

/** Is the server up: a dot, its words on hover. */
function ServerDot() {
  const [up, setUp] = useState<boolean | null>(null);
  useEffect(() => {
    let alive = true;
    const check = () => client.status().then(() => alive && setUp(true), () => alive && setUp(false));
    void check();
    const t = setInterval(check, 15000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);
  const label = up === null ? "Connecting" : up ? "Server online" : "Server offline";
  return (
    <span className="railServer" role="status" aria-label={label} data-tip={label} tabIndex={0}>
      <span className={`dot ${up === null ? "wait" : up ? "ok" : "danger"}`} />
    </span>
  );
}
