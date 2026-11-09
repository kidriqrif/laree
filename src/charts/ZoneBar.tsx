import { ChartFrame } from './ChartFrame.tsx';
import { fmtMinutesWords, fmtNumber } from './format.ts';
import { useSize } from './useSize.ts';
import styles from './ZoneBar.module.css';

export interface ZoneBarProps {
  /** Seconds in each of zones 1 to 5, in order. Missing zones count as 0. */
  seconds: readonly number[];
  title?: string;
  width?: number;
  height?: number;
  className?: string;
}

const ZONES = [1, 2, 3, 4, 5] as const;

/** Time in zones as one stacked bar, with Z1 to Z5 labels and minutes. */
export function ZoneBar({ seconds, title = 'Time in zones', width, height = 28, className }: ZoneBarProps) {
  const [ref, measured] = useSize<HTMLDivElement>(280);
  const w = Math.max(60, width ?? measured);
  const h = Math.max(16, height);
  const secs = ZONES.map((_, i) => {
    const v = seconds[i];
    return v != null && Number.isFinite(v) && v > 0 ? v : 0;
  });
  const total = secs.reduce((a, b) => a + b, 0);
  const mins = secs.map((s) => s / 60);

  const segs = ZONES.map((z, i) => {
    const s = secs[i] ?? 0;
    const before = secs.slice(0, i).reduce((a, b) => a + b, 0);
    const x0 = total > 0 ? (before / total) * (w - 1) + 0.5 : 0;
    const sw = total > 0 ? (s / total) * (w - 1) : 0;
    return { z, x0, sw, s, minutes: mins[i] ?? 0 };
  });

  const summary =
    total === 0
      ? `${title}: no time in zones.`
      : `${title}: ${fmtMinutesWords(total / 60)} in total. ` +
        segs
          .filter((g) => g.s > 0)
          .map((g) => `Z${g.z} ${fmtMinutesWords(g.minutes)} (${fmtNumber((g.s / total) * 100)}%)`)
          .join(', ') +
        '.';

  return (
    <ChartFrame
      title={title}
      summary={summary}
      table={{
        columns: ['Zone', 'Minutes', 'Share'],
        rows: segs.map((g) => [
          `Z${g.z}`,
          fmtNumber(g.minutes),
          total > 0 ? `${fmtNumber((g.s / total) * 100)}%` : '0%',
        ]),
      }}
      className={className}
    >
      <div ref={ref} className={styles.wrap}>
        <svg className={styles.svg} width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true" focusable="false">
          {total === 0 ? (
            <rect className={styles.track} x={0.5} y={0.5} width={w - 1} height={h - 1} />
          ) : (
            segs
              .filter((g) => g.sw > 0)
              .map((g) => (
                <g key={g.z}>
                  <title>{`Z${g.z}: ${fmtMinutesWords(g.minutes)}`}</title>
                  <rect
                    className={styles.seg}
                    x={g.x0}
                    y={0.5}
                    width={g.sw}
                    height={h - 1}
                    fill={`var(--zone-${g.z})`}
                  />
                  {g.sw >= 26 && (
                    <text
                      className={styles.segLabel}
                      x={g.x0 + g.sw / 2}
                      y={h / 2}
                      dy="0.34em"
                      textAnchor="middle"
                      fill={`var(--zone-on-${g.z})`}
                    >
                      {`Z${g.z}`}
                    </text>
                  )}
                </g>
              ))
          )}
        </svg>
        {total === 0 ? (
          <p className={styles.empty}>No time in zones yet.</p>
        ) : (
          <ul className={styles.legend}>
            {segs.map((g) => (
              <li key={g.z}>
                <span className={styles.swatch} style={{ background: `var(--zone-${g.z})` }} aria-hidden="true" />
                <span className={styles.zone}>{`Z${g.z}`}</span>
                <span className={styles.min}>{`${fmtNumber(g.minutes)} min`}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </ChartFrame>
  );
}
