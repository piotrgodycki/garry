import Link from "./lib/router";
import { usePathname } from "./lib/router";
import type { ReactNode } from "react";
import { Icon } from "./icons";

// Grouped by the job the human is doing: watch the work, configure Garry, review delivery.
const GROUPS: { label: string; links: { href: string; label: string; icon: ReactNode }[] }[] = [
  {
    label: "Overview",
    links: [
      { href: "/", label: "Dashboard", icon: Icon.dashboard },
      { href: "/agent", label: "Live agents", icon: Icon.agent },
    ],
  },
  {
    label: "Configure",
    links: [
      { href: "/registry", label: "Registry", icon: Icon.registry },
      { href: "/skills", label: "Skills", icon: Icon.skills },
      { href: "/routing", label: "Model routing", icon: Icon.routing },
    ],
  },
  {
    label: "Deliver",
    links: [{ href: "/github", label: "Pull requests", icon: Icon.prs }],
  },
];

export default function Nav() {
  const path = usePathname();
  const isActive = (href: string) =>
    href === "/" ? path === "/" : path.startsWith(href) || (href === "/agent" && (path.startsWith("/service") || path.startsWith("/pipeline")));
  return (
    <nav className="nav" aria-label="main">
      {GROUPS.map((g) => (
        <div key={g.label} className="navGroup">
          <span className="navLabel">{g.label}</span>
          {g.links.map((l) => {
            const active = isActive(l.href);
            return (
              <Link key={l.href} href={l.href} className={active ? "active" : ""} aria-current={active ? "page" : undefined}>
                <span className="navIcon">{l.icon}</span>
                {l.label}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
