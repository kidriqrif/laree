import { describe, expect, it } from 'vitest';
import { streamDigest } from './streamDigest.ts';

const fill = (n: number, v: number): number[] => Array.from({ length: n }, () => v);

describe('streamDigest', () => {
  it('puts a ride in power zones and finds its best efforts', () => {
    // 10 minutes easy at 100 W, then 5 minutes at 260 W, for an athlete with FTP 250 W.
    const powerW = [...fill(600, 100), ...fill(300, 260)];
    const d = streamDigest('bike', { powerW, hrBpm: fill(900, 140) }, { ftp: 250, lthr: 165 });
    expect(d.zones).toHaveLength(5);
    expect(d.zones?.reduce((a, b) => a + b, 0)).toBe(900);
    expect(d.zones?.[0]).toBe(600);
    expect(d.power?.[300]).toBeCloseTo(260, 6);
    expect(d.power?.[1200]).toBeNull();
    expect(d.run).toBeNull();
  });

  it('falls back to heart rate when the ride has no power threshold', () => {
    const d = streamDigest('bike', { powerW: fill(120, 200), hrBpm: fill(120, 150) }, { lthr: 165 });
    expect(d.zones?.reduce((a, b) => a + b, 0)).toBe(120);
    expect(d.power).not.toBeNull();
  });

  it('gives a run its pace zones and best times from typed arrays', () => {
    // 4 m/s for 30 minutes: 7.2 km, so 5 km takes 1250 s.
    const n = 1800;
    const speedMps = new Float32Array(n).fill(4);
    const distanceM = Float32Array.from({ length: n + 1 }, (_, i) => i * 4);
    const d = streamDigest('run', { speedMps, distanceM }, { thresholdPaceSPerKm: 250 });
    expect(d.zones?.reduce((a, b) => a + b, 0)).toBe(n);
    expect(d.run?.['5 km']).toBeCloseTo(1250, 3);
    expect(d.power).toBeNull();
  });

  it('falls back to heart rate when the power channel has no reading', () => {
    const gaps = fill(120, Number.NaN);
    const d = streamDigest('bike', { powerW: gaps, hrBpm: fill(120, 150) }, { ftp: 250, lthr: 165 });
    expect(d.zones?.reduce((a, b) => a + b, 0)).toBe(120);
    // No best efforts of 0 W from a channel that never read anything.
    expect(d.power).toBeNull();
    expect(streamDigest('bike', { powerW: gaps, hrBpm: gaps }, { ftp: 250, lthr: 165 })).toEqual({ zones: null, power: null, run: null });
    expect(streamDigest('run', { speedMps: gaps, hrBpm: fill(120, 150) }, { thresholdPaceSPerKm: 250, lthr: 165 }).zones?.reduce((a, b) => a + b, 0)).toBe(120);
    expect(streamDigest('run', { speedMps: gaps }, { thresholdPaceSPerKm: 250 }).zones).toBeNull();
  });

  it('skips missing readings and gives nothing without a signal or threshold', () => {
    const hr = [150, Number.NaN, 150];
    expect(streamDigest('strength', { hrBpm: hr }, { lthr: 165 }).zones?.reduce((a, b) => a + b, 0)).toBe(2);
    expect(streamDigest('strength', { hrBpm: hr }, {})).toEqual({ zones: null, power: null, run: null });
    expect(streamDigest('swim', {}, { cssSPer100m: 100, lthr: 160 })).toEqual({ zones: null, power: null, run: null });
  });
});
