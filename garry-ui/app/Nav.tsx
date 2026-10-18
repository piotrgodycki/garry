"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Icon } from "./icons";

// On phones the nav becomes a bottom tab bar and shows the short labels.
// Grouped by the job the human is doing: watch the work, configure Garry, review delivery.
const GROUPS: { label: string; links: { href: string; label: string; short: string; icon: ReactNode }[] }[] = [
  {
    label: "Overview",
    links: [
      { href: "/", label: "Dashboard", short: "Home", icon: Icon.dashboard },
      { href: "/agent", label: "Live agents", short: "Agents", icon: Icon.agent },
      { href: "/lessons", label: "Lessons", short: "Lessons", icon: Icon.lesson },
    ],
  },
  {
    label: "Configure",
    links: [
      { href: "/registry", label: "Registry", short: "Registry", icon: Icon.registry },
      { href: "/skills", label: "Skills", short: "Skills", icon: Icon.skills },
      { href: "/routing", label: "Model routing", short: "Routing", icon: Icon.routing },
    ],
  },
  {
    label: "Deliver",
    links: [{ href: "/github", label: "Pull requests", short: "PRs", icon: Icon.prs }],
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
                <span className="navText">{l.label}</span>
                <span className="navShort">{l.short}</span>
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
