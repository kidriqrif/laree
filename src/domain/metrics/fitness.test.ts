import { describe, expect, it } from 'vitest';
import {
  dailyLoads,
  fitnessSeries,
  formatForm,
  formatLoad,
  formatRamp,
  formBand,
  formatWhole,
  projectedLoads,
  projectedSeries,
  recomputeFrom,
  roundHalfAway,
} from './fitness.ts';

describe('fitness series', () => {
  it('11: one session then rest, with the one-day Form lag', () => {
    const s = fitnessSeries([100, 0, 0]);
    expect(s[0]?.fitness).toBeCloseTo(2.381, 3);
    expect(s[0]?.fatigue).toBeCloseTo(14.286, 3);
    expect(s[0]?.form).toBeCloseTo(0, 3);
    expect(s[1]?.form).toBeCloseTo(-11.905, 3);
    expect(s[1]?.fitness).toBeCloseTo(2.324, 3);
    expect(s[1]?.fatigue).toBeCloseTo(12.245, 3);
    expect(s[2]?.form).toBeCloseTo(-9.921, 3);
    expect(s[2]?.fatigue).toBeCloseTo(10.496, 3);
  });
  it('12: a steady block', () => {
    const s = fitnessSeries(Array.from({ length: 42 }, () => 100));
    expect(s[6]?.fatigue).toBeCloseTo(66.01, 2);
    const last = s[41];
    expect(last?.fitness).toBeCloseTo(63.654, 3);
    expect(last?.fatigue).toBeCloseTo(99.846, 3);
    expect(last?.form).toBeCloseTo(-37.052, 3);
    expect(last?.ramp).toBeCloseTo(6.678, 3);
  });
  it('two weeks with a projection, starting values 50/50', () => {
    const loads = [0, 85, 60, 0, 110, 45, 160, 0, 70, 55, 0, 95, 40, 175];
    const s = fitnessSeries(loads, { startFitness: 50, startFatigue: 50, projectedFromDay: 11 });
    const rows: [number, number, number, number, number][] = [
      [0, 48.81, 42.86, 0, -1.19],
      [1, 49.67, 48.88, 5.95, -0.33],
      [6, 52.68, 67.15, -1.61, 2.68],
      [7, 51.43, 57.56, -14.47, 2.62],
      [10, 50.71, 50.33, -6.77, 1.98],
      [11, 51.76, 56.71, 0.38, 1.57],
      [13, 54.42, 71.56, -2.84, 1.74],
    ];
    for (const [d, fi, fa, fo, ra] of rows) {
      expect(s[d]?.fitness).toBeCloseTo(fi, 1);
      expect(s[d]?.fatigue).toBeCloseTo(fa, 1);
      expect(s[d]?.form).toBeCloseTo(fo, 1);
      expect(s[d]?.ramp).toBeCloseTo(ra, 1);
    }
    expect(s[10]?.projected).toBe(false);
    expect(s[11]?.projected).toBe(true);
  });
  it('honours firstDay and an empty input', () => {
    expect(fitnessSeries([])).toEqual([]);
    expect(fitnessSeries([10, 20], { firstDay: 5 }).map((p) => p.day)).toEqual([5, 6]);
  });
});

describe('recompute and daily loads', () => {
  it('recomputing from a day matches a full recompute and keeps earlier points', () => {
    const prev = fitnessSeries([50, 60, 70, 80, 90]);
    const after = [50, 60, 70, 100, 90];
    const next = recomputeFrom(prev, after, 3);
    expect(next).toEqual(fitnessSeries(after));
    expect(next[1]).toBe(prev[1]);
    expect(recomputeFrom(prev, after, 0)).toEqual(fitnessSeries(after));
  });
  it('sums per day and ignores out-of-range items', () => {
    const items = [{ day: 1, load: 10 }, { day: 1, load: 5.5 }, { day: 9, load: 1 }, { day: -1, load: 1 }];
    expect(dailyLoads(items, 0, 3)).toEqual([0, 15.5, 0, 0]);
    expect(dailyLoads([], 3, 1)).toEqual([]);
  });
});

describe('projection', () => {
  const input = {
    firstDay: 0,
    today: 2,
    actual: [{ day: 0, load: 50 }, { day: 2, load: 30 }, { day: 3, load: 999 }],
    planned: [
      { day: 0, plannedLoad: 60 },
      { day: 2, plannedLoad: 40, matched: true },
      { day: 2, plannedLoad: 25 },
      { day: 4, plannedLoad: 70 },
    ],
  };
  it('actuals before today, completed plus open today, planned after, nothing beyond', () => {
    expect(projectedLoads(input)).toEqual([50, 0, 55, 0, 70]);
  });
  it('series marks projected days and accepts starting values', () => {
    const s = projectedSeries({ ...input, startFitness: 10, startFatigue: 20 });
    expect(s.map((p) => p.projected)).toEqual([false, false, false, true, true]);
    expect(s[0]?.form).toBe(-10);
    expect(projectedSeries(input)[0]?.form).toBe(0);
  });
  it('no planned work beyond today draws nothing past today', () => {
    expect(projectedLoads({ firstDay: 0, today: 1, actual: [{ day: 0, load: 5 }], planned: [] })).toEqual([5, 0]);
  });
  it('a start after today does not break', () => {
    expect(projectedLoads({ firstDay: 5, today: 3, actual: [], planned: [] })).toEqual([]);
  });
});

describe('display', () => {
  it('rounds half away from zero', () => {
    expect(roundHalfAway(2.5)).toBe(3);
    expect(roundHalfAway(-2.5)).toBe(-3);
    expect(Object.is(roundHalfAway(-0.4), 0)).toBe(true);
    expect(roundHalfAway(6.678, 1)).toBe(6.7);
  });
  it('formats Load, Fitness, Fatigue', () => {
    expect(formatLoad(96.708)).toBe('97');
    expect(formatWhole(63.654)).toBe('64');
    expect(formatWhole(1234.5)).toBe('1,235');
  });
  it('formats Form with a true minus', () => {
    expect(formatForm(-11.905)).toBe('−12');
    expect(formatForm(5.5)).toBe('+6');
    expect(formatForm(-0.4)).toBe('0');
    expect(formatForm(0)).toBe('0');
  });
  it('formats Ramp to one decimal', () => {
    expect(formatRamp(6.678)).toBe('+6.7');
    expect(formatRamp(-1.19)).toBe('−1.2');
    expect(formatRamp(0.02)).toBe('0');
  });
});

describe('formBand (metrics.md section 5, vector 15)', () => {
  it('classifies the displayed value', () => {
    expect(formBand(-30.5)).toBe('overreaching');
    expect(formBand(-30.4)).toBe('building');
    expect(formBand(-10.6)).toBe('building');
    expect(formBand(-10.4)).toBe('steady');
    expect(formBand(5.4)).toBe('steady');
    expect(formBand(5.5)).toBe('fresh');
    expect(formBand(25.4)).toBe('fresh');
    expect(formBand(25.5)).toBe('detraining');
  });
});
