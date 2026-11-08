import { describe, expect, it } from 'vitest';
import {
  FAVICONS,
  PARAMS,
  bandWidth,
  faviconGeometry,
  iconGeometry,
  laneCut,
  lanesForSize,
  markGeometry,
  mirrorPath,
  pathNumbers,
  placePath,
  staggerSlopes,
  track,
  wordmarkGeometry,
  type LaneCount,
} from './logo-geometry.ts';

const CUTS: LaneCount[] = [1, 2, 3, 4];

/** Commands with their numbers, for structure checks. */
function commands(d: string): { cmd: string; n: number[] }[] {
  return [...d.matchAll(/([MLAZ])([^MLAZ]*)/g)].map((m) => ({
    cmd: m[1] ?? '',
    n: (m[2] ?? '').trim().split(/\s+/).filter(Boolean).map(Number),
  }));
}

/** End points of every segment (M, L and the end of each A). */
function endPoints(d: string): [number, number][] {
  const pts: [number, number][] = [];
  for (const { cmd, n } of commands(d)) {
    if (cmd === 'M' || cmd === 'L') pts.push([n[0] ?? NaN, n[1] ?? NaN]);
    if (cmd === 'A') pts.push([n[5] ?? NaN, n[6] ?? NaN]);
  }
  return pts;
}

function spread(xs: number[]): number {
  return Math.max(...xs) - Math.min(...xs);
}

/** What is wrong with a path's numbers: empty when every number is finite. */
function badNumbers(d: string): string[] {
  const nums = pathNumbers(d);
  if (nums.length === 0) return [`no numbers in "${d.slice(0, 40)}"`];
  return nums.filter((n) => !Number.isFinite(n)).map((n) => `${n} in "${d.slice(0, 40)}"`);
}

const whole = (v: number): boolean => Math.abs(v - Math.round(v)) < 1e-9;

describe('every lane counts', () => {
  it('the master wordmark l: all four lanes run the same distance', () => {
    const g = wordmarkGeometry(4);
    expect(g.laneLengths).toHaveLength(4);
    expect(spread(g.laneLengths)).toBeLessThan(1e-6);
  });

  it.each(CUTS)('%i-lane cuts of the wordmark and the mark keep equal lanes', (lanes) => {
    for (const g of [wordmarkGeometry(lanes), markGeometry(lanes)]) {
      expect(g.laneLengths).toHaveLength(lanes);
      expect(spread(g.laneLengths)).toBeLessThan(1e-6);
    }
  });

  it.each([16, 32, 48] as const)('favicon-%i keeps equal lanes', (size) => {
    const f = faviconGeometry(size);
    expect(f.laneLengths).toHaveLength(FAVICONS[size].lanes);
    expect(spread(f.laneLengths)).toBeLessThan(1e-6);
  });

  it('holds for any split: the stagger always totals (pi/2) x offset', () => {
    for (const split of [0, 0.3, 0.5, 0.7, 1]) {
      const t = track({ x0: 0, y0: 0, lanes: 4, lane: 2.4, line: 0.6, r0: 6, tip: 60, finish: 60, split }, 60);
      expect(spread(t.laneLengths)).toBeLessThan(1e-6);
      const k = staggerSlopes(split);
      expect(k.start + k.finish).toBeCloseTo(Math.PI / 2, 12);
    }
  });

  it('refuses a stagger that would eat a straight', () => {
    expect(() => track({ x0: 0, y0: 0, lanes: 4, lane: 2.4, line: 0.6, r0: 6, tip: 20, finish: 48, split: 1 }, 48)).toThrow(
      RangeError,
    );
  });
});

describe('path data', () => {
  it('every number in every path is finite', () => {
    const paths = [
      ...CUTS.flatMap((lanes) => {
        const w = wordmarkGeometry(lanes);
        return [w.track, w.letters, markGeometry(lanes).track];
      }),
      ...(['app', 'maskable'] as const).flatMap((kind) => {
        const ic = iconGeometry(kind);
        return [ic.tile, ic.mark];
      }),
      ...([16, 32, 48] as const).flatMap((size) => {
        const f = faviconGeometry(size);
        return [f.tile, f.track];
      }),
    ];
    expect(paths).toHaveLength(4 * 3 + 2 * 2 + 3 * 2);
    expect(paths.join('')).not.toMatch(/NaN|Infinity/);
    expect(paths.flatMap(badNumbers)).toEqual([]);
  });

  it('the l is one closed subpath per lane, each with two quarter arcs', () => {
    for (const lanes of CUTS) {
      const cmds = commands(wordmarkGeometry(lanes).track);
      expect(cmds.filter((c) => c.cmd === 'M')).toHaveLength(lanes);
      expect(cmds.filter((c) => c.cmd === 'Z')).toHaveLength(lanes);
      const arcs = cmds.filter((c) => c.cmd === 'A');
      expect(arcs).toHaveLength(2 * lanes);
      for (const a of arcs) expect(a.n[3]).toBe(0); // quarter arcs: never the large arc
    }
  });

  it('the letters are a (bowl, counter, stem), r, and two e (outline, eye)', () => {
    const cmds = commands(wordmarkGeometry(4).letters);
    expect(cmds.filter((c) => c.cmd === 'M')).toHaveLength(3 + 1 + 2 + 2);
    expect(cmds.filter((c) => c.cmd === 'Z')).toHaveLength(8);
  });

  it('uses only absolute M, L, A and Z, with no transforms needed', () => {
    const w = wordmarkGeometry(4);
    expect(w.track + w.letters).toMatch(/^[MLAZ0-9.\s-]+$/);
  });

  it('keeps the wordmark small enough to inline', () => {
    const w = wordmarkGeometry(4);
    expect((w.track + w.letters).length).toBeLessThan(3000);
  });
});

