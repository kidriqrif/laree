import { describe, expect, it } from 'vitest';
import {
  cleanDistance,
  cleanHr,
  cleanPower,
  gradeFactor,
  gradedDistance,
  plannedLoad,
  sessionLoad,
  weightedPowerFromStream,
} from './load.ts';
import type { LoadThresholds } from './load.ts';
import type { Step } from '../types.ts';

const AMIR: LoadThresholds = {
  ftp: 245,
  thresholdPaceSPerKm: 265,
  cssSPer100m: 108,
  lthr: 166,
  restingHr: 48,
};

const flat = (n: number, v: number) => Array.from({ length: n }, () => v);

function irfanRide(): number[] {
  return [
    ...flat(900, 180),
    ...[0, 1, 2, 3].flatMap(() => [...flat(480, 300), ...flat(240, 160)]),
    ...flat(540, 150),
  ];
}

describe('power method (vectors 1-4)', () => {
  it('1: an hour at threshold is 100', () => {
    const r = sessionLoad({ sport: 'bike', timerS: 3600, thresholds: AMIR, streams: { powerW: flat(3600, 245) } });
    expect(r.method).toBe('power');
    expect(r.confidence).toBe('high');
    expect(r.weightedPowerW).toBeCloseTo(245, 3);
    expect(r.intensity).toBeCloseTo(1, 3);
    expect(r.load).toBeCloseTo(100, 3);
  });
  it('2: half an hour at 196 W', () => {
    const r = sessionLoad({ sport: 'bike', timerS: 1800, thresholds: AMIR, streams: { powerW: flat(1800, 196) } });
    expect(r.intensity).toBeCloseTo(0.8, 3);
    expect(r.load).toBeCloseTo(32, 3);
  });
  it('3: Irfan intervals', () => {
    const p = irfanRide();
    expect(p.length).toBe(4320);
    const r = sessionLoad({ sport: 'bike', timerS: 4320, thresholds: { ftp: 280 }, streams: { powerW: p } });
    expect(r.weightedPowerW).toBeCloseTo(251.362, 1);
    expect(r.intensity).toBeCloseTo(0.8977, 3);
    expect(r.load).toBeCloseTo(96.708, 1);
  });
  it('4: FTP 255 in force', () => {
    const r = sessionLoad({ sport: 'bike', timerS: 3600, thresholds: { ftp: 255 }, streams: { powerW: flat(3600, 245) } });
    expect(r.intensity).toBeCloseTo(0.9608, 3);
    expect(r.load).toBeCloseTo(92.311, 2);
  });
  it('uses the summary weighted power only without a stream', () => {
    const r = sessionLoad({ sport: 'bike', timerS: 3600, thresholds: AMIR, summary: { weightedPowerW: 245 } });
    expect(r.method).toBe('power');
    expect(r.load).toBeCloseTo(100, 3);
  });
  it('a sparse stream beats the summary and fails the method', () => {
    const sparse = flat(3600, 245).map((p, i) => (i % 2 ? null : p));
    const r = sessionLoad({
      sport: 'bike',
      timerS: 3600,
      thresholds: AMIR,
      streams: { powerW: sparse },
      summary: { weightedPowerW: 245 },
      rpe: 7,
    });
    expect(r.method).toBe('effort');
  });
  it('drops out-of-range readings', () => {
    expect(cleanPower([-1, 0, 2500, 2501, NaN, undefined])).toEqual([null, 0, 2500, null, null, null]);
  });
  it('no FTP means the method fails; non-bike skips power', () => {
    expect(sessionLoad({ sport: 'bike', timerS: 3600, thresholds: {}, streams: { powerW: flat(3600, 200) } }).method).toBe('duration');
    expect(sessionLoad({ sport: 'run', timerS: 3600, thresholds: AMIR, streams: { powerW: flat(3600, 200) } }).method).toBe('duration');
  });
  it('weighted power needs 30 samples', () => {
    expect(weightedPowerFromStream(flat(29, 200))).toBeNull();
    expect(weightedPowerFromStream(flat(30, 200))).toBeCloseTo(200, 6);
  });
  it('a bike with no usable power falls through', () => {
    expect(sessionLoad({ sport: 'bike', timerS: 3600, thresholds: AMIR }).method).toBe('duration');
    expect(sessionLoad({ sport: 'bike', timerS: 20, thresholds: AMIR, streams: { powerW: flat(20, 0) } }).method).toBe('duration');
    expect(sessionLoad({ sport: 'bike', timerS: 3600, thresholds: AMIR, streams: { powerW: flat(3600, 0) } }).method).toBe('duration');
  });
});

