/**
 * Laree logo geometry: every logo shape is computed here from a few numbers. No pasted path data.
 * Pure TypeScript: no DOM, no Node APIs, no side effects.
 *
 * Units: the logo grid is 48 units tall (the height of the l). Lane pitch 3 = lane 2.4 + lane line 0.6,
 * so the grid is 16 pitches. Geometry is worked out with y pointing up from the baseline; the path
 * writer flips it, so every path returned here is in SVG space: y points down, the top of the grid is
 * y = 0 and the baseline is y = 48.
 *
 * The idea: the l is a 400 m track bend. The stem is the straight, the bend sits on the baseline and the
 * foot runs along the baseline into the a. Lane lines are cut as gaps. Each outer lane runs a longer arc
 * ((pi/2) x its offset from lane 1), so its straights are shorter by exactly that amount: every lane runs
 * the same distance. That stagger is split between the start (top of the stem) and the finish (end of
 * the foot), which slants both ends forward. "Every lane counts."
 */

export const PALETTE = {
  track: '#E4572E',
  trackInk: '#B5391A',
  sun: '#FFC83D',
  ink: '#1A1714',
  paper: '#FBF6EE',
  paper2: '#F3EBDD',
} as const;

export type LaneCount = 1 | 2 | 3 | 4;

export interface Pt {
  x: number;
  y: number;
}

export interface LogoParams {
  /** Height of the l. The start line meets the inside edge of lane 1 here. */
  grid: number;
  /** Master lane width. */
  lane: number;
  /** Master lane line, cut as a gap. */
  line: number;
  /** Master lane count. */
  lanes: number;
  /** Inside radius of lane 1 (the inner lane). */
  r0: number;
  /** Share of the stagger taken at the start (top of the stem); the rest goes to the finish (end of the foot). */
  split: number;
  /** x where the finish line meets the inside (top) edge of the foot. */
  finish: number;
  xHeight: number;
  /** How far round letters overshoot the x-height and the baseline. */
  overshoot: number;
  /** Letter stroke: exactly two master lanes. */
  stroke: number;
  /** e crossbar thickness, thinner than the stroke because horizontals look heavier. */
  bar: number;
  /** e terminal: a radial cut at this angle, in degrees (negative is below the centre). */
  eTerminal: number;
  /** How far the underside of the r arm runs past its bend before the terminal cut. */
  rRun: number;
  /** Lanes in the r (1 = monoline; 2 tried as a lane echo and rejected, see logo-construction.md). */
  rLanes: number;
  /** Closest clearances between neighbours. */
  footToA: number;
  aToR: number;
  rToE: number;
  eToE: number;
  /** Clear space on every side, in units. */
  clearSpace: number;
}

export const PARAMS: Readonly<LogoParams> = Object.freeze({
  grid: 48,
  lane: 2.4,
  line: 0.6,
  lanes: 4,
  r0: 6,
  split: 0.7,
  finish: 24,
  xHeight: 30,
  overshoot: 0.45,
  stroke: 5.4,
  bar: 4.8,
  eTerminal: -45,
  rRun: 0.6,
  rLanes: 1,
  footToA: 2.4,
  aToR: 4.5,
  rToE: 2.7,
  eToE: 3,
  clearSpace: 12,
});

const QUARTER = Math.PI / 2;
const TAU = Math.PI * 2;
const EPS = 1e-9;

/** Slope of the start line (dy/dx) and of the finish line (dx/dy) for a given split. */
export function staggerSlopes(split: number): { start: number; finish: number } {
  return { start: split * QUARTER, finish: (1 - split) * QUARTER };
}

/** Width of the l band: lanes plus lane lines. The same for every lane cut. */
export function bandWidth(p: LogoParams = PARAMS): number {
  return p.lanes * p.lane + (p.lanes - 1) * p.line;
}

export interface LaneCut {
  lanes: number;
  lane: number;
  line: number;
}

