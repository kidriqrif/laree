import type { Sport } from '../../domain/types.ts';
import type { ImportLap, ImportStreams, ImportSummary, RawPoint } from './types.ts';
import { MAX_TIMER_S } from './types.ts';

/** A running stretch of real time, in epoch milliseconds. */
export interface Interval {
  start: number;
  end: number;
}

const EARTH_RADIUS_M = 6_371_008.8;
const HOLD_MS = 10_000;

export function haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLon = (lon2 - lon1) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Splits sorted points into running intervals at gaps of `gapMs` or more, and at any explicit break times. */
export function intervalsFromGaps(points: RawPoint[], gapMs = 20_000, breaks: number[] = []): Interval[] {
  const out: Interval[] = [];
  let cur: Interval | null = null;
  let prev = 0;
  for (const p of points) {
    const broke = cur !== null && breaks.some((b) => b > prev && b <= p.t);
    if (!cur || p.t - prev >= gapMs || broke) {
      cur = { start: p.t, end: p.t };
      out.push(cur);
    } else cur.end = p.t;
    prev = p.t;
  }
  return out;
}

export function intervalsTotalS(intervals: Interval[]): number {
  return intervals.reduce((s, iv) => s + (iv.end - iv.start), 0) / 1000;
}

/** Timer seconds elapsed at a real time (pauses removed). */
export function realToTimer(intervals: Interval[], t: number): number {
  let acc = 0;
  for (const iv of intervals) {
    if (t <= iv.start) return acc / 1000;
    if (t < iv.end) return (acc + (t - iv.start)) / 1000;
    acc += iv.end - iv.start;
  }
  return acc / 1000;
}

function realTimes(intervals: Interval[], n: number): Float64Array {
  const out = new Float64Array(n + 1);
  let k = 0;
  let acc = 0;
  for (let i = 0; i <= n; i++) {
    const sec = i * 1000;
    while (k < intervals.length - 1 && sec >= acc + ((intervals[k] as Interval).end - (intervals[k] as Interval).start)) {
      acc += (intervals[k] as Interval).end - (intervals[k] as Interval).start;
      k++;
    }
    const iv = intervals[k] as Interval;
    out[i] = iv.start + (sec - acc);
  }
  return out;
}

type InstantKey = 'power' | 'hr' | 'cad' | 'speed' | 'temp';