describe('pace method (vectors 5-6)', () => {
  it('5: flat 10 km, no altitude', () => {
    const r = sessionLoad({ sport: 'run', timerS: 3000, thresholds: AMIR, summary: { distanceM: 10000 } });
    expect(r.method).toBe('pace');
    expect(r.confidence).toBe('medium');
    expect(r.intensity).toBeCloseTo(0.8833, 3);
    expect(r.load).toBeCloseTo(65.023, 2);
  });
  it('treadmill is high confidence', () => {
    const r = sessionLoad({ sport: 'run', timerS: 3000, thresholds: AMIR, summary: { distanceM: 10000 }, treadmill: true });
    expect(r.confidence).toBe('high');
  });
  it('uses a stored graded distance', () => {
    const r = sessionLoad({ sport: 'run', timerS: 3000, thresholds: AMIR, summary: { distanceM: 10000, gradedDistanceM: 10200 } });
    expect(r.confidence).toBe('high');
    expect(r.gradedSpeedMps).toBeCloseTo(3.4, 6);
    const g = sessionLoad({ sport: 'run', timerS: 3000, thresholds: AMIR, summary: { gradedDistanceM: 10200 } });
    expect(g.gradedSpeedMps).toBeCloseTo(3.4, 6);
  });
  it('grade factors match the table', () => {
    const table: [number, number][] = [[-0.2, 0.5], [-0.1, 0.598], [-0.06, 0.724], [-0.03, 0.849], [0, 1], [0.03, 1.174], [0.06, 1.369], [0.1, 1.658], [0.2, 2.502]];
    for (const [g, f] of table) expect(gradeFactor(g)).toBeCloseTo(f, 3);
    expect(gradeFactor(0.9)).toBeCloseTo(gradeFactor(0.45), 9);
  });

  function hillStreams() {
    const dist: number[] = [0];
    const alt: number[] = [0];
    const part = (metres: number, secs: number, grade: number) => {
      for (let i = 1; i <= secs; i++) {
        dist.push((dist.at(-1) as number) + metres / secs);
        alt.push((alt.at(-1) as number) + (metres / secs) * grade);
      }
    };
    part(2000, 600, 0);
    part(1000, 360, 0.06);
    part(1000, 270, -0.06);
    return { dist, alt };
  }

  it('6: hill streams', () => {
    const { dist, alt } = hillStreams();
    expect(dist.length).toBe(1231);
    expect(gradedDistance(dist, alt)).toBeCloseTo(4096.76, 1);
    const r = sessionLoad({ sport: 'run', timerS: 1230, thresholds: AMIR, streams: { distanceM: dist, altitudeM: alt } });
    expect(r.confidence).toBe('high');
    expect(r.gradedSpeedMps).toBeCloseTo(3.3307, 3);
    expect(r.load).toBeCloseTo(26.617, 1);
  });
  it('the same run without altitude is flat and medium', () => {
    const { dist } = hillStreams();
    const r = sessionLoad({ sport: 'run', timerS: 1230, thresholds: AMIR, streams: { distanceM: dist } });
    expect(r.confidence).toBe('medium');
    expect(r.intensity).toBeCloseTo(0.8618, 3);
    expect(r.load).toBeCloseTo(25.37, 1);
    const tm = sessionLoad({ sport: 'run', timerS: 1230, thresholds: AMIR, streams: { distanceM: dist }, treadmill: true });
    expect(tm.confidence).toBe('high');
  });
  it('implausible pace is a data error and the cascade moves on', () => {
    const r = sessionLoad({ sport: 'run', timerS: 3600, thresholds: AMIR, summary: { distanceM: 30000 }, rpe: 5 });
    expect(r.method).toBe('effort');
  });
  it('under 100 m or no threshold fails', () => {
    expect(sessionLoad({ sport: 'run', timerS: 600, thresholds: AMIR, summary: { distanceM: 99 } }).method).toBe('duration');
    expect(sessionLoad({ sport: 'run', timerS: 600, thresholds: {}, summary: { distanceM: 2000 } }).method).toBe('duration');
    expect(sessionLoad({ sport: 'run', timerS: 600, thresholds: AMIR }).method).toBe('duration');
  });
  it('cleans distance: spikes dropped and gaps interpolated', () => {
    expect(cleanDistance([0, 3, null, 9, 12])).toEqual([0, 3, 6, 9, 12]);
    expect(cleanDistance([0, 3, 500, 9])).toEqual([0, 3, 6, 9]);
    expect(cleanDistance([null, 3, 6, null])).toEqual([3, 3, 6, 6]);
  });
});