/**
 * The lane cut for a lane count. The band keeps its width and its paint: the white of the three master
 * lane lines (3 x 0.6 = 1.8) is shared between fewer, wider lines, and one lane is a solid band.
 */
export function laneCut(lanes: LaneCount, p: LogoParams = PARAMS): LaneCut {
  const paint = p.lanes * p.lane;
  const white = (p.lanes - 1) * p.line;
  if (lanes === 1) return { lanes: 1, lane: paint + white, line: 0 };
  return { lanes, lane: paint / lanes, line: white / (lanes - 1) };
}

/**
 * Which cut to draw at a rendered height in px. Below 64 px the master lane line is under 0.8 px and
 * blurs, so the wordmark switches to two lanes. The mark keeps four lanes from 128 px, three from 48 px.
 */
export function lanesForSize(variant: 'wordmark' | 'mark', px: number): LaneCount {
  if (variant === 'wordmark') return px >= 64 ? 4 : 2;
  if (px >= 128) return 4;
  return px >= 48 ? 3 : 2;
}

// ---------------------------------------------------------------- path writer (y up in, SVG y down out)

/** Round to 3 decimals for path data; never prints -0. */
export function fmt(n: number): string {
  const v = Math.round(n * 1000) / 1000;
  return Object.is(v, -0) ? '0' : String(v);
}

class Pen {
  readonly parts: string[] = [];
  readonly top: number;
  x = 0;
  y = 0;

  constructor(top: number) {
    this.top = top;
  }

  M(x: number, y: number): this {
    this.parts.push(`M${fmt(x)} ${fmt(this.top - y)}`);
    this.x = x;
    this.y = y;
    return this;
  }

  L(x: number, y: number): this {
    this.parts.push(`L${fmt(x)} ${fmt(this.top - y)}`);
    this.x = x;
    this.y = y;
    return this;
  }

  /** Arc around (cx, cy) from the current point to angle a1 (radians). ccw is counted in y-up space. */
  arc(cx: number, cy: number, r: number, a1: number, ccw: boolean): this {
    const a0 = Math.atan2(this.y - cy, this.x - cx);
    let sweep = ccw ? a1 - a0 : a0 - a1;
    sweep = ((sweep % TAU) + TAU) % TAU;
    const x = cx + r * Math.cos(a1);
    const y = cy + r * Math.sin(a1);
    if (sweep < EPS) return this.L(x, y);
    const large = sweep > Math.PI ? 1 : 0;
    // The y flip keeps the picture the right way up, so a ccw turn stays ccw on screen: sweep flag 0.
    this.parts.push(`A${fmt(r)} ${fmt(r)} 0 ${large} ${ccw ? 0 : 1} ${fmt(x)} ${fmt(this.top - y)}`);
    this.x = x;
    this.y = y;
    return this;
  }

  Z(): this {
    this.parts.push('Z');
    return this;
  }

  /** Full circle; cw (ccw = false) for solids, ccw for holes. */
  circle(cx: number, cy: number, r: number, ccw: boolean): this {
    this.M(cx, cy + r);
    this.arc(cx, cy, r, -QUARTER, ccw);
    this.arc(cx, cy, r, QUARTER, ccw);
    return this.Z();
  }

  /** Rectangle, clockwise in y-up space like every solid in this file. */
  rect(x0: number, y0: number, x1: number, y1: number): this {
    return this.M(x0, y0).L(x0, y1).L(x1, y1).L(x1, y0).Z();
  }

  toString(): string {
    return this.parts.join('');
  }
}

