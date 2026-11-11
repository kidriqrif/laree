import { line as d3line } from 'd3-shape';
import { ChartFrame } from './ChartFrame.tsx';
import { fmtNumber } from './format.ts';
import { at, linear, maxOf, minOf } from './scales.ts';
import { useSize } from './useSize.ts';
import styles from './Sparkline.module.css';

export interface SparklineProps {
  /** Values in time order; null or NaN leaves a gap. */
  values: readonly (number | null)[];
  /** Names the series for screen readers, e.g. "Fitness, last 16 weeks". */
  label: string;
  /** Fixed width in px, for a trend inside a line of text or a table cell. Omit to fill the container. */
  width?: number;
  height?: number;
  formatValue?: (n: number) => string;
  /** CSS colour (a token variable) for the line; defaults to ink. */
  color?: string;
  className?: string;
}

const PAD = 4;

/** A tiny trend line for roster rows. Renders inline; its summary and table are for assistive tech. */
export function Sparkline({
  values,
  label,
  width,
  height = 24,
  formatValue = (n) => fmtNumber(n),
  color,
  className,
}: SparklineProps) {
  const [ref, measured] = useSize<HTMLDivElement>(96);
  const w = Math.max(8, width ?? measured);
  const h = Math.max(8, height);
  const clean = values.map((v) => (v != null && Number.isFinite(v) ? v : null));
  const present = clean.filter((v): v is number => v != null);
  const lo = minOf(present, 0);
  const hi = maxOf(present, 1);
  const x = linear([0, Math.max(1, clean.length - 1)], [PAD, w - PAD]);
  const y = linear(lo === hi ? [lo - 1, hi + 1] : [lo, hi], [h - PAD, PAD]);
  const gen = d3line<number | null>()
    .defined((v) => v != null)
    .x((_, i) => at(x, clean.length === 1 ? 0.5 : i))
    .y((v) => at(y, v));
  const path = gen(clean) ?? '';
  let lastIdx = -1;
  clean.forEach((v, i) => {
    if (v != null) lastIdx = i;
  });
  const lastV = lastIdx >= 0 ? clean[lastIdx] : null;

  const summary =
    present.length === 0
      ? `${label}: no data.`
      : `${label}: ${present.length} ${present.length === 1 ? 'point' : 'points'}, latest ${formatValue(
          present[present.length - 1] ?? 0,
        )}, lowest ${formatValue(lo)}, highest ${formatValue(hi)}.`;

  return (
    <ChartFrame
      variant="inline"
      title={label}
      summary={summary}
      table={{
        columns: ['Point', 'Value'],
        rows: clean.map((v, i) => [String(i + 1), v == null ? 'No data' : formatValue(v)]),
      }}
      className={className}
      // Without a fixed width the figure is a block, so it takes the width of its container.
      style={width ? { width } : { display: 'block' }}
    >
      <div ref={ref} className={styles.wrap}>
        <svg
          className={styles.svg}
          width={w}
          height={h}
          viewBox={`0 0 ${w} ${h}`}
          aria-hidden="true"
          focusable="false"
          style={color ? { ['--spark-color' as string]: color } : undefined}
        >
          {present.length === 0 ? (
            <line className={styles.base} x1={PAD} x2={w - PAD} y1={h / 2} y2={h / 2} />
          ) : (
            <>
              <path className={styles.line} d={path} />
              {lastV != null && (
                <circle
                  className={styles.dot}
                  cx={at(x, clean.length === 1 ? 0.5 : lastIdx)}
                  cy={at(y, lastV)}
                  r={3}
                />
              )}
            </>
          )}
        </svg>
      </div>
    </ChartFrame>
  );
}
