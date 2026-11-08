// Text as outlines for the brand build, so exported SVGs and PNGs need no web fonts.
//
// fontkit cannot instance a WOFF2 variable font: getVariation() re-reads the WOFF2 stream as a
// plain TTF and loses the cmap. So this takes fontkit's pre-decoded WOFF2 glyphs and applies the
// gvar deltas itself (outlines, component offsets and the phantom points that carry the advance).

// fontkit keeps the WOFF2 decoding and the variation processor on underscored members; no public API exposes them.
/* oxlint-disable no-underscore-dangle */

import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

interface FkPoint {
  onCurve: boolean;
  endContour: boolean;
  x: number;
  y: number;
}
type PointCtor = new (onCurve: boolean, endContour: boolean, x: number, y: number) => FkPoint;
interface FkGlyphData {
  numberOfContours: number;
  points?: FkPoint[];
  components?: { glyphID: number; dx: number; dy: number }[];
}
interface FkFont {
  unitsPerEm: number;
  fvar: { axis: { axisTag: string; minValue: number; maxValue: number; defaultValue: number }[] };
  hmtx: { metrics: { length: number; get(i: number): { advance: number; bearing: number } }; bearings: { get(i: number): number } };
  variationCoords?: number[];
  _variationProcessor: { transformPoints(gid: number, pts: FkPoint[]): void } | null;
  _transformedGlyphs?: (FkGlyphData | undefined)[];
  _transformGlyfTable(): void;
  layout(text: string): { glyphs: { id: number; advanceWidth: number }[]; positions: { xAdvance: number }[] };
}

// fontkit has no usable types here; FkFont describes the little this file calls.
const fontkit = createRequire(import.meta.url)('fontkit') as { create(data: Buffer): unknown };

interface Point {
  on: boolean;
  x: number;
  y: number;
}
interface Glyph {
  advance: number;
  contours: Point[][];
}
export interface TextOutline {
  d: string;
  width: number;
}
/** Lays out one line: size in px, x at the left of the first glyph, y on the baseline, tracking in em. */
export type Outliner = (text: string, size: number, x: number, baseline: number, tracking?: number) => TextOutline;

const r2 = (n: number): string => String(Math.round(n * 100) / 100);

/** A variable WOFF2 font at fixed axis values, e.g. { wdth: 115, wght: 650 }. */
export function variableFont(file: string, axes: Record<string, number>): Outliner {
  const data = readFileSync(file);
  const base = fontkit.create(data) as FkFont;
  base._transformGlyfTable(); // decode the default outlines before any variation processor exists
  const decoded = base._transformedGlyphs ?? [];
  const varied = fontkit.create(data) as FkFont;
  varied.variationCoords = varied.fvar.axis.map((a) => {
    const v = axes[a.axisTag.trim()];
    return v === undefined ? a.defaultValue : Math.min(a.maxValue, Math.max(a.minValue, v));
  });
  const vp = varied._variationProcessor;
  if (!vp) throw new Error(`${file} has no glyph variations`);
  const sample = decoded.find((g) => g?.points?.length)?.points?.[0];
  if (!sample) throw new Error(`${file} has no simple glyphs`);
  const P = sample.constructor as PointCtor;

  const metrics = (gid: number): { advance: number; bearing: number } => {
    const n = base.hmtx.metrics.length;
    if (gid < n) return base.hmtx.metrics.get(gid);
    return { advance: base.hmtx.metrics.get(n - 1).advance, bearing: base.hmtx.bearings.get(gid - n) };
  };

  const cache = new Map<number, Glyph>();
  const glyph = (gid: number): Glyph => {
    const hit = cache.get(gid);
    if (hit) return hit;
    const g = decoded[gid];
    const met = metrics(gid);
    const own = g?.numberOfContours && g.numberOfContours > 0 ? (g.points ?? []) : [];
    const comps = g?.numberOfContours && g.numberOfContours < 0 ? (g.components ?? []) : [];
    // Points to vary: the outline (or one point per component offset), then four phantom points.
    const pts = own.length
      ? own.map((p) => new P(p.onCurve, p.endContour, p.x, p.y))
      : comps.map((c) => new P(true, true, c.dx, c.dy));
    const xMin = own.length ? Math.min(...own.map((p) => p.x)) : met.bearing;
    const left = xMin - met.bearing;
    pts.push(new P(false, true, left, 0), new P(false, true, left + met.advance, 0), new P(false, true, 0, 0), new P(false, true, 0, 0));
    vp.transformPoints(gid, pts);
    const [p0, p1] = pts.splice(-4, 4);
    const origin = p0?.x ?? 0;
    const out: Glyph = { advance: (p1?.x ?? met.advance) - origin, contours: [] };
    if (own.length) {
      let cur: Point[] = [];
      for (const p of pts) {
        cur.push({ on: p.onCurve, x: p.x - origin, y: p.y });
        if (p.endContour) {
          out.contours.push(cur);
          cur = [];
        }
      }
    } else {
      comps.forEach((c, i) => {
        const off = pts[i] ?? { x: c.dx, y: c.dy };
        for (const contour of glyph(c.glyphID).contours) {
          out.contours.push(contour.map((p) => ({ on: p.on, x: p.x + off.x - origin, y: p.y + off.y })));
        }
      });
    }
    cache.set(gid, out);
    return out;
  };

  return (text, size, x, baseline, tracking = 0) => {
    const k = size / base.unitsPerEm;
    const run = base.layout(text); // default-instance shaping; its kerning is kept as a delta
    let pen = 0;
    let d = '';
    run.glyphs.forEach((g, i) => {
      const v = glyph(g.id);
      const at = (px: number, py: number): string => `${r2(x + (pen + px) * k)} ${r2(baseline - py * k)}`;
      for (const c of v.contours) d += contourPath(c, at);
      const kern = (run.positions[i]?.xAdvance ?? g.advanceWidth) - g.advanceWidth;
      pen += v.advance + kern + tracking * base.unitsPerEm;
    });
    return { d, width: (pen - tracking * base.unitsPerEm) * k };
  };
}

/** One TrueType contour (quadratic, with implied on-curve midpoints) as SVG path data. */
function contourPath(c: Point[], at: (x: number, y: number) => string): string {
  const n = c.length;
  if (n < 2) return '';
  const first = c.findIndex((p) => p.on);
  const pt = (i: number): Point => c[(((i % n) + n) % n)] ?? { on: true, x: 0, y: 0 };
  const mid = (a: Point, b: Point): Point => ({ on: true, x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  // Start on an on-curve point, or on the midpoint of the first two when every point is off-curve.
  const start = first === -1 ? mid(pt(0), pt(1)) : pt(first);
  const from = first === -1 ? 1 : first + 1;
  let d = `M${at(start.x, start.y)}`;
  let off: Point | null = null;
  for (let i = 0; i < n; i++) {
    const p = pt(from + i);
    if (p.on) {
      d += off ? `Q${at(off.x, off.y)} ${at(p.x, p.y)}` : `L${at(p.x, p.y)}`;
      off = null;
    } else {
      if (off) {
        const m = mid(off, p);
        d += `Q${at(off.x, off.y)} ${at(m.x, m.y)}`;
      }
      off = p;
    }
  }
  if (off) d += `Q${at(off.x, off.y)} ${at(start.x, start.y)}`;
  return `${d}Z`;
}