describe('layout', () => {
  it('the wordmark sits in a tight viewBox, baseline at 48', () => {
    const w = wordmarkGeometry(4);
    expect(w.viewBox).toBe(`0 0 ${+w.width.toFixed(3)} ${+w.height.toFixed(3)}`);
    expect(w.baseline).toBe(48);
    expect(w.height).toBeCloseTo(48 + PARAMS.overshoot, 9);
    expect(w.xHeight).toBe(30);
    expect(w.clearSpace).toBe(12);
    const pts = endPoints(w.track + w.letters);
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(-1e-3);
    expect(Math.max(...xs)).toBeLessThanOrEqual(w.width + 1e-3);
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(-1e-3);
    expect(Math.max(...ys)).toBeLessThanOrEqual(w.height + 1e-3);
    expect(Math.min(...ys)).toBeCloseTo(0, 3); // the start line touches the top of the grid
  });

  it('letters run left to right (the r arm may overhang the e, as kerning does)', () => {
    const w = wordmarkGeometry(4);
    const ext = w.construction.letters;
    expect(ext).toHaveLength(4);
    let prevLeft = w.construction.finish[1].x;
    let prevRight = prevLeft;
    for (const [left, right] of ext) {
      expect(left).toBeGreaterThan(prevLeft);
      expect(right).toBeGreaterThan(prevRight);
      prevLeft = left;
      prevRight = right;
    }
    const [a, r] = ext;
    expect((r?.[0] ?? 0) - (a?.[1] ?? 0)).toBeCloseTo(PARAMS.aToR, 9);
    expect(prevRight).toBeCloseTo(w.width, 9);
  });

  it('the mark fills a 48-unit square', () => {
    const m = markGeometry(4);
    expect(m.viewBox).toBe('0 0 48 48');
    expect(m.letters).toBe('');
    const pts = endPoints(m.track);
    expect(Math.max(...pts.map((p) => p[0]))).toBeCloseTo(48, 3);
    expect(Math.min(...pts.map((p) => p[1]))).toBeCloseTo(0, 3);
  });

  it('the e crossbars sit on the line through the bend centre', () => {
    const c = wordmarkGeometry(4).construction;
    expect(c.centreLine).toBeCloseTo(48 - (bandWidth() + PARAMS.r0), 9);
    expect(c.bendCentre.y).toBeCloseTo(c.centreLine, 9);
  });

  it('the start line runs at atan(split x pi/2)', () => {
    const c = wordmarkGeometry(4).construction;
    expect(c.startAngle).toBeCloseTo((Math.atan(PARAMS.split * (Math.PI / 2)) * 180) / Math.PI, 9);
    const [outer, inner] = c.start;
    expect((outer.y - inner.y) / (inner.x - outer.x)).toBeCloseTo(PARAMS.split * (Math.PI / 2), 9);
  });
});

describe('cuts and sizes', () => {
  it.each(CUTS)('the %i-lane cut keeps the band width', (lanes) => {
    const c = laneCut(lanes);
    expect(c.lanes * c.lane + (c.lanes - 1) * c.line).toBeCloseTo(bandWidth(), 9);
  });

  it.each([2, 3, 4] as const)('the %i-lane cut keeps the paint and shares out the white', (lanes) => {
    const c = laneCut(lanes);
    expect(c.lanes * c.lane).toBeCloseTo(PARAMS.lanes * PARAMS.lane, 9);
    expect((c.lanes - 1) * c.line).toBeCloseTo((PARAMS.lanes - 1) * PARAMS.line, 9);
  });

  it('switches cuts by rendered size', () => {
    expect(lanesForSize('wordmark', 64)).toBe(4);
    expect(lanesForSize('wordmark', 63)).toBe(2);
    expect(lanesForSize('mark', 128)).toBe(4);
    expect(lanesForSize('mark', 64)).toBe(3);
    expect(lanesForSize('mark', 32)).toBe(2);
  });

  it('favicon straights sit on whole pixels', () => {
    for (const size of [16, 32, 48] as const) {
      // Every M and L lands on a stem edge (whole x) or a foot edge (whole y); only the cuts are diagonal.
      for (const { cmd, n } of commands(faviconGeometry(size).track)) {
        if (cmd !== 'M' && cmd !== 'L') continue;
        const [x = NaN, y = NaN] = n;
        expect(whole(x) || whole(y)).toBe(true);
      }
    }
  });

  it('icons keep the mark inside the maskable safe circle', () => {
    const ic = iconGeometry('maskable', 1024);
    const r = 0.4 * 1024;
    for (const [x, y] of endPoints(ic.mark)) expect(Math.hypot(x - 512, y - 512)).toBeLessThan(r);
  });
});

describe('path helpers', () => {
  it('placePath scales and moves every point and radius', () => {
    expect(placePath('M1 2L3 4A5 5 0 0 1 6 7Z', 2, 10, 20)).toBe('M12 24L16 28A10 10 0 0 1 22 34Z');
  });

  it('mirrorPath reflects x and flips arc sweeps', () => {
    expect(mirrorPath('M1 2L3 4A5 5 0 0 1 6 7Z', 10)).toBe('M19 2L17 4A5 5 0 0 0 14 7Z');
  });
});
