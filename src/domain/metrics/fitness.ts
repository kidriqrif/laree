/**
 * Fitness, Fatigue, Form and Ramp, the projection and display helpers.
 * See docs/spec/metrics.md sections 4 and 9. Pure functions.
 */
import type { DayOffset } from '../types.ts';

export const FITNESS_DAYS = 42;
export const FATIGUE_DAYS = 7;

export interface FitnessPoint {
  day: DayOffset;
  load: number;
  fitness: number;
  fatigue: number;
  /** Yesterday's Fitness minus yesterday's Fatigue. */
  form: number;
  /** Fitness today minus Fitness 7 days ago. */
  ramp: number;
  /** True for days drawn from planned load rather than completed sessions. */
  projected: boolean;
}

export interface SeriesOptions {
  /** Day offset of the first entry in `loads`. Default 0. */
  firstDay?: DayOffset;
  startFitness?: number;
  startFatigue?: number;
  /** Days from this one onwards are marked projected. */
  projectedFromDay?: DayOffset;
}

/**
 * Compute the series for consecutive daily loads. `loads[i]` is the summed full-precision load
 * of day `firstDay + i`. Fitness(-1) and Fatigue(-1) are the starting values.
 */
export function fitnessSeries(loads: readonly number[], options: SeriesOptions = {}): FitnessPoint[] {
  const firstDay = options.firstDay ?? 0;
  const startFitness = options.startFitness ?? 0;
  const startFatigue = options.startFatigue ?? 0;
  const out: FitnessPoint[] = [];
  let fitness = startFitness;
  let fatigue = startFatigue;
  for (let i = 0; i < loads.length; i++) {
    const load = loads[i] ?? 0;
    const form = fitness - fatigue;
    fitness += (load - fitness) / FITNESS_DAYS;
    fatigue += (load - fatigue) / FATIGUE_DAYS;
    const weekAgo = i >= 7 ? (out[i - 7] as FitnessPoint).fitness : startFitness;
    const day = firstDay + i;
    out.push({
      day,
      load,
      fitness,
      fatigue,
      form,
      ramp: fitness - weekAgo,
      projected: options.projectedFromDay !== undefined && day >= options.projectedFromDay,
    });
  }
  return out;
}

/**
 * Recompute a series from the earliest affected day, keeping earlier points as they are.
 * `loads` is the full new load array (same firstDay as `previous`).
 */
export function recomputeFrom(
  previous: readonly FitnessPoint[],
  loads: readonly number[],
  fromDay: DayOffset,
  options: SeriesOptions = {},
): FitnessPoint[] {
  const firstDay = options.firstDay ?? 0;
  const startIdx = Math.max(0, Math.min(fromDay - firstDay, previous.length, loads.length));
  if (startIdx === 0) return fitnessSeries(loads, options);
  const full = fitnessSeries(loads, options);
  return [...previous.slice(0, startIdx), ...full.slice(startIdx)];
}

/** Sum loads per day. Days with no entries are 0. Items outside the range are ignored. */
export function dailyLoads(
  items: readonly { day: DayOffset; load: number }[],
  firstDay: DayOffset,
  lastDay: DayOffset,
): number[] {
  const out = Array.from({ length: Math.max(0, lastDay - firstDay + 1) }, () => 0);
  for (const it of items) {
    const i = it.day - firstDay;
    if (i >= 0 && i < out.length) out[i] = (out[i] as number) + it.load;
  }
  return out;
}

export interface ProjectionInput {
  firstDay: DayOffset;
  today: DayOffset;
  /** Completed activities with full-precision load. */
  actual: readonly { day: DayOffset; load: number }[];
  /** All planned workouts; `matched` marks ones already completed. */
  planned: readonly { day: DayOffset; plannedLoad: number; matched?: boolean }[];
  startFitness?: number;
  startFatigue?: number;
}

/**
 * Daily loads for the chart: actual before today, completed plus open planned load today,
 * planned load on later days up to the last planned day. Nothing is drawn beyond that.
 */
export function projectedLoads(input: ProjectionInput): number[] {
  const { firstDay, today } = input;
  const lastPlanned = input.planned.reduce((m, p) => Math.max(m, p.day), today);
  const lastDay = Math.max(today, lastPlanned);
  const loads = dailyLoads(input.actual, firstDay, lastDay);
  for (let d = today; d <= lastDay; d++) {
    const i = d - firstDay;
    if (i < 0) continue;
    if (d > today) loads[i] = 0;
    for (const p of input.planned) {
      if (p.day === d && !(d === today && p.matched)) loads[i] = (loads[i] as number) + p.plannedLoad;
    }
  }
  // Days after today carry no actuals: replace, not add.
  return loads;
}

/** Full chart series with the projection marked from tomorrow on. */
export function projectedSeries(input: ProjectionInput): FitnessPoint[] {
  const opts: SeriesOptions = { firstDay: input.firstDay, projectedFromDay: input.today + 1 };
  if (input.startFitness !== undefined) opts.startFitness = input.startFitness;
  if (input.startFatigue !== undefined) opts.startFatigue = input.startFatigue;
  return fitnessSeries(projectedLoads(input), opts);
}

// ---------------------------------------------------------------- display (section 9)

/** Round half away from zero. */
export function roundHalfAway(x: number, dp = 0): number {
  const f = 10 ** dp;
  const r = (Math.sign(x) * Math.round(Math.abs(x) * f)) / f;
  return r === 0 ? 0 : r;
}

const MINUS = '−';

const numberFormat = (dp: number) =>
  new Intl.NumberFormat('en-MY', { minimumFractionDigits: dp, maximumFractionDigits: dp });

/** Whole number with thousands separators: Load, Fitness, Fatigue. */
export function formatWhole(x: number): string {
  return numberFormat(0).format(roundHalfAway(x, 0));
}

/** Signed value: "+" before positives, U+2212 before negatives, plain "0" for zero. */
function signed(x: number, dp: number): string {
  const r = roundHalfAway(x, dp);
  if (r === 0) return '0';
  const body = numberFormat(dp).format(Math.abs(r));
  return r > 0 ? `+${body}` : `${MINUS}${body}`;
}

/** Form: signed whole number. */
export function formatForm(x: number): string {
  return signed(x, 0);
}

/** Ramp: signed, one decimal place. */
export function formatRamp(x: number): string {
  return signed(x, 1);
}

/** Load: whole number. */
export function formatLoad(x: number): string {
  return formatWhole(x);
}

export type FormBand = 'overreaching' | 'building' | 'steady' | 'fresh' | 'detraining';

/** Form band from the displayed (rounded half away from zero) Form value (section 5). */
export function formBand(form: number): FormBand {
  const v = roundHalfAway(form, 0);
  if (v < -30) return 'overreaching';
  if (v < -10) return 'building';
  if (v <= 5) return 'steady';
  if (v <= 25) return 'fresh';
  return 'detraining';
}
