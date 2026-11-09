import { useId, useMemo, useState } from 'react';
import type { KeyboardEvent, PointerEvent } from 'react';
import type { DayOffset, RacePriority } from '../domain/types.ts';
import { formBand } from '../domain/metrics/fitness.ts';
import type { FitnessPoint, FormBand } from '../domain/metrics/fitness.ts';
import { Axis } from './Axis.tsx';
import { ChartFrame } from './ChartFrame.tsx';
import { finite, fmtDay, fmtNumber, fmtSigned } from './format.ts';
import { at, linear, margin, maxOf, minOf, niceTicks } from './scales.ts';
import { useSize } from './useSize.ts';
import styles from './PMC.module.css';

export interface PMCRace {
  day: DayOffset;
  name: string;
  priority: RacePriority;
}

export interface PMCProps {
  /** Daily Fitness, Fatigue and Form, in day order. Points with `projected: true` draw lighter. */
  points: readonly Pick<FitnessPoint, 'day' | 'fitness' | 'fatigue' | 'form' | 'projected'>[];
  today: DayOffset;
  races?: readonly PMCRace[];
  title?: string;
  width?: number;
  height?: number;
  className?: string;
}

export const FORM_BAND_LABEL: Record<FormBand, string> = {
  overreaching: 'Overreaching',
  building: 'Building',
  steady: 'Steady',
  fresh: 'Fresh',
  detraining: 'Detraining',
};

/** Band edges on the displayed Form value: [from, to, band]. */
const BANDS: readonly [number, number, FormBand][] = [
  [-Infinity, -30.5, 'overreaching'],
  [-30.5, -10.5, 'building'],
  [-10.5, 5.5, 'steady'],
  [5.5, 25.5, 'fresh'],
  [25.5, Infinity, 'detraining'],
];

interface XY {
  x: number;
  y: number;
}

