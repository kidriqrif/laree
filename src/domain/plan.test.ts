import { describe, expect, it } from 'vitest';
import { derivePhases, isDownWeek, weeklyTargets } from './plan.ts';
import { formatPace, resolveTarget, workoutTotals } from './steps.ts';
import type { PlainStep, Race, Step } from './types.ts';

const race = (priority: Race['priority'], week = 28): Race => ({
  id: 'r',
  athleteId: 'amir',
  name: 'Gran Fondo',
  day: (week - 1) * 7 + 5,
  sport: 'bike',
  distancesKm: [100],
  priority,
});

describe('derivePhases', () => {
  it('works back from the A race', () => {
    const p = derivePhases(race('A'), { firstWeek: 1 });
    expect(p.map((x) => [x.kind, x.firstWeek, x.lastWeek])).toEqual([
      ['base', 9, 16],
      ['build', 17, 22],
      ['peak', 23, 25],
      ['taper', 26, 27],
      ['race', 28, 28],
      ['recovery', 29, 30],
    ]);
  });
  it('ignores B and C races', () => {
    expect(derivePhases(race('B'))).toEqual([]);
    expect(derivePhases(race('C'))).toEqual([]);
  });
  it('cuts blocks at the first week', () => {
    const p = derivePhases(race('A', 20), { firstWeek: 4 });
    expect(p[0]?.kind).toBe('base');
    expect(p[0]?.firstWeek).toBe(4);
    const q = derivePhases(race('A', 12), { firstWeek: 4 });
    expect(q[0]?.kind).toBe('build');
    expect(q[0]?.firstWeek).toBe(4);
  });
});

describe('weeklyTargets', () => {
  it('has three up and one down', () => {
    const t = weeklyTargets('build', 1, 8);
    expect(t.filter((x) => x.downWeek).map((x) => x.week)).toEqual([4, 8]);
    expect(t[1]!.loadTarget).toBeGreaterThan(t[0]!.loadTarget);
    expect(t[3]!.loadTarget).toBeLessThan(t[0]!.loadTarget);
    expect(isDownWeek(12)).toBe(true);
  });
  it('keeps taper flat apart from down weeks', () => {
    const t = weeklyTargets('taper', 25, 26);
    expect(t[0]!.loadTarget).toBe(t[1]!.loadTarget);
  });
});

describe('resolveTarget', () => {
  it('power', () => {
    const t = { kind: 'pctFtp', low: 88, high: 93 } as const;
    expect(resolveTarget(t, { ftp: 255 })).toMatchObject({ low: 224, high: 237 });
    expect(resolveTarget(t, { ftp: 280 })).toMatchObject({ low: 246, high: 260 });
    expect(resolveTarget(t, {})).toBeNull();
  });
  it('pace', () => {
    const r = resolveTarget({ kind: 'pctThresholdPace', low: 95, high: 100 }, { thresholdPaceSPerKm: 265 });
    expect(r).toMatchObject({ kind: 'pace', low: 265, high: 279 });
    expect(formatPace(265)).toBe('4:25');
    expect(formatPace(279)).toBe('4:39');
    expect(resolveTarget({ kind: 'pctThresholdPace', low: 95, high: 100 }, {})).toBeNull();
  });
  it('swim, heart rate, effort', () => {
    expect(resolveTarget({ kind: 'pctCss', low: 100, high: 105 }, { cssSPer100m: 100 })).toMatchObject({
      low: 95,
      high: 100,
    });
    expect(resolveTarget({ kind: 'pctCss', low: 100, high: 105 }, {})).toBeNull();
    expect(resolveTarget({ kind: 'pctLthr', low: 90, high: 95 }, { lthr: 170 })).toMatchObject({
      low: 153,
      high: 162,
    });
    expect(resolveTarget({ kind: 'pctLthr', low: 90, high: 95 }, {})).toBeNull();
    expect(resolveTarget({ kind: 'rpe', low: 3, high: 4 }, {})).toMatchObject({ kind: 'effort', low: 3, high: 4 });
  });
});

describe('workoutTotals', () => {
  const p = (id: string, kind: PlainStep['kind'], durationS: number, pct: number): PlainStep => ({
    id,
    kind,
    durationS,
    target: { kind: 'pctFtp', low: pct, high: pct },
  });
  it('includes repeat blocks', () => {
    const steps: Step[] = [
      p('a', 'warmup', 600, 60),
      { id: 'r', kind: 'repeat', repeat: 3, steps: [p('b', 'interval', 300, 100), p('c', 'recovery', 300, 50)] },
    ];
    const t = workoutTotals(steps, 'bike', { ftp: 250 });
    expect(t.durationS).toBe(600 + 3 * 600);
    expect(t.load).toBeGreaterThan(0);
    expect(t.distanceM).toBeUndefined();
  });
  it('reports distance when steps have it', () => {
    const t = workoutTotals([{ id: 'x', kind: 'steady', distanceM: 5000, durationS: 1500 }], 'run', {
      thresholdPaceSPerKm: 265,
    });
    expect(t.distanceM).toBe(5000);
  });
});

describe('engine check: percentage targets round half away from zero exactly', () => {
  it('57% of FTP 150 W is 86 W, not 85', () => {
    expect(resolveTarget({ kind: 'pctFtp', low: 57, high: 57 }, { ftp: 150 })).toMatchObject({ low: 86 });
    expect(resolveTarget({ kind: 'pctFtp', low: 115, high: 115 }, { ftp: 110 })).toMatchObject({ low: 127 });
    expect(resolveTarget({ kind: 'pctLthr', low: 69, high: 113 }, { lthr: 150 })).toMatchObject({ low: 104, high: 170 });
    expect(resolveTarget({ kind: 'pctLthr', low: 70, high: 70 }, { lthr: 165 })).toMatchObject({ low: 116 });
  });
  it('matches integer arithmetic over a grid of thresholds', () => {
    for (let ftp = 100; ftp <= 400; ftp += 1) {
      for (let pct = 40; pct <= 200; pct += 1) {
        const r = resolveTarget({ kind: 'pctFtp', low: pct, high: pct }, { ftp });
        expect(r).toMatchObject({ low: Math.floor((2 * ftp * pct + 100) / 200) });
      }
    }
  });
});
