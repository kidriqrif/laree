import { useMemo, useState } from 'react';
import type { KeyboardEvent, PointerEvent } from 'react';
import { Axis } from './Axis.tsx';
import { ChartFrame } from './ChartFrame.tsx';
import { finite, fmtNumber } from './format.ts';
import { at, linear, margin, maxOf, minOf, niceMax, niceTicks } from './scales.ts';
import { useSize } from './useSize.ts';
import styles from './Curve.module.css';

export interface CurvePoint {
  /** Duration of the best effort in seconds. */
  seconds: number;
  /** Power in watts, or speed in metres per second for a pace curve. */
  value: number;
}

export interface CurveProps {
  /** Best efforts for the main period. */
  points: readonly CurvePoint[];
  /** Best efforts for a comparison period, drawn lighter. */
  comparison?: readonly CurvePoint[];
  title?: string;
  /** Name of the main period, e.g. "Season best". */
  label?: string;
  comparisonLabel?: string;
  /** Formats a value for labels, e.g. `(v) => fmtPace(v, 'run')`. Defaults to whole watts. */
  formatValue?: (v: number) => string;
  /** Formats an axis value; defaults to `formatValue`. */
  formatAxis?: (v: number) => string;
  /** Start the value axis at zero. On by default for power; turn off for pace. */
  fromZero?: boolean;
  width?: number;
  height?: number;
  className?: string;
}

export const CURVE_MIN_S = 5;
export const CURVE_MAX_S = 18000;
const SPAN = Math.log(CURVE_MAX_S / CURVE_MIN_S);

const TICK_SECONDS = [5, 10, 30, 60, 300, 600, 1200, 3600, 7200, 18000];

/** Duration as a short axis or readout label: "30 s", "5 min", "1 h". */
export function fmtSpan(seconds: number): string {
  if (!Number.isFinite(seconds)) return '–';
  const s = Math.round(seconds);
  if (s < 60) return `${s} s`;
  if (s < 3600) {
    const m = s / 60;
    return Number.isInteger(m) ? `${m} min` : `${Math.floor(m)} min ${String(s % 60).padStart(2, '0')} s`;
  }
  const h = s / 3600;
  return Number.isInteger(h) ? `${h} h` : `${Math.floor(h)} h ${String(Math.round((s % 3600) / 60)).padStart(2, '0')} min`;
}

function clean(pts: readonly CurvePoint[] | undefined): CurvePoint[] {
  return (pts ?? [])
    .filter((p) => Number.isFinite(p.seconds) && Number.isFinite(p.value) && p.seconds > 0)
    .map((p) => ({ seconds: Math.min(CURVE_MAX_S, Math.max(CURVE_MIN_S, p.seconds)), value: p.value }))
    .toSorted((a, b) => a.seconds - b.seconds);
}

