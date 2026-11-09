// Track lap: the week's planned load as one lap of a 400 m track, one lane per sport
// (docs/spec/gamification.md section 5). The domain works out every number; this draws them.

import { useId, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { ComponentPropsWithoutRef, CSSProperties } from 'react';
import { LANE_SPORTS, lapText, plannedHoursText } from '../domain/gamification.ts';
import type { Lane, LapState } from '../domain/gamification.ts';
import { displayPct } from '../domain/metrics/compliance.ts';
import type { Sport } from '../domain/types.ts';
import { SPORT_LABEL, StatusGlyph } from '../ui/core/glyphs.tsx';
import styles from './TrackLap.module.css';

// ---------- Geometry (section 5.3) ----------

/** `compact` is the 120 px lap on Today's card; `full` is the lap on Week and Progress. */
export type TrackLapSize = 'compact' | 'full';

interface Preset {
  width: number;
  height: number;
  cx: number;
  cy: number;
  /** Straight length S. */
  straight: number;
  /** Outer radius R. */
  outer: number;
  laneWidth: number;
  gap: number;
  lightRadius: number;
  lightRing: number;
}

const PRESETS: Record<TrackLapSize, Preset> = {
  full: { width: 320, height: 200, cx: 160, cy: 100, straight: 120, outer: 96, laneWidth: 12, gap: 2, lightRadius: 5, lightRing: 1.5 },
  compact: { width: 320, height: 120, cx: 160, cy: 60, straight: 200, outer: 56, laneWidth: 8, gap: 2, lightRadius: 3.5, lightRing: 1 },
};

export interface LaneGeometry {
  /** Centreline radius r_k. */
  radius: number;
  /** Length of the closed centreline, P_k = 2S + 2πr_k. */
  perimeter: number;
  /** Stagger s_k = 2π(r_k − r_1): how far round its centreline the lane starts. */
  stagger: number;
}

export interface LapGeometry extends Preset {
  /** Lap length L = P_1. Every lane runs exactly this far from its start to the finish line. */
  length: number;
  /** Inside lane first. */
  lanes: LaneGeometry[];
}

/** Lane radii, staggers and the lap length for a preset and a number of lanes (0 to 4). */
export function lapGeometry(size: TrackLapSize, laneCount: number): LapGeometry {
  const p = PRESETS[size];
  const n = Math.max(0, Math.min(LANE_SPORTS.length, Math.floor(laneCount)));
  const radii = Array.from({ length: n }, (_, i) => p.outer - (n - 1 - i) * (p.laneWidth + p.gap) - p.laneWidth / 2);
  const r1 = radii[0] ?? 0;
  const lanes = radii.map((r) => ({
    radius: r,
    perimeter: 2 * p.straight + 2 * Math.PI * r,
    stagger: 2 * Math.PI * (r - r1),
  }));
  return { ...p, length: lanes[0]?.perimeter ?? 0, lanes };
}

/** Three decimals, never "-0". */
function num(v: number): string {
  const r = Math.round(v * 1000) / 1000;
  return String(r === 0 ? 0 : r);
}

interface PathPoint {
  x: number;
  y: number;
  /** Outward unit normal. */
  nx: number;
  ny: number;
}

/**
 * The point `d` units round a centreline of radius `r`, measured from the finish line and
 * running anticlockwise on screen: up the right bend, along the back straight, down the left
 * bend and along the home straight to the finish.
 */
function pointAt(g: LapGeometry, r: number, d: number): PathPoint {
  const half = g.straight / 2;
  const bend = Math.PI * r;
  const perimeter = 2 * g.straight + 2 * bend;
  let t = ((d % perimeter) + perimeter) % perimeter;
  if (t <= bend) {
    const a = t / r;
    return { x: g.cx + half + r * Math.sin(a), y: g.cy + r * Math.cos(a), nx: Math.sin(a), ny: Math.cos(a) };
  }
  t -= bend;
  if (t <= g.straight) return { x: g.cx + half - t, y: g.cy - r, nx: 0, ny: -1 };
  t -= g.straight;
  if (t <= bend) {
    const a = t / r;
    return { x: g.cx - half - r * Math.sin(a), y: g.cy - r * Math.cos(a), nx: -Math.sin(a), ny: -Math.cos(a) };
  }
  t -= bend;
  return { x: g.cx - half + t, y: g.cy + r, nx: 0, ny: 1 };
}

/**
 * A lane's lap segment: an open path from `from` units round its centreline to the finish
 * line. Starting at the stagger, it is exactly L long in every lane, so one dash pattern
 * fills every lane alike.
 */
function lanePath(g: LapGeometry, r: number, from: number): string {
  const half = g.straight / 2;
  const bend = Math.PI * r;
  const start = pointAt(g, r, from);
  const arc = (x: number, y: number) => `A${num(r)} ${num(r)} 0 0 0 ${num(x)} ${num(y)}`;
  const legs: Array<[number, string]> = [
    [bend, arc(g.cx + half, g.cy - r)],
    [bend + g.straight, `L${num(g.cx - half)} ${num(g.cy - r)}`],
    [2 * bend + g.straight, arc(g.cx - half, g.cy + r)],
    [2 * bend + 2 * g.straight, `L${num(g.cx + half)} ${num(g.cy + r)}`],
  ];
  const rest = legs.filter(([end]) => end > from + 1e-6).map(([, cmd]) => cmd);
  return [`M${num(start.x)} ${num(start.y)}`, ...rest].join(' ');
}

// ---------- Type in the infield, in SVG units ----------

/** Infield number size by lane count: fewer lanes leave a bigger infield. */
const NUMBER_SIZE: Record<TrackLapSize, readonly number[]> = {
  full: [0, 48, 46, 44, 40],
  compact: [0, 40, 38, 34, 28],
};
const CAPTION_SIZE = 13;
/** Cap height over font size, near enough for both faces. */
const CAP = 0.7;
/** Average advance of the caption face, per character, for a first guess at a width. */
const ADVANCE = 0.5;

const FILL_TRANSITION =
  'stroke-dashoffset var(--lap-fill-duration, var(--dur-fill)) var(--lap-fill-ease, var(--ease-lap))';

const SPORT_NAME: Record<Sport, string> = {
  swim: 'Swim',
  bike: 'Bike',
  run: 'Run',
  strength: 'Strength',
  other: 'Other activity',
};

function hm(seconds: number): string {
  const m = Math.round(Math.max(0, seconds) / 60);
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
}

function clamp01(v: number): number {
  return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0;
}

// ---------- Reduced motion ----------

const MOTION_QUERY = '(prefers-reduced-motion: reduce)';

function subscribeMotion(onChange: () => void): () => void {
  const m = typeof window === 'undefined' ? undefined : window.matchMedia?.(MOTION_QUERY);
  m?.addEventListener?.('change', onChange);
  return () => m?.removeEventListener?.('change', onChange);
}

function reducedMotionNow(): boolean {
  return typeof window !== 'undefined' && (window.matchMedia?.(MOTION_QUERY).matches ?? false);
}

function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribeMotion, reducedMotionNow, () => false);
}