describe('swim method (vector 7)', () => {
  it('7: 2,000 m in 40 min', () => {
    const r = sessionLoad({ sport: 'swim', timerS: 2400, thresholds: AMIR, summary: { distanceM: 2000 } });
    expect(r.method).toBe('swim');
    expect(r.confidence).toBe('medium');
    expect(r.intensity).toBeCloseTo(0.9, 3);
    expect(r.load).toBeCloseTo(48.6, 3);
  });
  it('open water is low confidence', () => {
    const r = sessionLoad({ sport: 'swim', timerS: 2400, thresholds: AMIR, summary: { distanceM: 2000 }, openWater: true });
    expect(r.confidence).toBe('low');
  });
  it('fails on short distance, bad intensity, no CSS', () => {
    expect(sessionLoad({ sport: 'swim', timerS: 600, thresholds: AMIR, summary: { distanceM: 20 } }).method).toBe('duration');
    expect(sessionLoad({ sport: 'swim', timerS: 600, thresholds: AMIR, summary: { distanceM: 5000 } }).method).toBe('duration');
    expect(sessionLoad({ sport: 'swim', timerS: 600, thresholds: {}, summary: { distanceM: 500 } }).method).toBe('duration');
  });
});

describe('heart rate method (vector 8)', () => {
  it('8: at LTHR and at 136 bpm', () => {
    const a = sessionLoad({ sport: 'other', timerS: 3600, thresholds: AMIR, streams: { hrBpm: flat(3600, 166) } });
    expect(a.method).toBe('heartRate');
    expect(a.confidence).toBe('medium');
    expect(a.load).toBeCloseTo(100, 3);
    const b = sessionLoad({ sport: 'other', timerS: 3600, thresholds: AMIR, streams: { hrBpm: flat(3600, 136) } });
    expect(b.load).toBeCloseTo(57.834, 3);
  });
  it('worked example 3: 130 then 160, and a steady 145', () => {
    const split = [...flat(1800, 130), ...flat(1800, 160)];
    expect(sessionLoad({ sport: 'other', timerS: 3600, thresholds: AMIR, streams: { hrBpm: split } }).load).toBeCloseTo(70.71, 1);
    expect(sessionLoad({ sport: 'other', timerS: 3600, thresholds: AMIR, streams: { hrBpm: flat(3600, 145) } }).load).toBeCloseTo(68.8, 1);
  });
  it('missing seconds take the session average weight', () => {
    const hr = flat(3600, 166).map((h, i) => (i % 10 === 0 ? null : h));
    expect(sessionLoad({ sport: 'other', timerS: 3600, thresholds: AMIR, streams: { hrBpm: hr } }).load).toBeCloseTo(100, 3);
  });
  it('fails on thin coverage or thresholds too close', () => {
    const thin = flat(3600, 166).map((h, i) => (i % 2 ? null : h));
    expect(sessionLoad({ sport: 'other', timerS: 3600, thresholds: AMIR, streams: { hrBpm: thin } }).method).toBe('duration');
    expect(sessionLoad({ sport: 'other', timerS: 3600, thresholds: { lthr: 160, restingHr: 145 }, streams: { hrBpm: flat(3600, 150) } }).method).toBe('duration');
    expect(sessionLoad({ sport: 'other', timerS: 3600, thresholds: {}, streams: { hrBpm: flat(3600, 150) } }).method).toBe('duration');
  });
  it('cleans readings and floors below-resting at 0', () => {
    expect(cleanHr([29, 30, 230, 231])).toEqual([null, 30, 230, null]);
    const r = sessionLoad({ sport: 'other', timerS: 3600, thresholds: AMIR, streams: { hrBpm: flat(3600, 40) } });
    expect(r.load).toBe(0);
  });
});