/** Rounded rectangle in SVG space (y down), clockwise on screen. */
export function roundedRect(x: number, y: number, w: number, h: number, r: number): string {
  const rr = Math.min(r, w / 2, h / 2);
  const f = fmt;
  if (rr <= 0) return `M${f(x)} ${f(y)}L${f(x + w)} ${f(y)}L${f(x + w)} ${f(y + h)}L${f(x)} ${f(y + h)}Z`;
  const a = (x1: number, y1: number): string => `A${f(rr)} ${f(rr)} 0 0 1 ${f(x1)} ${f(y1)}`;
  return (
    `M${f(x + rr)} ${f(y)}L${f(x + w - rr)} ${f(y)}${a(x + w, y + rr)}` +
    `L${f(x + w)} ${f(y + h - rr)}${a(x + w - rr, y + h)}` +
    `L${f(x + rr)} ${f(y + h)}${a(x, y + h - rr)}` +
    `L${f(x)} ${f(y + rr)}${a(x + rr, y)}Z`
  );
}

/**
 * Scale and move path data written by this module (absolute M, L, A and Z only), so placed copies need
 * no transform attribute.
 */
export function placePath(d: string, scale: number, dx: number, dy: number): string {
  const out: string[] = [];
  for (const m of d.matchAll(/([MLAZ])([^MLAZ]*)/g)) {
    const cmd = m[1] ?? '';
    const n = (m[2] ?? '').trim().split(/[\s,]+/).filter(Boolean).map(Number);
    if (cmd === 'Z') out.push('Z');
    else if (cmd === 'A') {
      const [rx = 0, ry = 0, rot = 0, large = 0, sweep = 0, x = 0, y = 0] = n;
      out.push(`A${fmt(rx * scale)} ${fmt(ry * scale)} ${fmt(rot)} ${large} ${sweep} ${fmt(x * scale + dx)} ${fmt(y * scale + dy)}`);
    } else {
      const [x = 0, y = 0] = n;
      out.push(`${cmd}${fmt(x * scale + dx)} ${fmt(y * scale + dy)}`);
    }
  }
  return out.join('');
}

/** Mirror path data written by this module across the vertical line x = axis (arc sweeps flip). */
export function mirrorPath(d: string, axis: number): string {
  const out: string[] = [];
  for (const m of d.matchAll(/([MLAZ])([^MLAZ]*)/g)) {
    const cmd = m[1] ?? '';
    const n = (m[2] ?? '').trim().split(/[\s,]+/).filter(Boolean).map(Number);
    if (cmd === 'Z') out.push('Z');
    else if (cmd === 'A') {
      const [rx = 0, ry = 0, rot = 0, large = 0, sweep = 0, x = 0, y = 0] = n;
      out.push(`A${fmt(rx)} ${fmt(ry)} ${fmt(rot)} ${large} ${sweep ? 0 : 1} ${fmt(2 * axis - x)} ${fmt(y)}`);
    } else {
      const [x = 0, y = 0] = n;
      out.push(`${cmd}${fmt(2 * axis - x)} ${fmt(y)}`);
    }
  }
  return out.join('');
}

/** Every number in a path, in order (for tests and checks). */
export function pathNumbers(d: string): number[] {
  return (d.match(/-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?|NaN|-?Infinity/gi) ?? []).map(Number);
}

// ---------------------------------------------------------------- the l: a 400 m track bend

export interface TrackSpec {
  /** Outer edge of the stem. */
  x0: number;
  /** Outer edge of the foot (the baseline). */
  y0: number;
  lanes: number;
  lane: number;
  line: number;
  /** Inside radius of lane 1. */
  r0: number;
  /** y (up) where the start line meets the inside edge of lane 1. */
  tip: number;
  /** x where the finish line meets the inside edge of lane 1. */
  finish: number;
  split: number;
}

export interface LaneRadii {
  inner: number;
  centre: number;
  outer: number;
}

export interface Track {
  /** Path data, SVG space. One closed subpath per lane, lane 1 (inner) first. */
  d: string;
  /** Centre-line length of each lane: straight + quarter bend + straight. All equal. */
  laneLengths: number[];
  band: number;
  /** Bend centre, y up. */
  centre: Pt;
  radii: LaneRadii[];
  /** Start line across the band (y up): outer edge of the outer lane, then inside edge of lane 1. */
  start: [Pt, Pt];
  /** Finish line across the band (y up): outer edge of the outer lane, then inside edge of lane 1. */
  finish: [Pt, Pt];
}

