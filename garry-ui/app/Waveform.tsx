import styles from "./waveform.module.css";

/**
 * A linear audio style waveform. Pure CSS animation, no state. Pass active to
 * make it move faster and taller, as if the agent is "speaking".
 */
export default function Waveform({ bars = 40, active = false }: { bars?: number; active?: boolean }) {
  return (
    <div className={`${styles.wave} ${active ? styles.active : ""}`} aria-hidden="true">
      {Array.from({ length: bars }).map((_, i) => {
        // a smooth crest across the row so it reads like a voice wave
        const phase = Math.abs((i % 16) - 8);
        return (
          <span
            key={i}
            className={styles.bar}
            style={{ animationDelay: `${(phase * 0.06).toFixed(2)}s` }}
          />
        );
      })}
    </div>
  );
}