describe('effort and duration (vectors 9-10)', () => {
  it('9: RPE', () => {
    expect(sessionLoad({ sport: 'run', timerS: 3600, thresholds: {}, rpe: 7 }).load).toBeCloseTo(100, 3);
    const r = sessionLoad({ sport: 'run', timerS: 2700, thresholds: {}, rpe: 5 });
    expect(r.load).toBeCloseTo(53.571, 3);
    expect(r.method).toBe('effort');
    expect(r.confidence).toBe('medium');
    expect(sessionLoad({ sport: 'run', timerS: 5400, thresholds: {}, rpe: 3 }).load).toBeCloseTo(64.29, 2);
    expect(sessionLoad({ sport: 'run', timerS: 3600, thresholds: {}, rpe: 0 }).load).toBe(0);
    expect(sessionLoad({ sport: 'run', timerS: 3600, thresholds: {}, rpe: 11 }).method).toBe('duration');
  });
  it('10: duration only', () => {
    const r = sessionLoad({ sport: 'run', timerS: 3600, thresholds: {} });
    expect(r.load).toBeCloseTo(56.25, 3);
    expect(r.method).toBe('duration');
    expect(r.confidence).toBe('low');
    expect(sessionLoad({ sport: 'strength', timerS: 2700, thresholds: {} }).load).toBeCloseTo(27, 3);
    expect(sessionLoad({ sport: 'bike', timerS: 3600, thresholds: {} }).load).toBeCloseTo(42.25, 3);
    expect(sessionLoad({ sport: 'swim', timerS: 3600, thresholds: {} }).load).toBeCloseTo(56.25, 3);
    expect(sessionLoad({ sport: 'other', timerS: 3600, thresholds: {} }).load).toBeCloseTo(25, 3);
  });
  it('under 60 s scores nothing', () => {
    const r = sessionLoad({ sport: 'bike', timerS: 59, thresholds: AMIR, rpe: 9 });
    expect(r).toMatchObject({ load: 0, method: 'duration', confidence: 'low' });
  });
});

