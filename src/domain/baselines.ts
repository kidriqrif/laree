/**
 * Personal baselines for HRV and resting heart rate.
 * See docs/spec/checkins-flags.md section "Baselines". Pure functions.
 */
import type { Baselines } from './types.ts';

export const BASELINE_DAYS = 28;
export const BASELINE_MIN_READINGS = 7;

export interface Baseline {
  mean: number;
  sd: number;
  /** Readings used, at least 7. */
  n: number;
  /** e - 28 */
  fromDay: number;
  /** e - 1 */
  toDay: number;
}

export interface Reading {
  day: number;
  value: number;
  unwell: boolean;
}

/** The days e-28 to e-1, leaving out ill-or-injured days. Null with fewer than 7 readings. */
export function baseline(readings: readonly Reading[], e: number): Baseline | null {
  const used = usedReadings(readings, e);
  const n = used.length;
  if (n < BASELINE_MIN_READINGS) return null;
  const mean = used.reduce((s, v) => s + v, 0) / n;
  const variance = used.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1);
  return { mean, sd: Math.sqrt(variance), n, fromDay: e - BASELINE_DAYS, toDay: e - 1 };
}

function usedReadings(readings: readonly Reading[], e: number): number[] {
  const out: number[] = [];
  for (const r of readings) {
    if (r.unwell) continue;
    if (r.day < e - BASELINE_DAYS || r.day > e - 1) continue;
    out.push(r.value);
  }
  return out;
}

/** For the UI line "Not enough readings yet: 5 of 7". Null once a baseline exists. */
export function baselineShortfall(readings: readonly Reading[], e: number): string | null {
  const n = usedReadings(readings, e).length;
  return n >= BASELINE_MIN_READINGS ? null : `Not enough readings yet: ${n} of ${BASELINE_MIN_READINGS}`;
}

/** Minimal check-in shape the baselines need; the full CheckIn types satisfy it. */
export interface BaselineCheckIn {
  day: number;
  hrvMs?: number | null | undefined;
  restingHr?: number | null | undefined;
  unwell?: unknown;
}

export type BaselineMetric = 'hrvMs' | 'restingHr';

export function readingsOf(checkIns: readonly BaselineCheckIn[], metric: BaselineMetric): Reading[] {
  const out: Reading[] = [];
  for (const c of checkIns) {
    const v = c[metric];
    if (v === null || v === undefined) continue;
    out.push({ day: c.day, value: v, unwell: Boolean(c.unwell) });
  }
  return out;
}

export function baselineFromCheckIns(
  checkIns: readonly BaselineCheckIn[],
  metric: BaselineMetric,
  e: number,
): Baseline | null {
  return baseline(readingsOf(checkIns, metric), e);
}

export interface DisplayBaseline {
  mean: number;
  /** Null when only the stored baseline is known. */
  sd: number | null;
  n: number;
  source: 'history' | 'stored';
}

/** For display: history when there is enough, else the athlete's stored baseline. */
export function baselineOrStored(
  checkIns: readonly BaselineCheckIn[],
  metric: BaselineMetric,
  e: number,
  stored: Baselines,
): DisplayBaseline {
  const b = baselineFromCheckIns(checkIns, metric, e);
  if (b) return { mean: b.mean, sd: b.sd, n: b.n, source: 'history' };
  const mean = metric === 'hrvMs' ? stored.hrvMs : stored.restingHr;
  return { mean, sd: null, n: 0, source: 'stored' };
}

/** "Most days" range: mean plus or minus one SD, whole numbers. */
export function usualRange(b: { mean: number; sd: number | null }): { low: number; high: number } {
  const sd = b.sd ?? 0;
  return { low: Math.round(b.mean - sd), high: Math.round(b.mean + sd) };
}

/** "Usual HRV 72 ms (most days 66 to 78)". */
export function usualLabel(metric: BaselineMetric, b: { mean: number; sd: number | null }): string {
  const name = metric === 'hrvMs' ? 'HRV' : 'resting HR';
  const unit = metric === 'hrvMs' ? 'ms' : 'bpm';
  const head = `Usual ${name} ${Math.round(b.mean)} ${unit}`;
  if (b.sd === null) return head;
  const r = usualRange(b);
  return `${head} (most days ${r.low} to ${r.high})`;
}