/** Draw a track bend. Lane 1 is the inner lane: the right edge of the stem and the top edge of the foot. */
export function track(t: TrackSpec, top: number): Track {
  const pitch = t.lane + t.line;
  const band = t.lanes * t.lane + (t.lanes - 1) * t.line;
  const cx = t.x0 + band + t.r0;
  const cy = t.y0 + band + t.r0;
  const k = staggerSlopes(t.split);
  const startY = (x: number): number => t.tip - k.start * (cx - t.r0 - x);
  const finishX = (y: number): number => t.finish - k.finish * (cy - t.r0 - y);
  const pen = new Pen(top);
  const laneLengths: number[] = [];
  const radii: LaneRadii[] = [];
  for (let i = 0; i < t.lanes; i++) {
    const inner = t.r0 + i * pitch;
    const outer = inner + t.lane;
    const centre = inner + t.lane / 2;
    if (startY(cx - outer) < cy - EPS) throw new RangeError(`lane ${i + 1}: the start stagger eats the straight`);
    if (finishX(cy - outer) < cx - EPS) throw new RangeError(`lane ${i + 1}: the finish stagger eats the straight`);
    pen
      .M(finishX(cy - outer), cy - outer)
      .L(cx, cy - outer)
      .arc(cx, cy, outer, Math.PI, false)
      .L(cx - outer, startY(cx - outer))
      .L(cx - inner, startY(cx - inner))
      .L(cx - inner, cy)
      .arc(cx, cy, inner, -QUARTER, true)
      .L(finishX(cy - inner), cy - inner)
      .Z();
    laneLengths.push(startY(cx - centre) - cy + QUARTER * centre + (finishX(cy - centre) - cx));
    radii.push({ inner, centre, outer });
  }
  return {
    d: pen.toString(),
    laneLengths,
    band,
    centre: { x: cx, y: cy },
    radii,
    start: [
      { x: t.x0, y: startY(t.x0) },
      { x: cx - t.r0, y: t.tip },
    ],
    finish: [
      { x: finishX(t.y0), y: t.y0 },
      { x: t.finish, y: cy - t.r0 },
    ],
  };
}

// ---------------------------------------------------------------- letters

interface Glyph {
  d: string;
  left: number;
  right: number;
}

function bowlRadius(p: LogoParams): number {
  return p.xHeight / 2 + p.overshoot;
}

/** Single-storey a: a ring that overshoots both lines, plus a stem from the baseline to the x-height. */
function letterA(p: LogoParams, x: number): Glyph {
  const ro = bowlRadius(p);
  const cx = x + ro;
  const cy = p.xHeight / 2;
  const d = new Pen(p.grid)
    .circle(cx, cy, ro, false)
    .circle(cx, cy, ro - p.stroke, true)
    .rect(x + 2 * ro - p.stroke, 0, x + 2 * ro, p.xHeight)
    .toString();
  return { d, left: x, right: x + 2 * ro };
}

/** r: a stem and a bend with the l's inside radius; the terminal is cut parallel to the start line. */
function letterR(p: LogoParams, x: number): Glyph & { terminal: [Pt, Pt]; centre: Pt } {
  const s = p.stroke;
  const acx = x + p.r0 + s;
  const acy = p.xHeight - p.r0 - s;
  const dxdy = 1 / staggerSlopes(p.split).start;
  const low = p.xHeight - s;
  const cut = (y: number): number => acx + p.rRun + dxdy * (y - low);
  const lanes = Math.max(1, Math.round(p.rLanes));
  const w = (s - (lanes - 1) * p.line) / lanes;
  const pen = new Pen(p.grid);
  for (let i = 0; i < lanes; i++) {
    const inner = p.r0 + i * (w + p.line);
    const outer = inner + w;
    pen
      .M(acx - outer, 0)
      .L(acx - outer, acy)
      .arc(acx, acy, outer, QUARTER, false)
      .L(cut(acy + outer), acy + outer)
      .L(cut(acy + inner), acy + inner)
      .L(acx, acy + inner)
      .arc(acx, acy, inner, Math.PI, true)
      .L(acx - inner, 0)
      .Z();
  }
  const terminal: [Pt, Pt] = [
    { x: cut(low), y: low },
    { x: cut(p.xHeight), y: p.xHeight },
  ];
  return { d: pen.toString(), left: x, right: terminal[1].x, terminal, centre: { x: acx, y: acy } };
}