function pathOf(pts: readonly XY[]): string {
  return pts
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${finite(p.x).toFixed(1)},${finite(p.y).toFixed(1)}`)
    .join('');
}

/** Fitness, Fatigue and Form over days, with Form bands, races and today. */
export function PMC({
  points,
  today,
  races = [],
  title = 'Fitness, Fatigue and Form',
  width,
  height = 240,
  className,
}: PMCProps) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const [ref, measured] = useSize<HTMLDivElement>(480);
  const w = Math.max(160, width ?? measured);
  const h = Math.max(120, height);
  const m = margin({ top: 22, right: 8, bottom: 22, left: 34 });
  const iw = w - m.left - m.right;
  const ih = h - m.top - m.bottom;

  const pts = useMemo(
    () =>
      points
        .filter((p) => Number.isFinite(p.day))
        .map((p) => ({
          day: p.day,
          fitness: finite(p.fitness),
          fatigue: finite(p.fatigue),
          form: finite(p.form),
          projected: p.projected,
        })),
    [points],
  );
  const n = pts.length;
  const firstDay = pts[0]?.day ?? today;
  const lastDay = pts[n - 1]?.day ?? today;

  // Default readout: the last completed day, else the last point.
  let defaultIdx = -1;
  pts.forEach((p, i) => {
    if (!p.projected) defaultIdx = i;
  });
  if (defaultIdx < 0) defaultIdx = n - 1;
  const [picked, setPicked] = useState<number | null>(null);
  const idx = n === 0 ? -1 : Math.min(picked ?? defaultIdx, n - 1);
  const sel = idx >= 0 ? pts[idx] : undefined;

  const all = pts.flatMap((p) => [p.fitness, p.fatigue, p.form, 0]);
  const yMin = Math.min(minOf(all, 0), 0);
  const yMax = Math.max(maxOf(all, 10), 10);
  const pad = (yMax - yMin) * 0.06;
  const y = linear([yMin - pad, yMax + pad], [ih, 0]);
  const x = linear([firstDay, lastDay], [0, iw]);
  const xp = (d: number) => (n <= 1 ? iw / 2 : at(x, d));

  const yTicks = niceTicks(yMin, yMax, 4).map((v) => ({
    pos: at(y, v),
    label: v < 0 ? fmtSigned(v) : fmtNumber(v),
  }));
  const xTicks =
    n === 0
      ? []
      : n === 1
        ? [{ pos: xp(firstDay), label: fmtDay(firstDay) }]
        : niceTicks(firstDay, lastDay, Math.max(2, Math.floor(iw / 80)))
            .filter((d) => Number.isInteger(d))
            .map((d) => ({ pos: xp(d), label: fmtDay(d) }));

  const draw = (key: 'fitness' | 'fatigue' | 'form') => {
    const done = pts.filter((p) => !p.projected).map((p) => ({ x: xp(p.day), y: at(y, p[key]) }));
    const planned = pts.filter((p) => p.projected).map((p) => ({ x: xp(p.day), y: at(y, p[key]) }));
    // Join the planned stretch to the last completed point so the line is unbroken.
    const lastDone = done[done.length - 1];
    if (lastDone && planned.length > 0) planned.unshift(lastDone);
    return {
      done: done.length > 1 ? pathOf(done) : '',
      planned: planned.length > 1 ? pathOf(planned) : '',
      single: n === 1 ? (done[0] ?? planned[0]) : undefined,
    };
  };
  const fitness = draw('fitness');
  const fatigue = draw('fatigue');
  const form = draw('form');
  const zeroY = at(y, 0);
  const formArea =
    n > 1
      ? `${pathOf(pts.map((p) => ({ x: xp(p.day), y: at(y, p.form) })))}L${xp(lastDay).toFixed(1)},${zeroY.toFixed(1)}L${xp(firstDay).toFixed(1)},${zeroY.toFixed(1)}Z`
      : '';

  const domLo = y.domain()[0] ?? 0;
  const domHi = y.domain()[1] ?? 1;
  const bandRects = BANDS.map(([lo, hi, band]) => {
    const a = Math.max(lo, domLo);
    const b = Math.min(hi, domHi);
    if (!(b > a)) return null;
    return { band, top: at(y, b), height: Math.max(0, at(y, a) - at(y, b)) };
  }).filter((r): r is { band: FormBand; top: number; height: number } => r !== null);

  const inRange = (d: number) => n > 0 && d >= firstDay && d <= lastDay;
  const visibleRaces = races.filter((r) => inRange(r.day));

  const step = (delta: number) =>
    setPicked(Math.max(0, Math.min(n - 1, (idx < 0 ? 0 : idx) + delta)));
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (n === 0) return;
    const k = e.key;
    if (k === 'ArrowRight') step(1);
    else if (k === 'ArrowLeft') step(-1);
    else if (k === 'PageUp') step(7);
    else if (k === 'PageDown') step(-7);
    else if (k === 'Home') setPicked(0);
    else if (k === 'End') setPicked(n - 1);
    else if (k === 'Escape') setPicked(null);
    else return;
    e.preventDefault();
  };
  const onMove = (e: PointerEvent<SVGSVGElement>) => {
    if (n === 0) return;
    const r = e.currentTarget.getBoundingClientRect();
    const d = x.invert(finite(e.clientX - r.left - m.left));
    let best = 0;
    let bd = Infinity;
    pts.forEach((p, i) => {
      const dd = Math.abs(p.day - d);
      if (dd < bd) {
        bd = dd;
        best = i;
      }
    });
    setPicked(best);
  };

  const latest = defaultIdx >= 0 ? pts[defaultIdx] : undefined;
  const summary = latest
    ? `${title}: ${n} ${n === 1 ? 'day' : 'days'}, ${fmtDay(firstDay)} to ${fmtDay(lastDay)}. ` +
      `Latest, ${fmtDay(latest.day)}: Fitness ${fmtNumber(latest.fitness)}, Fatigue ${fmtNumber(latest.fatigue)}, ` +
      `Form ${fmtSigned(latest.form)} (${FORM_BAND_LABEL[formBand(latest.form)]}).` +
      (visibleRaces.length > 0
        ? ` Races: ${visibleRaces.map((r) => `${r.name}, priority ${r.priority}, ${fmtDay(r.day)}`).join('; ')}.`
        : '')
    : `${title}: no data.`;

  const readId = `pmc-read-${uid}`;
  const selBand = sel ? formBand(sel.form) : null;
  const cx = sel ? xp(sel.day) : 0;
  const todayIn = inRange(today);

  return (
    <ChartFrame
      title={title}
      summary={summary}
      className={className}
      table={{
        columns: ['Day', 'Fitness', 'Fatigue', 'Form', 'Status'],
        rows: pts.map((p) => [
          fmtDay(p.day),
          fmtNumber(p.fitness),
          fmtNumber(p.fatigue),
          fmtSigned(p.form),
          p.projected ? 'Planned' : 'Done',
        ]),
      }}
    >
      <div ref={ref} className={styles.wrap}>
        <div
          className={styles.plot}
          tabIndex={0}
          // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- custom stepper, no native equivalent
          role="slider"
          aria-orientation="horizontal"
          aria-label={`${title}: day`}
          aria-valuemin={0}
          aria-valuemax={Math.max(0, n - 1)}
          aria-valuenow={Math.max(0, idx)}
          aria-valuetext={sel && selBand ? `${fmtDay(sel.day)}${sel.projected ? ' (planned)' : ''}: Fitness ${fmtNumber(sel.fitness)}, Fatigue ${fmtNumber(sel.fatigue)}, Form ${fmtSigned(sel.form)}, ${FORM_BAND_LABEL[selBand]}` : 'No data'}
          aria-describedby={readId}
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
              {bandRects.map((r) => (
                <rect
                  key={r.band}
                  className={styles.band}
                  data-band={r.band}
                  x={0}
                  width={iw}
                  y={r.top}
                  height={r.height}
                />
              ))}
              <Axis orient="left" ticks={yTicks} length={ih} grid={iw} line={false} />
              <g transform={`translate(0 ${ih})`}>
                <Axis orient="bottom" ticks={xTicks} length={iw} />
              </g>
              <line className={styles.zero} x1={0} x2={iw} y1={zeroY} y2={zeroY} />
              {formArea && <path className={styles.formArea} d={formArea} />}
              {visibleRaces.map((r, i) => (
                <g key={`${r.day}-${i}`} className={styles.race} transform={`translate(${xp(r.day)} 0)`}>
                  <title>{`${r.name}, priority ${r.priority}, ${fmtDay(r.day)}`}</title>
                  <line y1={-6} y2={ih} />
                  <rect x={-7} y={-20} width={14} height={14} rx={2} />
                  <text y={-9} textAnchor="middle">
                    {r.priority}
                  </text>
                </g>
              ))}
              {todayIn && (
                <g className={styles.today} transform={`translate(${xp(today)} 0)`}>
                  <line y1={0} y2={ih} />
                  <text y={ih - 4} x={4}>
                    Today
                  </text>
                </g>
              )}
              {[
                { s: fatigue, c: styles.fatigue },
                { s: fitness, c: styles.fitness },
                { s: form, c: styles.form },
              ].map(({ s, c }) => (
                <g key={c} className={c}>
                  {s.done && <path className={styles.line} d={s.done} />}
                  {s.planned && <path className={`${styles.line} ${styles.planned}`} d={s.planned} />}
                  {s.single && <circle className={styles.dot} cx={s.single.x} cy={s.single.y} r={4} />}
                </g>
              ))}
              {sel && (
                <g className={styles.cursor}>
                  <line x1={cx} x2={cx} y1={0} y2={ih} />
                  <circle className={styles.fitness} cx={cx} cy={at(y, sel.fitness)} r={4} />
                  <circle className={styles.fatigue} cx={cx} cy={at(y, sel.fatigue)} r={4} />
                  <circle className={styles.form} cx={cx} cy={at(y, sel.form)} r={4} />
                </g>
              )}
            </g>
          </svg>
        </div>
        <p id={readId} className={styles.readout} aria-live="polite" data-testid="pmc-readout">
          {sel && selBand ? (
            <>
              <span className={styles.readDay}>
                {fmtDay(sel.day)}
                {sel.projected ? ' (planned)' : ''}
              </span>
              <span className={styles.rv}>
                Fitness <b>{fmtNumber(sel.fitness)}</b>
              </span>
              <span className={styles.rv}>
                Fatigue <b>{fmtNumber(sel.fatigue)}</b>
              </span>
              <span className={styles.rv}>
                Form <b>{fmtSigned(sel.form)}</b> {FORM_BAND_LABEL[selBand]}
              </span>
            </>
          ) : (
            'No data yet.'
          )}
        </p>
        <ul className={styles.key}>
          <li>
            <span className={`${styles.swatch} ${styles.fitness}`} aria-hidden="true" />
            Fitness
          </li>
          <li>
            <span className={`${styles.swatch} ${styles.fatigue}`} aria-hidden="true" />
            Fatigue
          </li>
          <li>
            <span className={`${styles.swatch} ${styles.form} ${styles.dashed}`} aria-hidden="true" />
            Form
          </li>
          <li>
            <span className={`${styles.swatch} ${styles.fitness} ${styles.faint}`} aria-hidden="true" />
            Planned
          </li>
        </ul>
      </div>
    </ChartFrame>
  );
}