describe('planned load', () => {
  const t = (kind: 'pctFtp' | 'pctThresholdPace' | 'pctCss' | 'pctLthr' | 'rpe', low: number, high: number) => ({ kind, low, high });
  it('power basis (Irfan, 82.10)', () => {
    const steps: Step[] = [
      { id: 'a', kind: 'warmup', durationS: 900, target: t('pctFtp', 55, 65) },
      {
        id: 'r',
        kind: 'repeat',
        repeat: 4,
        steps: [
          { id: 'i', kind: 'interval', durationS: 480, target: t('pctFtp', 95, 100) },
          { id: 'c', kind: 'recovery', durationS: 240, target: t('pctFtp', 50, 60) },
        ],
      },
      { id: 'd', kind: 'cooldown', durationS: 600, target: t('pctFtp', 50, 60) },
    ];
    const r = plannedLoad({ sport: 'bike', steps, thresholds: { ftp: 280 } });
    expect(r.durationS).toBe(4380);
    expect(r.loadSource).toBe('steps');
    expect(r.load).toBeCloseTo(82.1, 1);
    expect(r.distanceM).toBeUndefined();
  });
  it('pace basis (Danial, 56.03) with distance', () => {
    const steps: Step[] = [
      { id: 'a', kind: 'steady', durationS: 600, target: t('pctThresholdPace', 70, 70) },
      {
        id: 'r',
        kind: 'repeat',
        repeat: 5,
        steps: [
          { id: 'i', kind: 'interval', durationS: 240, target: t('pctThresholdPace', 105, 105) },
          { id: 'c', kind: 'recovery', durationS: 120, target: t('pctThresholdPace', 65, 65) },
        ],
      },
      { id: 'd', kind: 'cooldown', durationS: 600, target: t('pctThresholdPace', 65, 65) },
    ];
    const r = plannedLoad({ sport: 'run', steps, thresholds: { thresholdPaceSPerKm: 238 } });
    expect(r.durationS).toBe(3000);
    expect(r.load).toBeCloseTo(56.03, 2);
    expect(r.distanceM).toBeCloseTo((2460 * 1000) / 238, 3);
  });
  it('swim basis with a distance step', () => {
    const steps: Step[] = [{ id: 'a', kind: 'steady', distanceM: 1000, target: t('pctCss', 90, 90) }];
    const r = plannedLoad({ sport: 'swim', steps, thresholds: { cssSPer100m: 100 } });
    expect(r.durationS).toBeCloseTo(1000 / 0.9, 6);
    expect(r.distanceM).toBe(1000);
    expect(r.load).toBeCloseTo((r.durationS / 3600) * 0.9 ** 3 * 100, 6);
  });
  it('heart-rate basis: an hour at LTHR is 100', () => {
    const steps: Step[] = [{ id: 'a', kind: 'steady', durationS: 3600, target: t('pctLthr', 100, 100) }];
    expect(plannedLoad({ sport: 'run', steps, thresholds: AMIR }).load).toBeCloseTo(100, 6);
    expect(plannedLoad({ sport: 'run', steps, thresholds: {} }).load).toBe(0);
  });
  it('effort basis, and defaults for untargeted steps', () => {
    const steps: Step[] = [
      { id: 'a', kind: 'steady', durationS: 3600, target: t('rpe', 7, 7) },
      { id: 'b', kind: 'warmup', durationS: 600 },
    ];
    const r = plannedLoad({ sport: 'run', steps, thresholds: {} });
    expect(r.load).toBeCloseTo(100 + 10 * 3 * (5 / 21), 6);
  });
  it('default source: no targets or no steps', () => {
    const r = plannedLoad({ sport: 'run', steps: [{ id: 'a', kind: 'steady', durationS: 3600 }], thresholds: {} });
    expect(r).toMatchObject({ loadSource: 'default', basis: null });
    expect(r.load).toBeCloseTo(56.25, 6);
    expect(plannedLoad({ sport: 'bike', steps: [], thresholds: {}, plannedDurationS: 3600 }).load).toBeCloseTo(42.25, 6);
  });
  it('distance-only default durations', () => {
    const run = plannedLoad({ sport: 'run', steps: [], thresholds: { thresholdPaceSPerKm: 250 }, plannedDistanceM: 8000 });
    expect(run.durationS).toBeCloseTo(8000 / 3.2, 6);
    const swim = plannedLoad({ sport: 'swim', steps: [], thresholds: { cssSPer100m: 100 }, plannedDistanceM: 900 });
    expect(swim.durationS).toBeCloseTo(1000, 6);
    const ride = plannedLoad({ sport: 'bike', steps: [], thresholds: {}, plannedDistanceM: 27000 });
    expect(ride.durationS).toBeCloseTo(3600, 6);
    expect(ride.distanceM).toBe(27000);
  });
});

describe('engine check: non-finite inputs never produce a non-finite load', () => {
  const base = { sport: 'bike' as const, thresholds: AMIR, timerS: 3600 };
  it('timerS NaN or Infinity gives zero', () => {
    expect(sessionLoad({ ...base, timerS: Number.NaN }).load).toBe(0);
    expect(sessionLoad({ ...base, timerS: Number.POSITIVE_INFINITY }).load).toBe(0);
  });
  it('NaN lthr, NaN distance and Infinity weighted power fall through the cascade', () => {
    const hr = flat(3600, 150);
    const a = sessionLoad({ sport: 'run', thresholds: { ...AMIR, lthr: Number.NaN }, timerS: 3600, streams: { hrBpm: hr } });
    expect(Number.isFinite(a.load)).toBe(true);
    const b = sessionLoad({ sport: 'run', thresholds: AMIR, timerS: 3600, summary: { distanceM: Number.NaN } });
    expect(Number.isFinite(b.load)).toBe(true);
    const c = sessionLoad({ ...base, summary: { weightedPowerW: Number.POSITIVE_INFINITY } });
    expect(Number.isFinite(c.load)).toBe(true);
    expect(c.method).not.toBe('power');
  });
  it('a planned distance step with a 0% target has a finite load and duration', () => {
    const steps: Step[] = [
      { id: 's', kind: 'interval', distanceM: 1000, target: { kind: 'pctThresholdPace', low: 0, high: 0 } },
    ];
    const r = plannedLoad({ sport: 'run', steps, thresholds: AMIR });
    expect(Number.isFinite(r.load)).toBe(true);
    expect(Number.isFinite(r.durationS)).toBe(true);
  });
});