/** e: a ring with a crossbar whose top edge sits on the bend-centre line, and a radial terminal. */
function letterE(p: LogoParams, x: number, barTop: number): Glyph {
  const ro = bowlRadius(p);
  const ri = ro - p.stroke;
  const cx = x + ro;
  const cy = p.xHeight / 2;
  const y1 = barTop;
  const y0 = barTop - p.bar;
  const b0 = Math.asin((y0 - cy) / ro);
  const t = (p.eTerminal * Math.PI) / 180;
  const pen = new Pen(p.grid)
    .M(cx + ro * Math.cos(b0), y0)
    .L(cx - Math.sqrt(ri * ri - (y0 - cy) ** 2), y0)
    .arc(cx, cy, ri, t, true)
    .L(cx + ro * Math.cos(t), cy + ro * Math.sin(t))
    .arc(cx, cy, ro, b0, false)
    .Z();
  // the eye, wound the other way so it cuts a hole
  const h = Math.sqrt(ri * ri - (y1 - cy) ** 2);
  pen
    .M(cx - h, y1)
    .L(cx + h, y1)
    .arc(cx, cy, ri, Math.atan2(y1 - cy, -h), true)
    .Z();
  return { d: pen.toString(), left: x, right: x + 2 * ro };
}

/**
 * Smallest centre x for a circle at height cy, radius rad, that clears every point of a segment.
 * x(t) + sqrt(rad^2 - (y(t) - cy)^2) is concave along the segment, so a ternary search finds the exact max.
 */
export function clearCircle(seg: readonly [Pt, Pt], cy: number, rad: number): number {
  const [a, b] = seg;
  const f = (t: number): number => {
    const x = a.x + (b.x - a.x) * t;
    const dy = a.y + (b.y - a.y) * t - cy;
    return dy * dy <= rad * rad ? x + Math.sqrt(rad * rad - dy * dy) : -Infinity;
  };
  let lo = 0;
  let hi = 1;
  const span = b.y - a.y;
  if (Math.abs(span) > EPS) {
    const t1 = (cy - rad - a.y) / span;
    const t2 = (cy + rad - a.y) / span;
    lo = Math.max(0, Math.min(t1, t2));
    hi = Math.min(1, Math.max(t1, t2));
    if (lo > hi) return -Infinity;
  }
  for (let i = 0; i < 200; i++) {
    const m1 = lo + (hi - lo) / 3;
    const m2 = hi - (hi - lo) / 3;
    if (f(m1) < f(m2)) lo = m1;
    else hi = m2;
  }
  return f((lo + hi) / 2);
}

// ---------------------------------------------------------------- logo geometry

export interface Construction {
  pitch: number;
  band: number;
  /** Bend centre of the l, SVG space. */
  bendCentre: Pt;
  radii: LaneRadii[];
  /** Start and finish lines across the band, SVG space, outer edge first. */
  start: [Pt, Pt];
  finish: [Pt, Pt];
  /** Start line angle from horizontal and finish line angle from vertical, in degrees. */
  startAngle: number;
  finishAngle: number;
  /** SVG y of the line through the bend centre; the e crossbars sit on it. */
  centreLine: number;
  /** SVG y of the x-height and the baseline. */
  xHeightY: number;
  baselineY: number;
  /** Letter extents (x), in order: a, r, e, e. Empty for the mark. */
  letters: [number, number][];
  /** r bend centre, SVG space (wordmark only). */
  rCentre?: Pt;
}

