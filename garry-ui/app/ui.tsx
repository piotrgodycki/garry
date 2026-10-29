import type { ReactNode } from "react";
import Link, { usePathname } from "./lib/router";
import { groupOf, pageOf } from "./Nav";
import { Icon } from "./icons";

/**
 * The header every page starts with: the page's own icon on a tile in its
 * menu group's colour, a way back or the menu group the page is in (the same
 * words as the menu), title, one line of context, actions.
 */
export function PageHeader({
  eyebrow,
  back,
  title,
  lede,
  actions,
  icon,
}: {
  eyebrow?: ReactNode;
  back?: { href: string; label: string };
  title: ReactNode;
  lede?: ReactNode;
  actions?: ReactNode;
  /** the tile's icon; the page's menu icon when left out */
  icon?: ReactNode;
}) {
  const path = usePathname();
  const group = groupOf(path);
  eyebrow ??= group;
  icon ??= pageOf(path)?.icon;
  return (
    <header className="pageHead">
      <div className="pageHeadMain">
      {icon && (
        <span className="pageIcon" data-group={group?.toLowerCase()} aria-hidden="true">
          {icon}
        </span>
      )}
      <div className="pageHeadText">
        {back ? (
          <Link href={back.href} className="eyebrow">
            <span style={{ display: "inline-flex", width: 14, height: 14 }}>{Icon.back}</span>
            {back.label}
          </Link>
        ) : (
          eyebrow && <span className="eyebrow">{eyebrow}</span>
        )}
        <h1>{title}</h1>
        {lede && <p className="lede">{lede}</p>}
      </div>
      </div>
      {actions && <div className="pageActions">{actions}</div>}
    </header>
  );
}

/** One consistent message when garry-server cannot be reached. */
export function ServerNotice() {
  return (
    <div className="notice" role="alert">
      {Icon.alert}
      <div>
        <strong>Cannot reach garry-server</strong>
        <span>
          Start it with <code>pnpm serve</code> (or <code>pnpm dev</code> for the whole app), then reload.
        </span>
      </div>
    </div>
  );
}

/** Loading placeholder blocks shaped like the content that is coming. */
export function Skeleton({ rows = 3, height = 56 }: { rows?: number; height?: number }) {
  return (
    <div style={{ display: "grid", gap: 10 }} aria-busy="true" aria-label="loading">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="skeleton" style={{ height }} />
      ))}
    </div>
  );
}

export function Empty({ icon, children }: { icon?: ReactNode; children: ReactNode }) {
  return (
    <div className="empty">
      {icon}
      <span>{children}</span>
    </div>
  );
}
