import { describe, expect, it } from 'vitest';
import {
  baseline,
  baselineFromCheckIns,
  baselineOrStored,
  baselineShortfall,
  readingsOf,
  usualLabel,
  usualRange,
} from './baselines.ts';
import type { Reading } from './baselines.ts';

const run = (from: number, values: number[], unwell = false): Reading[] =>
  values.map((value, i) => ({ day: from + i, value, unwell }));

describe('baseline', () => {
  it('needs at least 7 readings', () => {
    expect(baseline(run(80, [50, 50, 50, 50, 50, 50]), 100)).toBeNull();
    expect(baseline(run(80, [50, 50, 50, 50, 50, 50, 50]), 100)).not.toBeNull();
  });

  it('uses the plain mean and the sample standard deviation', () => {
    const b = baseline(run(80, [66, 78, 66, 78, 66, 78, 72]), 100);
    expect(b).toEqual({ mean: 72, sd: 6, n: 7, fromDay: 72, toDay: 99 });
  });

  it('covers e-28 to e-1 only', () => {
    const readings = [
      ...run(72, [10]),
      ...run(99, [10]),
      ...run(71, [1000]),
      ...run(100, [1000]),
      ...run(80, [50, 50, 50, 50, 50, 50]),
    ];
    const b = baseline(readings, 100);
    expect(b?.n).toBe(8);
    expect(b?.mean).toBeCloseTo((10 + 10 + 300) / 8);
  });

  it('leaves out ill or injured days', () => {
    const readings = [...run(80, [50, 50, 50, 50, 50, 50, 50, 50, 50]), ...run(90, [200, 200, 200, 200, 200], true)];
    const b = baseline(readings, 100);
    expect(b?.n).toBe(9);
    expect(b?.mean).toBe(50);
  });

  it('reports how many readings are missing', () => {
    expect(baselineShortfall(run(80, [1, 2, 3, 4, 5]), 100)).toBe('Not enough readings yet: 5 of 7');
    expect(baselineShortfall(run(80, [1, 2, 3, 4, 5, 6, 7]), 100)).toBeNull();
  });
});

describe('check-in helpers', () => {
  const checkIns = Array.from({ length: 8 }, (_, i) => ({ day: 80 + i, hrvMs: 70 + i, restingHr: null, unwell: null }));

  it('turns check-ins into readings and skips missing values', () => {
    const r = readingsOf([...checkIns, { day: 95, hrvMs: undefined, unwell: { kind: 'ill' } }], 'hrvMs');
    expect(r).toHaveLength(8);
    expect(r[0]).toEqual({ day: 80, value: 70, unwell: false });
    expect(readingsOf([{ day: 1, hrvMs: 60, unwell: { kind: 'ill' } }], 'hrvMs')[0]?.unwell).toBe(true);
  });

  it('computes a baseline from check-ins', () => {
    expect(baselineFromCheckIns(checkIns, 'hrvMs', 100)?.n).toBe(8);
    expect(baselineFromCheckIns(checkIns, 'restingHr', 100)).toBeNull();
  });

  it('falls back to the stored baseline when history is short', () => {
    const stored = { restingHr: 48, hrvMs: 72 };
    expect(baselineOrStored(checkIns, 'hrvMs', 100, stored).source).toBe('history');
    expect(baselineOrStored(checkIns, 'restingHr', 100, stored)).toEqual({
      mean: 48,
      sd: null,
      n: 0,
      source: 'stored',
    });
    expect(baselineOrStored([], 'hrvMs', 100, stored).mean).toBe(72);
  });
});

describe('display', () => {
  it('shows the usual range as mean plus or minus one SD', () => {
    expect(usualRange({ mean: 72, sd: 6 })).toEqual({ low: 66, high: 78 });
    expect(usualLabel('hrvMs', { mean: 72, sd: 6 })).toBe('Usual HRV 72 ms (most days 66 to 78)');
    expect(usualLabel('restingHr', { mean: 48, sd: null })).toBe('Usual resting HR 48 bpm');
  });
});