// ---------- Small marks ----------

/**
 * A corner of the track, built like the l in the logo: a short straight, a bend round a centre
 * inside the infield, a short straight. This lane is drawn in its sport colour, so the key says
 * which lane by where it sits, not by colour alone. Lanes hang in from the outer edge as on the
 * track and stay thin, so a single lane still reads as a bend.
 */
function LaneSwatch({ index, count }: { index: number; count: number }) {
  // Bend centre (13, 3); the band's outer edge runs 1 unit in from the left and bottom.
  const bx = 13;
  const by = 3;
  const outer = 12;
  const gap = 1;
  const lw = Math.min(3.5, (10 - gap * (count - 1)) / count);
  return (
    <svg className={styles.mark} viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      {Array.from({ length: count }, (_, i) => {
        const r = outer - (count - 1 - i) * (lw + gap) - lw / 2;
        return (
          <path
            key={i}
            className={styles.markLane}
            data-on={i === index ? '' : undefined}
            d={`M${num(bx - r)} 1L${num(bx - r)} ${by}A${num(r)} ${num(r)} 0 0 0 ${bx} ${num(by + r)}L15 ${num(by + r)}`}
            strokeWidth={num(lw)}
          />
        );
      })}
    </svg>
  );
}

/** Caution: a triangle, never colour alone. */
function CautionGlyph() {
  return (
    <svg
      className={styles.caution}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      data-glyph="caution"
    >
      <path d="M12 3.5 21.5 20h-19z" />
      <path d="M12 10v4M12 17.2v.01" />
    </svg>
  );
}

