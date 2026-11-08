/** Zones, time in zones and the polarisation index. See docs/spec/metrics.md section 6. Pure. */

export type ZoneSystem = 'power' | 'heartRate' | 'runPace' | 'swim';

/** Lower-inclusive edges as integer percentages of threshold (value or speed). */
export const ZONE_EDGES: Readonly<Record<ZoneSystem, readonly number[]>> = {
  power: [55, 75, 90, 105, 120, 150],
  heartRate: [81, 90, 94, 100],
  runPace: [78, 88, 95, 103],
  swim: [85, 93, 98, 103],
};

export const ZONE_NAMES: Readonly<Record<ZoneSystem, readonly string[]>> = {
  power: ['Recovery', 'Endurance', 'Tempo', 'Threshold', 'VO2 max', 'Anaerobic', 'Sprint'],
  heartRate: ['Recovery', 'Endurance', 'Tempo', 'Threshold', 'Above threshold'],
  runPace: ['Recovery', 'Endurance', 'Tempo', 'Threshold', 'Speed'],
  swim: ['Recovery', 'Endurance', 'Tempo', 'Threshold', 'Fast'],
};

export function zoneCount(system: ZoneSystem): number {
  return ZONE_EDGES[system].length + 1;
}

/**
 * Zone (1-based) of a value. For power and heart rate `value` and `threshold` are watts or bpm;
 * for run pace and swim both are speeds in m/s. A value on an edge belongs to the higher zone.
 * Compares `100 * value >= edge * threshold` so edges stay exact.
 */
export function zoneOf(system: ZoneSystem, value: number, threshold: number): number {
  let zone = 1;
  for (const edge of ZONE_EDGES[system]) {
    if (100 * value >= edge * threshold) zone += 1;
  }
  return zone;
}

export interface WholeZoneRange {
  zone: number;
  name: string;
  /** Lowest whole value, or null for zone 1 (no lower limit). */
  low: number | null;
  /** Highest whole value, or null for the top zone (no upper limit). */
  high: number | null;
}

/** Whole-number ranges for power (W) or heart rate (bpm). */
export function wholeZoneRanges(system: 'power' | 'heartRate', threshold: number): WholeZoneRange[] {
  const edges = ZONE_EDGES[system];
  const lows = edges.map((e) => Math.ceil((e * threshold) / 100));
  return ZONE_NAMES[system].map((name, i) => ({
    zone: i + 1,
    name,
    low: i === 0 ? null : (lows[i - 1] as number),
    high: i === edges.length ? null : (lows[i] as number) - 1,
  }));
}

export interface PaceZoneRange {
  zone: number;
  name: string;
  /** Pace in seconds per unit (km for run, 100 m for swim) at the slow end, unrounded; null for zone 1. */
  slowEdgeS: number | null;
  /** Pace at the fast end, unrounded; null for the top zone. */
  fastEdgeS: number | null;
}

/**
 * Pace ranges for run (s/km) or swim (s/100 m). The pace at an edge is
 * `threshold pace * 100 / edge`. Round to the nearest second for display only.
 */
export function paceZoneRanges(system: 'runPace' | 'swim', thresholdPaceS: number): PaceZoneRange[] {
  const edges = ZONE_EDGES[system];
  const paces = edges.map((e) => (thresholdPaceS * 100) / e);
  return ZONE_NAMES[system].map((name, i) => ({
    zone: i + 1,
    name,
    slowEdgeS: i === 0 ? null : (paces[i - 1] as number),
    fastEdgeS: i === edges.length ? null : (paces[i] as number),
  }));
}

/** Seconds per zone for a 1 Hz stream (index 0 is zone 1). Missing readings are skipped. */
export function timeInZones(
  system: ZoneSystem,
  stream: ReadonlyArray<number | null | undefined>,
  threshold: number,
): number[] {
  const out = Array.from({ length: zoneCount(system) }, () => 0);
  for (const v of stream) {
    if (v === null || v === undefined || Number.isNaN(v)) continue;
    const idx = zoneOf(system, v, threshold) - 1;
    out[idx] = (out[idx] as number) + 1;
  }
  return out;
}

/** An activity with no stream puts its whole timer time in the zone of its average value. */
export function timeInZonesFromAverage(
  system: ZoneSystem,
  averageValue: number,
  timerS: number,
  threshold: number,
): number[] {
  const out = Array.from({ length: zoneCount(system) }, () => 0);
  out[zoneOf(system, averageValue, threshold) - 1] = timerS;
  return out;
}

export type ThreeZone = 'easy' | 'middle' | 'hard';

/** Z1 and Z2 are easy, Z3 and Z4 middle, Z5 and above hard (all systems). */
export function threeZoneOf(zone: number): ThreeZone {
  if (zone <= 2) return 'easy';
  if (zone <= 4) return 'middle';
  return 'hard';
}

export interface ThreeZoneSeconds {
  easy: number;
  middle: number;
  hard: number;
}

export function collapseToThreeZones(secondsPerZone: readonly number[]): ThreeZoneSeconds {
  const out: ThreeZoneSeconds = { easy: 0, middle: 0, hard: 0 };
  secondsPerZone.forEach((s, i) => {
    out[threeZoneOf(i + 1)] += s;
  });
  return out;
}

export type PolarisationStatus = 'polarised' | 'notPolarised' | 'insufficient';

export interface PolarisationResult {
  status: PolarisationStatus;
  /** Rounded to 2 dp; null when not shown. */
  index: number | null;
  label: 'Polarised' | 'Not polarised' | '—';
  reason?: string;
}

function round2(x: number): number {
  return Math.sign(x) * (Math.round(Math.abs(x) * 100) / 100);
}

/** The index from fractions of zoned time (easy, middle, hard), without the data checks. */
export function polarisationFromFractions(z1: number, z2: number, z3: number): PolarisationResult {
  if (!(z1 > z3 && z3 > z2)) {
    return { status: 'notPolarised', index: null, label: 'Not polarised' };
  }
  const mid = z2 === 0 ? 0.01 : z2;
  const index = round2(Math.log10((z1 / mid) * z3 * 100));
  return index > 2
    ? { status: 'polarised', index, label: 'Polarised' }
    : { status: 'notPolarised', index, label: 'Not polarised' };
}

export const POLARISATION_MIN_ZONED_S = 10 * 3600;
export const POLARISATION_MIN_ZONED_SHARE = 0.7;

/**
 * Polarisation index over a window. `zoned` is seconds in each three-zone band over the window;
 * `totalTimerS` is the window's total timer time (zoned or not).
 */
export function polarisationIndex(zoned: ThreeZoneSeconds, totalTimerS: number): PolarisationResult {
  const zonedS = zoned.easy + zoned.middle + zoned.hard;
  if (zonedS < POLARISATION_MIN_ZONED_S || zonedS < POLARISATION_MIN_ZONED_SHARE * totalTimerS) {
    return { status: 'insufficient', index: null, label: '—', reason: 'Not enough zone data' };
  }
  return polarisationFromFractions(zoned.easy / zonedS, zoned.middle / zonedS, zoned.hard / zonedS);
}
