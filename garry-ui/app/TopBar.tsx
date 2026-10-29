import Link, { usePathname } from "./lib/router";
import { useGarryStatus } from "./lib/status";
import { pageOf } from "./Nav";
import ProjectSwitcher from "./projects/ProjectSwitcher";
import { Icon } from "./icons";

/**
 * The top bar on a wide screen: the project and the page you are on, and Garry
 * at a glance: how many agents need you, are working, have something ready.
 * Each count opens Build, where that work is.
 */
export default function TopBar() {
  const page = pageOf(usePathname());
  const status = useGarryStatus();
  const counts = status?.counts;
  const gauges = [
    { key: "needs-you", label: "need you", value: counts?.needsYou, icon: Icon.inbox, tone: "warn" },
    { key: "working", label: "working", value: counts?.working, icon: Icon.agent, tone: "run" },
    { key: "ready", label: "ready", value: counts?.done, icon: Icon.check, tone: "ok" },
  ];
  return (
    <header className="topbar">
      <div className="crumb">
        <ProjectSwitcher />
        <span className="crumbSep" aria-hidden="true">/</span>
        <span className="crumbPage">{page?.label ?? "Garry"}</span>
      </div>
      <nav className="gauges" aria-label="Garry at a glance">
        {gauges.map((g) => (
          <Link key={g.key} href="/build" className={`gauge ${g.tone}${g.value ? " lit" : ""}`} aria-label={`${g.value ?? 0} ${g.label}`}>
            {g.icon}
            <b>{g.value ?? 0}</b>
            <span>{g.label}</span>
          </Link>
        ))}
      </nav>
    </header>
  );
}
