import Link from "./lib/router";
import { usePathname } from "./lib/router";
import type { ReactNode } from "react";
import { Icon } from "./icons";

// Grouped the way the work flows: the work itself (an idea, agents building it,
// the pull requests it ships as), the project it happens in, and how Garry works.
export const GROUPS: { label: string; links: { href: string; label: string; icon: ReactNode; also?: string[] }[] }[] = [
  {
    label: "Work",
    links: [
      { href: "/", label: "Dashboard", icon: Icon.dashboard },
      { href: "/live", label: "Live", icon: Icon.live },
      { href: "/build", label: "Build", icon: Icon.code, also: ["/agent", "/pipeline", "/service"] },
      { href: "/files", label: "Files", icon: Icon.folder },
      { href: "/github", label: "Pull requests", icon: Icon.prs },
    ],
  },
  {
    label: "Project",
    links: [
      { href: "/registry", label: "Services", icon: Icon.registry },
      { href: "/architecture", label: "Architecture", icon: Icon.puzzle },
      { href: "/stacks", label: "Stacks", icon: Icon.stack },
      { href: "/layers", label: "Layers", icon: Icon.layers },
    ],
  },
  {
    label: "Garry",
    links: [
      { href: "/skills", label: "Skills", icon: Icon.skills },
      { href: "/routing", label: "Model routing", icon: Icon.routing },
      { href: "/settings", label: "Settings", icon: Icon.settings, also: ["/pair"] },
    ],
  },
];

/** The menu group a page belongs to, for its eyebrow: the same words as the menu. */
export const groupOf = (path: string) => GROUPS.find((g) => g.links.some((l) => matches(l, path)))?.label;

/** The menu entry a page belongs to: its name for the top bar. */
export const pageOf = (path: string) => GROUPS.flatMap((g) => g.links).find((l) => matches(l, path));

export const matches = (l: { href: string; also?: string[] }, path: string) =>
  l.href === "/" ? path === "/" : [l.href, ...(l.also ?? [])].some((h) => path === h || path.startsWith(`${h}/`));

export default function Nav() {
  const path = usePathname();
  return (
    <nav className="nav" aria-label="main">
      {GROUPS.map((g) => (
        <div key={g.label} className="navGroup">
          <span className="navLabel">{g.label}</span>
          {g.links.map((l) => {
            const active = matches(l, path);
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
