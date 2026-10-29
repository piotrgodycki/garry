import type { ReactNode } from "react";
import styles from "./illustrations.module.css";

/**
 * The empty and first states tell one story: the soil, sprouts, Garry at
 * work. Drawn from the theme's tokens (soil, leaf, Garry's colours), so they
 * hold in both themes; each says what it shows for a screen reader.
 */
type Art = "caughtUp" | "connectRepo" | "plantFeature";

const worm = (d: string, width = 13, clitellum?: string) => (
  <>
    <path d={d} className={styles.worm} strokeWidth={width} />
    <path d={d} className={styles.ring} strokeWidth={width} strokeDasharray="1.4 8.4" strokeDashoffset="-4" />
    {clitellum && <path d={d} className={styles.clay} strokeWidth={width} strokeDasharray={clitellum} />}
  </>
);

const ART: Record<Art, { label: string; draw: ReactNode }> = {
  caughtUp: {
    label: "Garry rests on a mound of soil beside a sprout",
    draw: (
      <>
        <path d="M0 108Q60 88 120 100T240 96V140H0Z" className={styles.soil2} />
        <path d="M0 118Q80 106 150 116T240 112V140H0Z" className={styles.soil} />
        <circle cx="34" cy="126" r="3" className={styles.pebble} />
        <circle cx="196" cy="128" r="2.4" className={styles.pebble} />
        <circle cx="210" cy="122" r="1.6" className={styles.pebble} />
        <path d="M44 104V84" className={styles.stem} />
        <path d="M44 90c-8 0-12-5-12-12 8 0 12 5 12 12zM44 86c0-7 4-12 12-12 0 7-4 12-12 12z" className={styles.leaf} />
        {worm("M70 100C88 86 104 112 122 98S154 86 172 96", 13, "0 74 12 400")}
        <path d="M168 93q2.4 2 4.8 0" className={styles.ink} />
        <circle cx="176" cy="98.5" r="1.6" className={styles.cheek} />
        <text x="182" y="80" className={styles.zz} fontSize="11">
          z
        </text>
        <text x="190" y="70" className={styles.zz} fontSize="9">
          z
        </text>
      </>
    ),
  },
  connectRepo: {
    label: "Garry plugs a cable into a box holding a repository",
    draw: (
      <>
        <path d="M0 116Q90 104 240 114V140H0Z" className={styles.soil} />
        {worm("M58 122C58 98 80 94 82 72")}
        <circle cx="78.5" cy="70" r="1.6" className={styles.eye} />
        <circle cx="86" cy="71" r="1.6" className={styles.eye} />
        <path d="M79 76q3.4 2.4 6.6 0" className={styles.ink} />
        <path d="M92 80C118 92 126 54 158 62" className={styles.cable} />
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
    label: "Garry peeks out of the soil beside a sprout with a feature tag",
    draw: (
      <>
        <path d="M0 112Q70 96 130 108T240 104V140H0Z" className={styles.soil2} />
        <path d="M0 120Q100 110 240 118V140H0Z" className={styles.soil} />
        <ellipse cx="96" cy="114" rx="14" ry="4" className={styles.pebble} />
        {worm("M96 114C96 96 108 92 112 78")}
        <circle cx="108.5" cy="76" r="1.6" className={styles.eye} />
        <circle cx="116" cy="77.5" r="1.6" className={styles.eye} />
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
