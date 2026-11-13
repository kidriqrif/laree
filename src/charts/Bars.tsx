import { useId } from 'react';
import type { Sport } from '../domain/types.ts';
import { Axis } from './Axis.tsx';
import { ChartFrame } from './ChartFrame.tsx';
import { fmtNumber } from './format.ts';
import { at, band, linear, maxOf, margin, niceMax, niceTicks, thin } from './scales.ts';
import { useSize } from './useSize.ts';
import styles from './Bars.module.css';

export interface BarDatum {
  key: string;
  /** Axis label, e.g. "16 Nov". */
  label: string;
  value: number;
  /** Target for this bar; drawn as a marker across it. */
  target?: number | null;
  /** The period is not over yet (this week): drawn dashed and light, labelled "so far". */
  partial?: boolean;
}

export interface BarsProps {
  data: readonly BarDatum[];
  title: string;
  /** Names the measure in summaries, e.g. "Run volume". Defaults to the title. */
  measure?: string;
  /** Sport colour plus a texture, so colour is never the only cue. Omit for ink. */
  sport?: Sport;
  formatValue?: (n: number) => string;
  /** Column heading for the value, e.g. "Hours". */
  valueHeading?: string;
  width?: number;
  height?: number;
  className?: string;
}

const SPORT_NAME: Record<Sport, string> = {
  swim: 'Swim',
  bike: 'Bike',
  run: 'Run',
  strength: 'Strength',
  other: 'Other',
};

/** Texture per sport: swim horizontal lines, bike diagonal, strength cross-hatch, run solid. */
function texture(sport: Sport | undefined): 'h' | 'd' | 'x' | null {
  if (sport === 'swim') return 'h';
  if (sport === 'bike') return 'd';
  if (sport === 'strength') return 'x';
  return null;
}

/** Bar with only its top corners rounded, anchored to the baseline. */
/** A bar's period name; an unfinished one says "so far". */
const periodOf = (d: BarDatum): string => (d.partial ? `${d.label}, so far` : d.label);

