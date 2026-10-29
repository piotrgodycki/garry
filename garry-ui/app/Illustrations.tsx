import type { ReactNode } from "react";
import styles from "./illustrations.module.css";

/**
 * The empty and first states tell one story: the soil, things growing in it,
 * the repositories the work lives in. Drawn from the theme's tokens (soil, leaf, Garry's colours), so they
 * hold in both themes; each says what it shows for a screen reader.
 */
type Art = "caughtUp" | "connectRepo" | "plantFeature";

const ART: Record<Art, { label: string; draw: ReactNode }> = {
  caughtUp: {
    label: "Sprouts growing in the soil under a quiet sun",
    draw: (
      <>
        <circle cx="178" cy="46" r="15" className={styles.sun} />
        <path d="M171 46.5l5 5 9-10" className={styles.tick} />
        <path d="M0 108Q60 88 120 100T240 96V140H0Z" className={styles.soil2} />
        <path d="M0 118Q80 106 150 116T240 112V140H0Z" className={styles.soil} />
        <circle cx="34" cy="126" r="3" className={styles.pebble} />
        <circle cx="196" cy="128" r="2.4" className={styles.pebble} />
        <circle cx="210" cy="122" r="1.6" className={styles.pebble} />
        <path d="M70 104V80" className={styles.stem} />
        <path d="M70 88c-9 0-14-6-14-14 9 0 14 6 14 14zM70 84c0-8 5-14 14-14 0 8-5 14-14 14z" className={styles.leaf} />
        <path d="M118 102V72" className={styles.stem} />
        <path d="M118 84c-11 0-17-7-17-17 11 0 17 7 17 17zM118 78c0-10 6-17 17-17 0 10-6 17-17 17zM118 94c-8 0-13-5-13-12 8 0 13 5 13 12z" className={styles.leaf} />
        <path d="M160 104V90" className={styles.stem} />
        <path d="M160 94c-6 0-9-4-9-9 6 0 9 4 9 9zM160 92c0-5 3-9 9-9 0 5-3 9-9 9z" className={styles.leaf} />
      </>
    ),
  },
  connectRepo: {
    label: "A cable plugging into a box holding a repository",
    draw: (
      <>
        <path d="M0 116Q90 104 240 114V140H0Z" className={styles.soil} />
        <path d="M44 108V92" className={styles.stem} />
        <path d="M44 98c-7 0-11-5-11-11 7 0 11 5 11 11zM44 95c0-6 4-11 11-11 0 6-4 11-11 11z" className={styles.leaf} />
        <path d="M30 70C70 70 92 92 118 80S140 62 150 62" className={styles.cable} />
        <rect x="150" y="57" width="10" height="10" rx="2" className={styles.plug} />
        <rect x="160" y="36" width="58" height="48" rx="9" className={styles.box} />
        <circle cx="176" cy="50" r="3.4" className={styles.git} />
        <circle cx="176" cy="70" r="3.4" className={styles.git} />
        <circle cx="202" cy="70" r="3.4" className={styles.git} />
        <path d="M176 53.4v13.2M202 66.6V61a5 5 0 00-5-5h-6" className={styles.git} />
      </>
    ),
  },
  plantFeature: {
    label: "A sprout with a feature tag, ready to grow",
    draw: (
      <>
        <path d="M0 112Q70 96 130 108T240 104V140H0Z" className={styles.soil2} />
        <path d="M0 120Q100 110 240 118V140H0Z" className={styles.soil} />
        <ellipse cx="96" cy="114" rx="14" ry="4" className={styles.pebble} />
        <circle cx="70" cy="122" r="2.4" className={styles.pebble} />
        <path d="M156 108V64" className={styles.stem} />
        <path d="M156 80c-12 0-18-7-18-18 12 0 18 7 18 18zM156 72c0-11 6-18 18-18 0 11-6 18-18 18zM156 94c-9 0-14-5-14-13 9 0 14 5 14 13z" className={styles.leaf} />
        <path d="M168 104v-26" className={styles.cable} />
        <rect x="164" y="80" width="44" height="18" rx="4" className={styles.tag} />
        <text x="171" y="92.5" className={styles.tagText}>
          FEAT-1
        </text>
      </>
    ),
  },
};

/** An empty state with its picture: what it shows, what it means, and what to do. */
export default function Illustrated({ art, title, children, action }: { art: Art; title: string; children?: ReactNode; action?: ReactNode }) {
  const a = ART[art];
  return (
    <div className={styles.state} data-art={art}>
      <svg className={styles.art} viewBox="0 0 240 140" role="img" aria-label={a.label}>
        {a.draw}
      </svg>
      <b className={styles.title}>{title}</b>
      {children && <p className={styles.text}>{children}</p>}
      {action && <div className={styles.action}>{action}</div>}
    </div>
  );
}