function median(values: number[]): number {
  if (!values.length) return 0;
  const s = values.toSorted((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? (s[m] as number) : ((s[m - 1] as number) + (s[m] as number)) / 2;
}

function interpolate(times: Float64Array, pts: { t: number; v: number }[], out: Float32Array): void {
  let j = 0;
  for (let i = 0; i < out.length; i++) {
    const t = times[i] as number;
    while (j < pts.length - 1 && (pts[j + 1] as { t: number }).t <= t) j++;
    const a = pts[j] as { t: number; v: number };
    const b = pts[j + 1];
    if (t <= a.t || !b) out[i] = a.v;
    else out[i] = a.v + ((b.v - a.v) * (t - a.t)) / (b.t - a.t);
  }
}

/** Builds the 1 Hz streams of io.md section 10.2. Returns null when there is nothing to build. */
export function buildStreams(
  points: RawPoint[],
  intervals: Interval[],
  timerSeconds: number,
  sport: Sport | null,
): ImportStreams | null {
  // The timer value comes from the file. One that is not a number, or is over the limit, builds no
  // per-second arrays at all; parseImportFile then turns the file away as too long. The raw value
  // is checked, as parseImportFile checks it, so a timer just over the limit cannot round under it.
  if (!(timerSeconds <= MAX_TIMER_S)) return null;
  const n = Math.round(timerSeconds);
  if (n <= 0 || intervals.length === 0 || points.length === 0) return null;
  const pts = points.toSorted((a, b) => a.t - b.t);
  const times = realTimes(intervals, n);
  const streams: ImportStreams = { v: 1, n };

  const channels: [InstantKey, 'power' | 'hr' | 'cadence' | 'speed' | 'temperature'][] = [
    ['power', 'power'],
    ['hr', 'hr'],
    ['cad', 'cadence'],
    ['speed', 'speed'],
    ['temp', 'temperature'],
  ];
  for (const [key, name] of channels) {
    if (!pts.some((p) => p[key] !== undefined)) continue;
    const arr = new Float32Array(n);
    let j = 0;
    let lastV = NaN;
    let lastT = -Infinity;
    for (let i = 0; i < n; i++) {
      const t = times[i] as number;
      while (j < pts.length && (pts[j] as RawPoint).t <= t) {
        const v = (pts[j] as RawPoint)[key];
        if (v !== undefined) {
          lastV = v;
          lastT = (pts[j] as RawPoint).t;
        }
        j++;
      }
      arr[i] = t - lastT <= HOLD_MS ? lastV : NaN;
    }
    streams[name] = arr;
  }

  const distPts = pts.filter((p) => p.dist !== undefined).map((p) => ({ t: p.t, v: p.dist as number }));
  if (distPts.length) {
    const d = new Float32Array(n + 1);
    interpolate(times, distPts, d);
    streams.distance = d;
    if (!streams.speed) {
      const s = new Float32Array(n);
      for (let i = 0; i < n; i++) s[i] = Math.max(0, (d[i + 1] as number) - (d[i] as number));
      streams.speed = s;
    }
  }
  const altPts = pts.filter((p) => p.ele !== undefined).map((p) => ({ t: p.t, v: p.ele as number }));
  if (altPts.length) {
    const a = new Float32Array(n + 1);
    interpolate(times, altPts, a);
    streams.altitude = a;
  }

  if (sport === 'run') {
    if (streams.cadence) {
      const vals: number[] = [];
      for (const v of streams.cadence) if (Number.isFinite(v)) vals.push(v);
      if (vals.length && median(vals) < 120) for (let i = 0; i < streams.cadence.length; i++) streams.cadence[i] = (streams.cadence[i] as number) * 2;
    }
    delete streams.power;
  }

  const geo = pts.filter((p) => p.lat !== undefined && p.lon !== undefined);
  if (geo.length) {
    // Keep the first and last points and at most 1,000 in all.
    const k = Math.max(1, Math.ceil((geo.length - 1) / 999));
    const kept = geo.filter((_, idx) => idx % k === 0);
    const last = geo[geo.length - 1] as RawPoint;
    if (kept[kept.length - 1] !== last) kept.push(last);
    const trace = new Float32Array(kept.length * 2);
    kept.forEach((p, idx) => {
      trace[idx * 2] = p.lat as number;
      trace[idx * 2 + 1] = p.lon as number;
    });
    streams.trace = trace;
  }
  return streams;
}

function meanFinite(arr: Float32Array | undefined, from = 0, to = arr?.length ?? 0): number | null {
  if (!arr) return null;
  let sum = 0;
  let count = 0;
  for (let i = from; i < Math.min(to, arr.length); i++) {
    const v = arr[i] as number;
    if (Number.isFinite(v)) {
      sum += v;
      count++;
    }
  }
  return count ? sum / count : null;
}

function maxFinite(arr: Float32Array | undefined): number | null {
  if (!arr) return null;
  let m = -Infinity;
  for (const v of arr) if (Number.isFinite(v) && v > m) m = v;
  return m === -Infinity ? null : m;
}

export function summarise(
  streams: ImportStreams | null,
  sport: Sport | null,
  timerSeconds: number,
  distanceM: number | null,
  setting: string | null = null,
): ImportSummary {
  let moving = timerSeconds;
  if (streams?.speed && setting !== 'pool') {
    const floor = sport === 'bike' ? 1 : 0.5;
    moving = 0;
    for (const v of streams.speed) if (Number.isFinite(v) && v >= floor) moving++;
  }
  return {
    avgHr: meanFinite(streams?.hr),
    maxHr: maxFinite(streams?.hr),
    avgPowerW: meanFinite(streams?.power),
    maxPowerW: maxFinite(streams?.power),
    avgCadence: meanFinite(streams?.cadence),
    avgTempC: meanFinite(streams?.temperature),
    avgSpeedMps: distanceM !== null && timerSeconds > 0 ? distanceM / timerSeconds : null,
    movingSeconds: Math.round(moving),
  };
}

/** One lap over timer seconds [from, to), taken from the streams. */
export function lapFromStreams(streams: ImportStreams | null, from: number, to: number): ImportLap {
  const timerS = Math.max(0, to - from);
  let distanceM: number | null = null;
  if (streams?.distance) {
    const a = streams.distance[Math.min(Math.round(from), streams.distance.length - 1)] as number;
    const b = streams.distance[Math.min(Math.round(to), streams.distance.length - 1)] as number;
    distanceM = b - a;
  }
  return {
    startOffsetS: from,
    timerS,
    distanceM,
    avgHr: meanFinite(streams?.hr, Math.round(from), Math.round(to)),
    avgPowerW: meanFinite(streams?.power, Math.round(from), Math.round(to)),
    avgSpeedMps: distanceM !== null && timerS > 0 ? distanceM / timerS : null,
  };
}

/** Elevation gain with a 3 m threshold, so sensor noise does not add up (io.md section 10.3). */
export function ascentFromAltitudes(alts: ArrayLike<number>): number | null {
  if (!alts.length) return null;
  let ref = alts[0] as number;
  let gain = 0;
  for (let i = 1; i < alts.length; i++) {
    const h = alts[i] as number;
    if (!Number.isFinite(h)) continue;
    if (h - ref >= 3) {
      gain += h - ref;
      ref = h;
    } else if (ref - h >= 3) ref = h;
  }
  return gain;
}