function barPath(x: number, y: number, w: number, h: number, r: number): string {
  const rr = Math.max(0, Math.min(r, w / 2, h));
  return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`;
}

/** Weekly volume against a target marker. */
export function Bars({
  data,
  title,
  measure,
  sport,
  formatValue = (n) => fmtNumber(n),
  valueHeading = 'Volume',
  width,
  height = 160,
  className,
}: BarsProps) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const [ref, measured] = useSize<HTMLDivElement>(320);
  const w = Math.max(80, width ?? measured);
  const h = Math.max(60, height);
  const m = margin({ top: 14, right: 6, bottom: 22, left: 38 });
  const iw = w - m.left - m.right;
  const ih = h - m.top - m.bottom;

  const safe = data.map((d) => ({
    ...d,
    value: Number.isFinite(d.value) ? Math.max(0, d.value) : 0,
    target: d.target != null && Number.isFinite(d.target) && d.target > 0 ? d.target : null,
  }));
  const top = niceMax(maxOf(safe.flatMap((d) => [d.value, d.target])), 4);
  const y = linear([0, top], [ih, 0]);
  const x = band(
    safe.map((d) => d.key),
    [0, iw],
    safe.length > 40 ? 0.1 : 0.25,
  );
  const bw = x.bandwidth();
  const pattern = texture(sport);
  const patId = `bars-${uid}`;
  const labelMax = Math.max(1, Math.floor(iw / 44));
  const xTicks = thin(safe, labelMax).map(({ item }) => ({
    pos: (x(item.key) ?? 0) + bw / 2,
    label: item.label,
  }));
  const yTicks = niceTicks(0, top, 4).map((v) => ({ pos: at(y, v), label: formatValue(v) }));
  const color = sport && sport !== 'other' ? `var(--sport-${sport})` : undefined;
  const name = measure ?? title;
  const lastIdx = safe.length - 1;
  const last = safe[lastIdx];

  const withTarget = safe.filter((d) => d.target != null);
  // An unfinished period cannot have met or missed its target yet.
  const judged = withTarget.filter((d) => !d.partial);
  const met = judged.filter((d) => d.value >= (d.target ?? 0)).length;
  const anyPartial = safe.some((d) => d.partial);
  const sportText = sport ? ` Sport: ${SPORT_NAME[sport]}.` : '';
  let summary: string;
  if (safe.length === 0) {
    summary = `${name}: no data.${sportText}`;
  } else {
    const hiBar = safe.reduce((a, b) => (b.value > a.value ? b : a), safe[0] ?? { key: '', label: '', value: 0, target: null });
    summary =
      `${name}: ${safe.length} ${safe.length === 1 ? 'bar' : 'bars'}.${sportText} ` +
      `Latest, ${last ? periodOf(last) : ''}: ${formatValue(last?.value ?? 0)}` +
      (last?.target != null ? ` against a target of ${formatValue(last.target)}.` : '.') +
      ` Highest, ${periodOf(hiBar)}: ${formatValue(hiBar.value)}.` +
      (judged.length > 0 ? ` Target met in ${met} of ${judged.length}.` : '');
  }

  return (
    <ChartFrame
      title={title}
      summary={summary}
      table={{
        columns: ['Period', valueHeading, 'Target'],
        rows: safe.map((d) => [
          periodOf(d),
          formatValue(d.value),
          d.target == null ? 'None' : formatValue(d.target),
        ]),
      }}
      className={className}
    >
      <div ref={ref} className={styles.wrap}>
        <svg
          className={styles.svg}
          width={w}
          height={h}
          viewBox={`0 0 ${w} ${h}`}
          aria-hidden="true"
          focusable="false"
          style={color ? { ['--bar-color' as string]: color } : undefined}
        >
          {pattern && (
            <defs>
              <pattern id={patId} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform={pattern === 'h' ? undefined : 'rotate(45)'}>
                <path className={styles.pattern} d={pattern === 'x' ? 'M0,3H6M3,0V6' : 'M0,3H6'} />
              </pattern>
            </defs>
          )}
          <g transform={`translate(${m.left} ${m.top})`}>
            <Axis orient="left" ticks={yTicks} length={ih} grid={iw} line={false} />
            <g transform={`translate(0 ${ih})`}>
              <Axis orient="bottom" ticks={xTicks} length={iw} />
            </g>
            {safe.map((d, i) => {
              const bx = x(d.key) ?? 0;
              const bh = Math.max(0, ih - at(y, d.value));
              const by = ih - bh;
              const tip = `${periodOf(d)}: ${formatValue(d.value)}${d.target != null ? `, target ${formatValue(d.target)}` : ''}`;
              return (
                <g key={d.key + i} className={styles.group} data-partial={d.partial || undefined}>
                  <title>{tip}</title>
                  {bh > 0 && (
                    <>
                      <path className={d.partial ? styles.partial : styles.bar} d={barPath(bx, by, bw, bh, 4)} />
                      {pattern && !d.partial && <path d={barPath(bx, by, bw, bh, 4)} fill={`url(#${patId})`} />}
                    </>
                  )}
                  {d.target != null && (
                    <>
                      <line className={styles.targetHalo} x1={bx - 1} x2={bx + bw + 1} y1={at(y, d.target)} y2={at(y, d.target)} />
                      <line className={styles.target} x1={bx - 1} x2={bx + bw + 1} y1={at(y, d.target)} y2={at(y, d.target)} />
                    </>
                  )}
                </g>
              );
            })}
            {last && (
              <text
                className={styles.value}
                x={Math.min(iw, (x(last.key) ?? 0) + bw / 2)}
                y={Math.max(-2, at(y, Math.max(last.value, last.target ?? 0)) - 4)}
                textAnchor="end"
              >
                {formatValue(last.value)}
              </text>
            )}
          </g>
        </svg>
        <ul className={styles.key} style={color ? { ['--bar-color' as string]: color } : undefined}>
          <li>
            <span className={styles.keyBar} aria-hidden="true" />
            {sport ? SPORT_NAME[sport] : valueHeading}
          </li>
          {anyPartial && (
            <li>
              <span className={`${styles.keyBar} ${styles.keyPartial}`} aria-hidden="true" />
              This week so far
            </li>
          )}
          {withTarget.length > 0 && (
            <li>
              <span className={styles.keyTick} aria-hidden="true" />
              Target
            </li>
          )}
        </ul>
      </div>
    </ChartFrame>
  );
}
