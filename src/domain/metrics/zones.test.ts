import { describe, expect, it } from 'vitest';
import {
  collapseToThreeZones,
  paceZoneRanges,
  polarisationFromFractions,
  polarisationIndex,
  threeZoneOf,
  timeInZones,
  timeInZonesFromAverage,
  wholeZoneRanges,
  zoneCount,
  zoneOf,
} from './zones.ts';

describe('power zones (Amir, FTP 245)', () => {
  it('builds the whole-watt table', () => {
    const r = wholeZoneRanges('power', 245).map((z) => [z.low, z.high]);
    expect(r).toEqual([[null, 134], [135, 183], [184, 220], [221, 257], [258, 293], [294, 367], [368, null]]);
  });
  it('puts edge values in the higher zone', () => {
    expect(zoneOf('power', 134, 245)).toBe(1);
    expect(zoneOf('power', 135, 245)).toBe(2);
    expect(zoneOf('power', 294, 245)).toBe(7 - 1);
    expect(zoneOf('power', 367, 245)).toBe(6);
    expect(zoneOf('power', 368, 245)).toBe(7);
    expect(zoneOf('power', 0, 245)).toBe(1);
  });
  it('counts zones', () => {
    expect(zoneCount('power')).toBe(7);
    expect(zoneCount('heartRate')).toBe(5);
  });
});

describe('heart-rate zones (Amir, LTHR 166)', () => {
  it('builds the bpm table', () => {
    const r = wholeZoneRanges('heartRate', 166).map((z) => [z.low, z.high]);
    expect(r).toEqual([[null, 134], [135, 149], [150, 156], [157, 165], [166, null]]);
  });
});

describe('pace zones', () => {
  it('Danial run edges', () => {
    const r = paceZoneRanges('runPace', 238);
    expect(r.slice(1).map((z) => Math.round(z.slowEdgeS as number))).toEqual([305, 270, 251, 231]);
    expect(r[0]?.slowEdgeS).toBeNull();
    expect(r[4]?.fastEdgeS).toBeNull();
  });
  it('Amir run edges', () => {
    const r = paceZoneRanges('runPace', 265);
    expect(r.slice(1).map((z) => Math.round(z.slowEdgeS as number))).toEqual([340, 301, 279, 257]);
  });
  it('Amir swim edges', () => {
    const r = paceZoneRanges('swim', 108);
    expect(r.slice(1).map((z) => Math.round(z.slowEdgeS as number))).toEqual([127, 116, 110, 105]);
  });
  it('classifies speeds against threshold speed', () => {
    const t = 1000 / 265;
    expect(zoneOf('runPace', t * 0.78, t)).toBe(2);
    expect(zoneOf('runPace', t * 0.779, t)).toBe(1);
    expect(zoneOf('runPace', t * 1.03, t)).toBe(5);
    const css = 100 / 108;
    expect(zoneOf('swim', css, css)).toBe(4);
  });
});

describe('time in zones', () => {
  it('counts one second per sample and skips gaps', () => {
    expect(timeInZones('power', [100, 100, 200, null, undefined, NaN, 400], 245)).toEqual([2, 0, 1, 0, 0, 0, 1]);
  });
  it('puts a swim without length data in one zone', () => {
    expect(timeInZonesFromAverage('swim', 100 / 108, 2400, 100 / 108)).toEqual([0, 0, 0, 2400, 0]);
  });
});

describe('three-zone model', () => {
  it('maps zones', () => {
    expect([1, 2, 3, 4, 5, 6, 7].map(threeZoneOf)).toEqual(['easy', 'easy', 'middle', 'middle', 'hard', 'hard', 'hard']);
  });
  it('collapses', () => {
    expect(collapseToThreeZones([1, 2, 3, 4, 5, 6, 7])).toEqual({ easy: 3, middle: 7, hard: 18 });
  });
});

describe('polarisation index', () => {
  it('worked examples', () => {
    const a = polarisationFromFractions(0.8, 0.05, 0.15);
    expect(a.index).toBe(2.38);
    expect(a.label).toBe('Polarised');
    expect(polarisationFromFractions(0.85, 0, 0.15).index).toBe(3.11);
    const c = polarisationFromFractions(0.6, 0.15, 0.25);
    expect(c.index).toBe(2);
    expect(c.label).toBe('Not polarised');
    const d = polarisationFromFractions(0.7, 0.2, 0.1);
    expect(d.index).toBeNull();
    expect(d.label).toBe('Not polarised');
  });
  it('30 h / 2 h / 4 h', () => {
    const r = polarisationIndex({ easy: 30 * 3600, middle: 2 * 3600, hard: 4 * 3600 }, 36 * 3600);
    expect(r.index).toBe(2.22);
    expect(r.status).toBe('polarised');
  });
  it('needs 10 hours of zoned time', () => {
    const r = polarisationIndex({ easy: 8 * 3600, middle: 0, hard: 1 * 3600 }, 9 * 3600);
    expect(r).toMatchObject({ status: 'insufficient', index: null, label: '—', reason: 'Not enough zone data' });
  });
  it('needs 70% of timer time zoned', () => {
    const z = { easy: 10 * 3600, middle: 0, hard: 2 * 3600 };
    expect(polarisationIndex(z, 12 * 3600 / 0.7 + 60).status).toBe('insufficient');
    expect(polarisationIndex(z, 12 * 3600 / 0.7 - 60).status).toBe('polarised');
  });
});