/** Best-effort power or pace against duration on a log axis, 5 s to 5 h. */
export function Curve({
  points,
  comparison,
  title = 'Best efforts',
  label = 'This period',
  comparisonLabel = 'Comparison',
  formatValue = (v) => `${fmtNumber(v)} W`,
  formatAxis,
  fromZero = true,
  width,
  height = 220,
  className,
}: CurveProps) {
  const [ref, measured] = useSize<HTMLDivElement>(480);
  const w = Math.max(160, width ?? measured);
  const h = Math.max(100, height);
  const m = margin({ top: 8, right: 10, bottom: 22, left: 44 });
  const iw = w - m.left - m.right;
  const ih = h - m.top - m.bottom;

  const main = useMemo(() => clean(points), [points]);
  const comp = useMemo(() => clean(comparison), [comparison]);
  const axisFmt = formatAxis ?? formatValue;
  const [picked, setPicked] = useState<number | null>(null);
  const n = main.length;
  const idx = n === 0 ? -1 : Math.min(picked ?? n - 1, n - 1);
  const sel = idx >= 0 ? main[idx] : undefined;
  const compAt = (s: number) => comp.find((p) => p.seconds === s);

  const vals = [...main, ...comp].map((p) => p.value);
  const hi = maxOf(vals, 1);
  const lo = minOf(vals, 0);
  const top = fromZero ? niceMax(hi, 4) : hi * 1.05;
  const bottom = fromZero ? 0 : Math.max(0, lo * 0.85);
  const y = linear([bottom, top], [ih, 0]);
  const xp = (s: number) => finite((Math.log(s / CURVE_MIN_S) / SPAN) * iw);
  const yTicks = niceTicks(bottom, top, 4).map((v) => ({ pos: at(y, v), label: axisFmt(v) }));
  const xTicks = TICK_SECONDS.map((s) => ({ pos: xp(s), label: fmtSpan(s) })).filter(
    (_, i, a) => iw >= 360 || i % 2 === 0 || i === a.length - 1,
  );

  const pathOf = (pts: readonly CurvePoint[]) =>
    pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${xp(p.seconds).toFixed(1)},${at(y, p.value).toFixed(1)}`).join('');

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (n === 0) return;
    const cur = idx < 0 ? 0 : idx;
    if (e.key === 'ArrowRight') setPicked(Math.min(n - 1, cur + 1));
    else if (e.key === 'ArrowLeft') setPicked(Math.max(0, cur - 1));
    else if (e.key === 'Home') setPicked(0);
    else if (e.key === 'End') setPicked(n - 1);
    else if (e.key === 'Escape') setPicked(null);
    else return;
    e.preventDefault();
  };
  const onMove = (e: PointerEvent<SVGSVGElement>) => {
    if (n === 0) return;
    const r = e.currentTarget.getBoundingClientRect();
    const px = finite(e.clientX - r.left - m.left);
    let best = 0;
    let bd = Infinity;
    main.forEach((p, i) => {
      const d = Math.abs(xp(p.seconds) - px);
      if (d < bd) {
        bd = d;
        best = i;
      }
    });
    setPicked(best);
  };

  const best = n === 0 ? undefined : main.reduce((a, b) => (b.value > a.value ? b : a), main[0] ?? { seconds: 0, value: 0 });
  const summary =
    n === 0
      ? `${title}: no data.`
      : `${title}: ${n} ${n === 1 ? 'duration' : 'durations'}, ${fmtSpan(main[0]?.seconds ?? 0)} to ${fmtSpan(main[n - 1]?.seconds ?? 0)}. ` +
        `${label}: best ${formatValue(best?.value ?? 0)} over ${fmtSpan(best?.seconds ?? 0)}.` +
        (comp.length > 0 ? ` ${comparisonLabel} has ${comp.length} ${comp.length === 1 ? 'duration' : 'durations'}.` : '');

  const cx = sel ? xp(sel.seconds) : 0;
  const compSel = sel ? compAt(sel.seconds) : undefined;
  const hasPlot = n > 0 || comp.length > 0;

  return (
    <ChartFrame
      title={title}
      summary={summary}
      className={className}
      table={{
        columns: ['Duration', label, comparisonLabel],
        rows: main.map((p) => {
          const c = compAt(p.seconds);
          return [fmtSpan(p.seconds), formatValue(p.value), c ? formatValue(c.value) : 'None'];
        }),
      }}
    >
      <div ref={ref} className={styles.wrap}>
        <div
          className={styles.plot}
          tabIndex={0}
          // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- custom stepper, no native equivalent
          role="slider"
          aria-orientation="horizontal"
          aria-label={`${title}: duration`}
          aria-valuemin={0}
          aria-valuemax={Math.max(0, n - 1)}
          aria-valuenow={Math.max(0, idx)}
          aria-valuetext={sel ? `${fmtSpan(sel.seconds)}: ${formatValue(sel.value)}` : 'No data'}
          onKeyDown={onKey}
        >
          <svg
            className={styles.svg}
            width={w}
            height={h}
            viewBox={`0 0 ${w} ${h}`}
            aria-hidden="true"
            focusable="false"
            onPointerMove={onMove}
            onPointerLeave={() => setPicked(null)}
          >
            <g transform={`translate(${m.left} ${m.top})`}>
              <Axis orient="left" ticks={yTicks} length={ih} grid={iw} line={false} />
              <g transform={`translate(0 ${ih})`}>
                <Axis orient="bottom" ticks={xTicks} length={iw} />
              </g>
              {hasPlot && comp.length > 1 && <path className={styles.comp} d={pathOf(comp)} />}
              {comp.length === 1 && comp[0] && (
                <circle className={styles.compDot} cx={xp(comp[0].seconds)} cy={at(y, comp[0].value)} r={4} />
              )}
              {n > 1 && <path className={styles.main} d={pathOf(main)} />}
              {n === 1 && main[0] && (
                <circle className={styles.mainDot} cx={xp(main[0].seconds)} cy={at(y, main[0].value)} r={4} />
              )}
              {sel && (
                <g className={styles.cursor}>
                  <line x1={cx} x2={cx} y1={0} y2={ih} />
                  {compSel && <circle className={styles.compDot} cx={cx} cy={at(y, compSel.value)} r={4} />}
                  <circle className={styles.mainDot} cx={cx} cy={at(y, sel.value)} r={4} />
                </g>
              )}
            </g>
          </svg>
        </div>
        <p className={styles.readout} aria-live="polite" data-testid="curve-readout">
          {sel ? (
            <>
              <span className={styles.readDay}>{fmtSpan(sel.seconds)}</span>
              <span className={styles.rv}>
                {label} <b>{formatValue(sel.value)}</b>
              </span>
              {compSel && (
                <span className={styles.rv}>
                  {comparisonLabel} <b>{formatValue(compSel.value)}</b>
                </span>
              )}
            </>
          ) : (
            'No efforts yet.'
          )}
        </p>
        <ul className={styles.key}>
          <li>
            <span className={`${styles.swatch} ${styles.swMain}`} aria-hidden="true" />
            {label}
          </li>
          {comp.length > 0 && (
            <li>
              <span className={`${styles.swatch} ${styles.swComp}`} aria-hidden="true" />
              {comparisonLabel}
            </li>
          )}
        </ul>
      </div>
    </ChartFrame>
  );
}
