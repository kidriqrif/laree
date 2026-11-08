import { describe, expect, it } from 'vitest';
import {
  bestPowerCurve,
  bestRunCurve,
  bestRunTime,
  buildCurve,
  formatEffortTime,
  periodStartDay,
  runBestWithoutStream,
} from './curves.ts';

function cumulative(segments: Array<[number, number]>): number[] {
  const out = [0];
  for (const [secs, v] of segments) for (let i = 0; i < secs; i++) out.push((out[out.length - 1] as number) + v);
  return out;
}

describe('power curve', () => {
  const stream = [...Array(10).fill(100), ...Array(5).fill(400), ...Array(10).fill(100)];
  it('worked example', () => {
    const c = bestPowerCurve(stream);
    expect(c[5]).toBe(400);
    expect(c[15]).toBe(200);
    expect(c[30]).toBeNull();
    expect(c[3600]).toBeNull();
  });
  it('treats missing as 0 and handles exact-length windows', () => {
    const c = bestPowerCurve([100, null, undefined, NaN], [4, 5]);
    expect(c[4]).toBe(25);
    expect(c[5]).toBeNull();
  });
});

describe('run curve', () => {
  const cum = cumulative([[60, 4], [50, 5], [60, 4]]);
  it('worked example', () => {
    const b = bestRunTime(cum, 400);
    expect(b?.timeS).toBeCloseTo(87.5, 9);
    expect(b?.startS).toBe(23);
    expect(formatEffortTime(87.5)).toBe('1:28');
  });
  it('returns null when too short and handles flat stretches', () => {
    expect(bestRunTime(cum, 100000)).toBeNull();
    expect(bestRunTime([0, 0, 0, 10, 20], 10)?.timeS).toBeCloseTo(1, 9);
    expect(bestRunTime([0, 10, 10, 10, 20], 15)?.timeS).toBeCloseTo(3.5, 9);
  });
  it('curve over all distances', () => {
    const c = bestRunCurve(cum);
    expect(c['400 m']).not.toBeNull();
    expect(c['5 km']).toBeNull();
    expect(c.Marathon).toBeNull();
  });
  it('no-stream runs', () => {
    expect(runBestWithoutStream(5000, 1500, 5000)).toBe(1500);
    expect(runBestWithoutStream(5100, 1530, 5000)).toBeCloseTo(1500, 9);
    expect(runBestWithoutStream(5101, 1530, 5000)).toBeNull();
    expect(runBestWithoutStream(4999, 1500, 5000)).toBeNull();
  });
  it('formats hours', () => {
    expect(formatEffortTime(3725)).toBe('1:02:05');
    expect(formatEffortTime(59.4)).toBe('0:59');
  });
});

describe('period curves', () => {
  const acts = [
    { activityId: 'a', day: 100, startMinute: 360, values: { '5': 300, '60': 250 } },
    { activityId: 'b', day: 105, startMinute: 360, values: { '5': 300, '60': null } },
    { activityId: 'c', day: 50, startMinute: 360, values: { '5': 900 } },
  ];
  it('period starts', () => {
    expect(periodStartDay('last28', 118)).toBe(91);
    expect(periodStartDay('last84', 118)).toBe(35);
    expect(periodStartDay('season', 118, 20)).toBe(20);
    expect(periodStartDay('allTime', 118)).toBe(-Infinity);
  });
  it('takes the best, earlier wins ties, respects period', () => {
    const c = buildCurve(acts, ['5', '60', '120'], 'max', 'last28', 118);
    expect(c['5']).toEqual({ value: 300, activityId: 'a', day: 100 });
    expect(c['60']?.activityId).toBe('a');
    expect(c['120']).toBeNull();
    expect(buildCurve(acts, ['5'], 'max', 'allTime', 118)['5']?.activityId).toBe('c');
  });
  it('min direction', () => {
    const c = buildCurve(
      [
        { activityId: 'x', day: 1, startMinute: 0, values: { '5 km': 1500 } },
        { activityId: 'y', day: 2, startMinute: 0, values: { '5 km': 1400 } },
      ],
      ['5 km'],
      'min',
      'allTime',
      10,
    );
    expect(c['5 km']?.activityId).toBe('y');
  });
});
