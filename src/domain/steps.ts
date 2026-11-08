/** Step helpers: resolving percentage targets to numbers and workout totals. Pure. */
import type { LoadThresholds } from './metrics/load.ts';
import { plannedLoad } from './metrics/load.ts';
import type { Sport, Step, StepTarget } from './types.ts';

export type ResolvedTarget =
  | { kind: 'power'; low: number; high: number; unit: 'W' }
  /** Seconds per km; low is the faster (smaller) end. */
  | { kind: 'pace'; low: number; high: number; unit: 's/km' }
  /** Seconds per 100 m; low is the faster end. */
  | { kind: 'swimPace'; low: number; high: number; unit: 's/100m' }
  | { kind: 'heartRate'; low: number; high: number; unit: 'bpm' }
  | { kind: 'effort'; low: number; high: number; unit: 'RPE' };

// Multiply before dividing so a product that lands on .5 rounds up (spec 1.5).
const of = (threshold: number, pct: number) => Math.round((threshold * pct) / 100);
const per = (threshold: number, pct: number) => Math.round((threshold * 100) / pct);

/** Turns a step target into numbers for an athlete's thresholds, or null if the threshold is missing. */
export function resolveTarget(target: StepTarget, th: LoadThresholds): ResolvedTarget | null {
  const lo = target.low / 100;
  const hi = target.high / 100;
  switch (target.kind) {
    case 'pctFtp':
      if (!th.ftp) return null;
      return { kind: 'power', low: of(th.ftp, target.low), high: of(th.ftp, target.high), unit: 'W' };
    case 'pctLthr':
      if (!th.lthr) return null;
      return { kind: 'heartRate', low: of(th.lthr, target.low), high: of(th.lthr, target.high), unit: 'bpm' };
    case 'pctThresholdPace':
      if (!th.thresholdPaceSPerKm || lo <= 0 || hi <= 0) return null;
      return {
        kind: 'pace',
        low: per(th.thresholdPaceSPerKm, target.high),
        high: per(th.thresholdPaceSPerKm, target.low),
        unit: 's/km',
      };
    case 'pctCss':
      if (!th.cssSPer100m || lo <= 0 || hi <= 0) return null;
      return {
        kind: 'swimPace',
        low: per(th.cssSPer100m, target.high),
        high: per(th.cssSPer100m, target.low),
        unit: 's/100m',
      };
    case 'rpe':
      return { kind: 'effort', low: target.low, high: target.high, unit: 'RPE' };
  }
}

/** Seconds to "m:ss". */
export function formatPace(seconds: number): string {
  const s = Math.round(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export interface WorkoutTotals {
  durationS: number;
  distanceM?: number;
  load: number;
}

/** Duration, distance and planned load from steps, repeat blocks included. */
export function workoutTotals(
  steps: Step[],
  sport: Sport,
  thresholds: LoadThresholds,
  fallback: { plannedDurationS?: number; plannedDistanceM?: number } = {},
): WorkoutTotals {
  const r = plannedLoad({ sport, steps, thresholds, ...fallback });
  const out: WorkoutTotals = { durationS: r.durationS, load: r.load };
  if (r.distanceM !== undefined) out.distanceM = r.distanceM;
  return out;
}
