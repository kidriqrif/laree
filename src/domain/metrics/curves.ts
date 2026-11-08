/** Best-effort power and pace curves. See docs/spec/metrics.md section 8. Pure. */

import type { DayOffset } from '../types.ts';

export const POWER_WINDOWS_S = [5, 15, 30, 60, 120, 300, 600, 1200, 1800, 3600] as const;

export const RUN_DISTANCES_M = {
  '400 m': 400,
  '1 km': 1000,
  '5 km': 5000,
  '10 km': 10000,
  'Half marathon': 21097.5,
  Marathon: 42195,
} as const;

export type RunDistanceKey = keyof typeof RUN_DISTANCES_M;

/**
 * Best mean power per window from a 1 Hz stream. Missing readings count as 0 W. A stream
 * shorter than the window has no value (null), never zero.
 */
export function bestPowerCurve(
  stream: ReadonlyArray<number | null | undefined>,
  windows: readonly number[] = POWER_WINDOWS_S,
): Record<number, number | null> {
  const prefix = new Float64Array(stream.length + 1);
  for (let i = 0; i < stream.length; i++) {
    const v = stream[i];
    prefix[i + 1] = (prefix[i] as number) + (v === null || v === undefined || Number.isNaN(v) ? 0 : v);
  }
  const out: Record<number, number | null> = {};
  for (const n of windows) {
    if (stream.length < n) {
      out[n] = null;
      continue;
    }
    let best = -Infinity;
    for (let i = 0; i + n <= stream.length; i++) {
      const sum = (prefix[i + n] as number) - (prefix[i] as number);
      if (sum > best) best = sum;
    }
    out[n] = best / n;
  }
  return out;
}

export interface RunBest {
  timeS: number;
  /** Earliest whole-second start that achieves the time. */
  startS: number;
}

/**
 * Best time for `distanceM` from cumulative distance per second (`cumulative[t]` is metres
 * covered at second t, nondecreasing). Starts on whole seconds, ends interpolated. Returns null
 * when the stream never covers the distance.
 */
export function bestRunTime(cumulative: readonly number[], distanceM: number): RunBest | null {
  const n = cumulative.length;
  let best: RunBest | null = null;
  let j = 1;
  for (let i = 0; i < n; i++) {
    const target = (cumulative[i] as number) + distanceM;
    if (j <= i) j = i + 1;
    while (j < n && (cumulative[j] as number) < target) j++;
    if (j >= n) break;
    const d0 = cumulative[j - 1] as number;
    const d1 = cumulative[j] as number;
    const end = d1 === d0 ? j : j - 1 + (target - d0) / (d1 - d0);
    const timeS = end - i;
    if (best === null || timeS < best.timeS - 1e-9) best = { timeS, startS: i };
  }
  return best;
}

/** Best times for every standard run distance; null where the stream is too short. */
export function bestRunCurve(cumulative: readonly number[]): Record<RunDistanceKey, RunBest | null> {
  const out = {} as Record<RunDistanceKey, RunBest | null>;
  for (const key of Object.keys(RUN_DISTANCES_M) as RunDistanceKey[]) {
    out[key] = bestRunTime(cumulative, RUN_DISTANCES_M[key]);
  }
  return out;
}

/**
 * A run with no stream counts for distance D only if its distance is between D and 1.02 D;
 * its time is `timer time * D / distance`.
 */
export function runBestWithoutStream(distanceM: number, timerS: number, targetM: number): number | null {
  if (distanceM < targetM || distanceM > 1.02 * targetM) return null;
  return (timerS * targetM) / distanceM;
}

// ---------- Curves over a period ----------

export type CurvePeriod = 'last28' | 'last84' | 'season' | 'allTime';

/** First day included in a period (the period runs to `today`, inclusive). */
export function periodStartDay(period: CurvePeriod, today: DayOffset, seasonStartDay = 0): DayOffset {
  switch (period) {
    case 'last28':
      return today - 27;
    case 'last84':
      return today - 83;
    case 'season':
      return seasonStartDay;
    case 'allTime':
      return -Infinity;
  }
}

export interface ActivityBests {
  activityId: string;
  day: DayOffset;
  /** Minutes after local midnight; breaks ties on the same day. */
  startMinute: number;
  /** Window or distance key -> best value (watts, or seconds for runs). */
  values: Readonly<Record<string, number | null | undefined>>;
}

export interface CurvePoint {
  value: number;
  activityId: string;
  day: DayOffset;
}

/**
 * For each key, the best value across the period's activities (highest for power, lowest for
 * run times). On a tie the earlier activity wins.
 */
export function buildCurve(
  activities: readonly ActivityBests[],
  keys: readonly string[],
  direction: 'max' | 'min',
  period: CurvePeriod,
  today: DayOffset,
  seasonStartDay = 0,
): Record<string, CurvePoint | null> {
  const first = periodStartDay(period, today, seasonStartDay);
  const inPeriod = activities
    .filter((a) => a.day >= first && a.day <= today)
    .toSorted((a, b) => a.day - b.day || a.startMinute - b.startMinute);
  const out: Record<string, CurvePoint | null> = {};
  for (const key of keys) {
    let best: CurvePoint | null = null;
    for (const a of inPeriod) {
      const v = a.values[key];
      if (v === null || v === undefined) continue;
      if (best === null || (direction === 'max' ? v > best.value : v < best.value)) {
        best = { value: v, activityId: a.activityId, day: a.day };
      }
    }
    out[key] = best;
  }
  return out;
}

/** Best-effort time: m:ss, or h:mm:ss from an hour up, after rounding to whole seconds. */
export function formatEffortTime(seconds: number): string {
  const total = Math.round(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}