export interface LogoGeometry {
  variant: 'wordmark' | 'mark';
  lanes: LaneCount;
  /** The l (track red). */
  track: string;
  /** The letters "aree" (ink); empty for the mark. */
  letters: string;
  width: number;
  height: number;
  /** "0 0 width height": tight to the artwork. Clear space is extra, see clearSpace. */
  viewBox: string;
  /** SVG y of the baseline. */
  baseline: number;
  xHeight: number;
  clearSpace: number;
  laneLengths: number[];
  construction: Construction;
}

const deg = (r: number): number => (r * 180) / Math.PI;

function toSvg(pt: Pt, top: number): Pt {
  return { x: pt.x, y: top - pt.y };
}

function constructionOf(T: Track, p: LogoParams, letters: [number, number][], rCentre?: Pt): Construction {
  const k = staggerSlopes(p.split);
  return {
    pitch: p.lane + p.line,
    band: T.band,
    bendCentre: toSvg(T.centre, p.grid),
    radii: T.radii,
    start: [toSvg(T.start[0], p.grid), toSvg(T.start[1], p.grid)],
    finish: [toSvg(T.finish[0], p.grid), toSvg(T.finish[1], p.grid)],
    startAngle: deg(Math.atan(k.start)),
    finishAngle: deg(Math.atan(k.finish)),
    centreLine: p.grid - T.centre.y,
    xHeightY: p.grid - p.xHeight,
    baselineY: p.grid,
    letters,
    ...(rCentre ? { rCentre: toSvg(rCentre, p.grid) } : {}),
  };
}

/** The wordmark: the track l followed by "aree". */
export function wordmarkGeometry(lanes: LaneCount = 4, p: LogoParams = PARAMS): LogoGeometry {
  const cut = laneCut(lanes, p);
  const T = track(
    { x0: 0, y0: 0, lanes: cut.lanes, lane: cut.lane, line: cut.line, r0: p.r0, tip: p.grid, finish: p.finish, split: p.split },
    p.grid,
  );
  const ro = bowlRadius(p);
  const cy = p.xHeight / 2;
  const A = letterA(p, clearCircle(T.finish, cy, ro + p.footToA) - ro);
  const R = letterR(p, A.right + p.aToR);
  const E1 = letterE(p, clearCircle(R.terminal, cy, ro + p.rToE) - ro, T.centre.y);
  const E2 = letterE(p, E1.right + p.eToE, T.centre.y);
  const width = E2.right;
  const height = p.grid + p.overshoot;
  return {
    variant: 'wordmark',
    lanes,
    track: T.d,
    letters: A.d + R.d + E1.d + E2.d,
    width,
    height,
    viewBox: `0 0 ${fmt(width)} ${fmt(height)}`,
    baseline: p.grid,
    xHeight: p.xHeight,
    clearSpace: p.clearSpace,
    laneLengths: T.laneLengths,
    construction: constructionOf(
      T,
      p,
      [
        [A.left, A.right],
        [R.left, R.right],
        [E1.left, E1.right],
        [E2.left, E2.right],
      ],
      R.centre,
    ),
  };
}

/** The mark: the same l with the foot run on until the bend sits in a square. */
export function markGeometry(lanes: LaneCount = 4, p: LogoParams = PARAMS): LogoGeometry {
  const cut = laneCut(lanes, p);
  const T = track(
    { x0: 0, y0: 0, lanes: cut.lanes, lane: cut.lane, line: cut.line, r0: p.r0, tip: p.grid, finish: p.grid, split: p.split },
    p.grid,
  );
  return {
    variant: 'mark',
    lanes,
    track: T.d,
    letters: '',
    width: p.grid,
    height: p.grid,
    viewBox: `0 0 ${fmt(p.grid)} ${fmt(p.grid)}`,
    baseline: p.grid,
    xHeight: p.xHeight,
    clearSpace: p.clearSpace,
    laneLengths: T.laneLengths,
    construction: constructionOf(T, p, []),
  };
}

