/** Thin, NaN-safe wrappers over d3-scale and d3-array for the chart kit. */
import { scaleBand, scaleLinear } from 'd3-scale';
import type { ScaleBand, ScaleLinear } from 'd3-scale';
import { ticks as d3ticks } from 'd3-array';

export interface Box {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export const margin = (m: Partial<Box> = {}): Box => ({ top: 4, right: 4, bottom: 4, left: 4, ...m });

/** Largest finite value, or `fallback` when there is none. */
export function maxOf(values: readonly (number | null | undefined)[], fallback = 1): number {
  let m = -Infinity;
  for (const v of values) if (v != null && Number.isFinite(v) && v > m) m = v;
  return m === -Infinity ? fallback : m;
}

export function minOf(values: readonly (number | null | undefined)[], fallback = 0): number {
  let m = Infinity;
  for (const v of values) if (v != null && Number.isFinite(v) && v < m) m = v;
  return m === Infinity ? fallback : m;
}

/** A linear scale whose domain can never be degenerate or NaN. */
export function linear(
  domain: readonly [number, number],
  range: readonly [number, number],
): ScaleLinear<number, number> {
  let [a, b] = domain;
  if (!Number.isFinite(a)) a = 0;
  if (!Number.isFinite(b)) b = a + 1;
  if (a === b) b = a + 1;
  return scaleLinear().domain([a, b]).range([range[0], range[1]]);
}

/** Maps a value, returning the range start for anything non-finite. */
export function at(scale: ScaleLinear<number, number>, v: number | null | undefined): number {
  const out = v == null ? NaN : scale(v);
  return Number.isFinite(out) ? out : (scale.range()[0] ?? 0);
}

export function band(
  keys: readonly string[],
  range: readonly [number, number],
  padding = 0.15,
): ScaleBand<string> {
  return scaleBand<string>()
    .domain([...keys])
    .range([range[0], Math.max(range[0], range[1])])
    .paddingInner(padding)
    .paddingOuter(0);
}

/** About `count` round tick values between min and max. */
export function niceTicks(min: number, max: number, count = 4): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) return [min];
  return d3ticks(min, max, count);
}

/** A round upper bound for a value axis starting at 0. */
export function niceMax(max: number, count = 4): number {
  const t = niceTicks(0, Math.max(max, 1), count);
  const top = t[t.length - 1] ?? max;
  const step = t.length > 1 ? (t[1] ?? 1) - (t[0] ?? 0) : 1;
  return top >= max ? top : top + step;
}

/** Keeps every nth item so that at most `max` remain. */
export function thin<T>(items: readonly T[], max: number): { item: T; index: number }[] {
  const step = Math.max(1, Math.ceil(items.length / Math.max(1, max)));
  const out: { item: T; index: number }[] = [];
  items.forEach((item, index) => {
    if (index % step === 0) out.push({ item, index });
  });
  return out;
}