/** The pace light as a key mark. */
function PaceDot() {
  return (
    <svg className={styles.dot} viewBox="0 0 12 12" aria-hidden="true" focusable="false">
      <circle className={styles.light} cx="6" cy="6" r="4.5" strokeWidth="1.5" />
    </svg>
  );
}

// ---------- Component ----------

export interface TrackLapProps extends Omit<ComponentPropsWithoutRef<'figure'>, 'children'> {
  /** The week's lap, from `lap()` in src/domain/gamification.ts. */
  lap: LapState;
  /** Defaults to `full`. */
  size?: TrackLapSize;
  /** Read the new short text in a polite live region when the lap changes, as after a save. Defaults to true. */
  announce?: boolean;
}

interface DrawnLane {
  lane: Lane;
  /** Lane centreline radius. */
  r: number;
  /** Where the lane starts round its centreline. */
  from: number;
  d: string;
  fill: number;
}

/**
 * The week as one lap of a track. The drawing is hidden from assistive tech: the figure is
 * named by the short text version and carries the full version as a visually hidden list.
 */
export function TrackLap({ lap: l, size = 'full', announce = true, className, ...rest }: TrackLapProps) {
  const id = useId().replace(/[^\w-]/g, '');
  const reduced = useReducedMotion();
  const text = lapText(l);
  const g = lapGeometry(size, l.lanes.length);
  const L = g.length;
  const w = g.laneWidth;
  const current = l.status === 'current';
  const future = l.status === 'future';
  // Caution: the fill stays at the finish line and nothing animates. Reduced motion: fills jump.
  const still = reduced || l.caution;

  const lanes: DrawnLane[] = l.lanes.flatMap((lane, i) => {
    const geo = g.lanes[i];
    if (!geo) return [];
    return [{ lane, r: geo.radius, from: geo.stagger, d: lanePath(g, geo.radius, geo.stagger), fill: clamp01(lane.fill) }];
  });
  const empty = lanes.length === 0;
  const anyOver = lanes.some((x) => x.lane.over);
  const hatchId = `${id}-over`;

  // Polite announcement after a change, never on first render.
  const [seen, setSeen] = useState(text.short);
  const [spoken, setSpoken] = useState('');
  if (seen !== text.short) {
    setSeen(text.short);
    setSpoken(text.short);
  }

  // ----- Infield -----
  const plan = current && l.expectedPct !== null && !empty ? `Plan by today ${displayPct(l.expectedPct)}%` : null;
  const numberText = future ? plannedHoursText(l) : `${displayPct(l.lapPct)}%`;
  const numberSize = Math.round((NUMBER_SIZE[size][lanes.length] ?? 0) * (future ? 0.8 : 1));
  const caption = future ? 'Planned' : current ? "of this week's plan" : "of the week's plan";
  const capN = CAP * numberSize;
  const capC = CAP * CAPTION_SIZE;
  const gapN = 0.24 * numberSize;
  const gapC = 0.6 * CAPTION_SIZE;
  const withCaption = size === 'full';
  const blockH = capN + (withCaption ? gapN + capC + (plan ? gapC + capC : 0) : 0);
  const numberBase = g.cy - blockH / 2 + capN;
  const captionBase = numberBase + gapN + capC;
  const planBase = captionBase + gapC + capC;

  const planRef = useRef<SVGTextElement | null>(null);
  const [planWidth, setPlanWidth] = useState<number | null>(null);
  // The plan line as drawn (full size only), measured in SVG units to centre it with its dot.
  const planShown = withCaption ? plan : null;
  useLayoutEffect(() => {
    const el = planRef.current;
    if (planShown === null || !el || typeof el.getComputedTextLength !== 'function') return;
    let live = true;
    const measure = () => {
      if (!live) return;
      const width = el.getComputedTextLength();
      if (Number.isFinite(width) && width > 0) {
        setPlanWidth((old) => (old !== null && Math.abs(old - width) < 0.5 ? old : width));
      }
    };
    measure();
    document.fonts?.ready.then(measure, () => undefined);
    return () => {
      live = false;
    };
  }, [planShown]);
  const planDot = g.lightRadius + g.lightRing / 2;
  const planGroup = 2 * planDot + 4 + (planWidth ?? (planShown ? planShown.length * ADVANCE * CAPTION_SIZE : 0));
  const planX = g.cx - planGroup / 2 + 2 * planDot + 4;

  // ----- Status lines under the lap -----
  const fullLap = l.status === 'past' && l.fullLap;
  const excused = l.status === 'past' && l.excused;

  const cls = [styles.root, className].filter(Boolean).join(' ');
  const nameId = `${id}-name`;

  return (
    <figure
      {...rest}
      className={cls}
      data-size={size}
      data-status={l.status}
      data-caution={l.caution ? '' : undefined}
      data-motion={still ? 'none' : 'fill'}
      aria-labelledby={nameId}
    >
      <figcaption id={nameId} className="sr-only">
        {text.short}
      </figcaption>

      <svg
        className={styles.svg}
        viewBox={`0 0 ${g.width} ${g.height}`}
        width={g.width}
        height={g.height}
        aria-hidden="true"
        focusable="false"
        data-lanes={lanes.length}
      >
        {anyOver ? (
          <defs>
            <pattern id={hatchId} patternUnits="userSpaceOnUse" width="4" height="4" patternTransform="rotate(45)">
              <rect className={styles.hatchLine} width="1" height="4" />
            </pattern>
          </defs>
        ) : null}

        {empty ? (
          <path className={styles.outline} d={`${lanePath(g, g.outer - 0.5, 0)}Z`} strokeWidth={1} data-part="edge" />
        ) : null}

        {lanes.map((x) => (
          <path key={x.lane.sport} className={styles.lane} d={x.d} strokeWidth={w} data-sport={x.lane.sport} data-part="lane" />
        ))}

        {lanes.map((x) => {
          if (x.from <= 0) return null;
          // A 1.5-unit start line square to the lane, a 1-unit hairline back from where the lane
          // starts, so it still reads as a line beside a dark fill (bike is near black).
          const p = pointAt(g, x.r, x.from - 1.75);
          return (
            <line
              key={x.lane.sport}
              className={styles.start}
              x1={num(p.x - (p.nx * w) / 2)}
              y1={num(p.y - (p.ny * w) / 2)}
              x2={num(p.x + (p.nx * w) / 2)}
              y2={num(p.y + (p.ny * w) / 2)}
              strokeWidth={1.5}
              data-part="start"
            />
          );
        })}

        {lanes.map((x) => {
          const style: CSSProperties = {
            strokeDasharray: `${num(L)} ${num(2 * L)}`,
            strokeDashoffset: num((1 - x.fill) * L),
            transition: still ? 'none' : FILL_TRANSITION,
          };
          return (
            <g key={x.lane.sport}>
              <path
                className={styles.fill}
                d={x.d}
                strokeWidth={w}
                style={style}
                data-sport={x.lane.sport}
                data-part="fill"
                data-fill={num(x.fill)}
                data-length={num(x.fill * L)}
                data-over={x.lane.over ? '' : undefined}
              />
              {x.lane.over ? (
                <path
                  className={styles.hatch}
                  d={x.d}
                  stroke={`url(#${hatchId})`}
                  strokeWidth={w}
                  style={style}
                  data-part="hatch"
                />
              ) : null}
            </g>
          );
        })}

        {empty ? null : (
          <line
            className={styles.finish}
            x1={num(g.cx + g.straight / 2)}
            y1={num(g.cy + (lanes[0]?.r ?? 0) - w / 2)}
            x2={num(g.cx + g.straight / 2)}
            y2={num(g.cy + g.outer)}
            strokeWidth={2}
            data-part="finish"
          />
        )}

        {current
          ? lanes.map((x) => {
              if (x.lane.light === null) return null;
              const p = pointAt(g, x.r, x.from + clamp01(x.lane.light) * L);
              return (
                <circle
                  key={x.lane.sport}
                  className={styles.light}
                  cx={num(p.x)}
                  cy={num(p.y)}
                  r={g.lightRadius}
                  strokeWidth={g.lightRing}
                  data-part="light"
                  data-sport={x.lane.sport}
                />
              );
            })
          : null}

        {empty ? (
          <text
            className={styles.note}
            x={g.cx}
            y={num(g.cy + (CAP * (CAPTION_SIZE + 2)) / 2)}
            fontSize={CAPTION_SIZE + 2}
            textAnchor="middle"
          >
            No plan this week
          </text>
        ) : (
          <>
            <text className={styles.number} x={g.cx} y={num(numberBase)} fontSize={numberSize} textAnchor="middle">
              {numberText}
            </text>
            {withCaption ? (
              <text className={styles.caption} x={g.cx} y={num(captionBase)} fontSize={CAPTION_SIZE} textAnchor="middle">
                {caption}
              </text>
            ) : null}
            {planShown ? (
              <>
                <circle
                  className={styles.light}
                  cx={num(g.cx - planGroup / 2 + planDot)}
                  cy={num(planBase - capC / 2)}
                  r={g.lightRadius}
                  strokeWidth={g.lightRing}
                />
                <text ref={planRef} className={styles.plan} x={num(planX)} y={num(planBase)} fontSize={CAPTION_SIZE}>
                  {planShown}
                </text>
              </>
            ) : null}
          </>
        )}
      </svg>

      {size === 'compact' && !empty ? (
        <ul className={styles.key} aria-hidden="true">
          {lanes.map((x, i) => (
            <li key={x.lane.sport} className={styles.item} data-sport={x.lane.sport}>
              <LaneSwatch index={i} count={lanes.length} />
              <span>{SPORT_LABEL[x.lane.sport]}</span>
              <span className={styles.pct}>{future ? `${hm(x.lane.plannedDurationS)} h` : `${displayPct(x.lane.pct)}%`}</span>
              {x.lane.over ? <CautionGlyph /> : null}
            </li>
          ))}
          {plan ? (
            <li className={styles.item}>
              <PaceDot />
              <span>{plan}</span>
            </li>
          ) : null}
        </ul>
      ) : null}

      {size === 'full' && (!empty || l.unlaned.length > 0) ? (
        <ul className={styles.legend} aria-hidden="true">
          {lanes.map((x, i) => (
            <li key={x.lane.sport} className={styles.row} data-sport={x.lane.sport} data-over={x.lane.over ? '' : undefined}>
              <LaneSwatch index={i} count={lanes.length} />
              <span className={styles.label}>
                {SPORT_LABEL[x.lane.sport]}
                {x.lane.over ? (
                  <span className={styles.over}>
                    <CautionGlyph />
                    More than planned
                  </span>
                ) : null}
              </span>
              <span className={styles.pct}>{future ? `${hm(x.lane.plannedDurationS)} h` : `${displayPct(x.lane.pct)}%`}</span>
            </li>
          ))}
          {l.unlaned.map((u) => (
            <li key={`unlaned-${u.sport}`} className={styles.aside}>
              {`${SPORT_NAME[u.sport]}: not in this week's plan`}
            </li>
          ))}
        </ul>
      ) : null}

      {fullLap ? (
        <p className={styles.status} data-tone="done">
          <StatusGlyph status="on-plan" size={16} />
          Full lap
        </p>
      ) : null}
      {excused ? (
        <p className={styles.status} data-tone="muted">
          Excused
        </p>
      ) : null}
      {l.caution ? (
        <p className={styles.status} data-tone="caution" aria-hidden="true">
          <CautionGlyph />
          That's more than planned. Coach can see it.
        </p>
      ) : null}

      {/* The full text version at both sizes: each lane's done, planned and pace light. */}
      {!empty || l.unlaned.length > 0 ? (
        <ul className="sr-only">
          {(empty ? [] : text.full).map((line) => (
            <li key={line}>{line}</li>
          ))}
          {l.unlaned.map((u) => (
            <li key={`unlaned-${u.sport}`}>{`${SPORT_NAME[u.sport]}: not in this week's plan.`}</li>
          ))}
        </ul>
      ) : null}

      {/* A status region (polite), read after a save changes the lap. */}
      <output className="sr-only" aria-live="polite" aria-atomic="true">
        {announce ? spoken : ''}
      </output>
    </figure>
  );
}