// ---------------------------------------------------------------- icons

export interface IconLayout {
  /** Share of the icon the 48-unit mark square fills. */
  fill: number;
  /** Corner radius as a share of the icon; 0 for a full-bleed square. */
  radius: number;
  lanes: LaneCount;
}

/**
 * App icons use the three-lane cut: it keeps its lane lines on a phone home screen, where four lanes blur.
 * The maskable icon keeps the whole mark inside the central safe circle (radius 40% of the icon).
 */
export const ICONS = {
  app: { fill: 0.56, radius: 0.2237, lanes: 3 },
  maskable: { fill: 0.5, radius: 0, lanes: 3 },
} as const satisfies Record<string, IconLayout>;

/**
 * The l's mass sits low and left, so a box-centred mark looks low and left. Icons move it up and right
 * by one master lane (2.4 units).
 */
export const OPTICAL_SHIFT = 2.4;

export interface IconGeometry {
  size: number;
  /** Tile path (SVG space). */
  tile: string;
  /** Mark path placed on the tile, no transform needed. */
  mark: string;
  /** Pixels per logo unit. */
  unit: number;
  /** Mark origin (top-left of the 48-unit square). */
  origin: Pt;
  lanes: LaneCount;
}

export function iconGeometry(kind: keyof typeof ICONS, size = 1024, p: LogoParams = PARAMS): IconGeometry {
  const layout: IconLayout = ICONS[kind];
  const unit = (layout.fill * size) / p.grid;
  const origin = {
    x: (size - p.grid * unit) / 2 + OPTICAL_SHIFT * unit,
    y: (size - p.grid * unit) / 2 - OPTICAL_SHIFT * unit,
  };
  const m = markGeometry(layout.lanes, p);
  return {
    size,
    tile: roundedRect(0, 0, size, size, layout.radius * size),
    mark: placePath(m.track, unit, origin.x, origin.y),
    unit,
    origin,
    lanes: layout.lanes,
  };
}

// ---------------------------------------------------------------- favicons (drawn in whole pixels)

export interface FaviconSpec {
  size: number;
  /** Tile corner radius. */
  rx: number;
  /** Outer edge of the stem (x), the baseline row (SVG y), the stem tip (SVG y) and the finish (x). */
  x0: number;
  base: number;
  tip: number;
  finish: number;
  lanes: number;
  lane: number;
  line: number;
  r0: number;
  split: number;
}

/**
 * Upright, pixel-snapped two-lane L on an ink tile: every straight edge sits on a whole pixel, and the
 * bend is tightened (inside radius 3, 2 and 1 px at 48, 32 and 16) so the L reads as a letter, not a hook.
 */
export const FAVICONS: Readonly<Record<16 | 32 | 48, FaviconSpec>> = Object.freeze({
  48: { size: 48, rx: 10.5, x0: 7, base: 41, tip: 6, finish: 42, lanes: 2, lane: 5, line: 2, r0: 3, split: 0.7 },
  32: { size: 32, rx: 7, x0: 5, base: 27, tip: 4, finish: 28, lanes: 2, lane: 3, line: 2, r0: 2, split: 0.7 },
  16: { size: 16, rx: 3.5, x0: 2, base: 14, tip: 1, finish: 14, lanes: 2, lane: 2, line: 1, r0: 1, split: 0.7 },
});

export interface FaviconGeometry {
  size: number;
  tile: string;
  track: string;
  laneLengths: number[];
}

export function faviconGeometry(size: 16 | 32 | 48): FaviconGeometry {
  const f = FAVICONS[size];
  const T = track(
    { x0: f.x0, y0: 0, lanes: f.lanes, lane: f.lane, line: f.line, r0: f.r0, tip: f.base - f.tip, finish: f.finish, split: f.split },
    f.base,
  );
  return { size, tile: roundedRect(0, 0, f.size, f.size, f.rx), track: T.d, laneLengths: T.laneLengths };
}
