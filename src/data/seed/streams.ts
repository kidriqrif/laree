/**
 * Detailed streams for a seeded activity, generated on demand from its summary and the
 * workout it matched. Deterministic: the same activity always gives the same arrays.
 * One sample per timer second.
 */
import type { Activity, PlainStep, PlannedWorkout } from '../../domain/types.ts';
import { gauss, rngFor } from './rng.ts';
import type { Rng } from './rng.ts';

export interface ActivityStream {
  activityId: string;
  /** Number of timer seconds; every per-second array has this length. */
  seconds: number;
  powerW?: number[];
  hrBpm: number[];
  /** Metres per second. */
  speedMps?: number[];
  /** Steps per minute (run) or revolutions per minute (bike). */
  cadence?: number[];
  /** Metres. n + 1 readings. */
  altitudeM?: number[];
  /** Cumulative metres. n + 1 readings. */
  distanceM?: number[];
}

/** Relative effort per second from the planned steps (mean 1), or a gentle wave. */
function profile(n: number, planned: PlannedWorkout | undefined, rng: Rng): number[] {
  const segments: Array<{ weight: number; level: number }> = [];
  const visit = (s: PlannedWorkout['steps'][number]): void => {
    if (s.kind === 'repeat') {
      for (let r = 0; r < s.repeat; r++) s.steps.forEach(visit);
      return;
    }
    const plain: PlainStep = s;
    const mid = plain.target ? (plain.target.low + plain.target.high) / 2 : 0;
    const level = plain.target?.kind === 'rpe' ? 0.5 + mid / 20 : mid > 0 ? mid / 100 : 0.6;
    segments.push({ weight: plain.durationS ?? (plain.distanceM ?? 600) / 1.2, level });
  };
  planned?.steps.forEach(visit);

  const out = Array.from({ length: n }, () => 1);
  if (segments.length > 0) {
    const total = segments.reduce((a, s) => a + s.weight, 0);
    let t = 0;
    for (const seg of segments) {
      const end = Math.min(n, t + Math.round((seg.weight / total) * n));
      for (let i = t; i < end; i++) out[i] = seg.level;
      t = end;
    }
    for (let i = t; i < n; i++) out[i] = segments[segments.length - 1]?.level ?? 1;
  } else {
    const phase = rng() * Math.PI * 2;
    for (let i = 0; i < n; i++) out[i] = 1 + 0.06 * Math.sin(i / 240 + phase);
  }
  return normalise(smooth(out, 8), 1);
}

/** Scale so the mean equals `mean`. */
function normalise(values: number[], mean: number): number[] {
  const m = values.reduce((a, b) => a + b, 0) / Math.max(1, values.length);
  const k = m > 0 ? mean / m : 1;
  return values.map((v) => v * k);
}

/** Simple moving-average smoothing with a window of 2 * radius + 1. */
function smooth(values: number[], radius: number): number[] {
  const n = values.length;
  const prefix = Array.from({ length: n + 1 }, () => 0);
  for (let i = 0; i < n; i++) prefix[i + 1] = (prefix[i] as number) + (values[i] as number);
  return values.map((_, i) => {
    const a = Math.max(0, i - radius);
    const b = Math.min(n, i + radius + 1);
    return ((prefix[b] as number) - (prefix[a] as number)) / (b - a);
  });
}

/** First-order lag, so heart rate follows effort with a delay. */
function lag(values: number[], seconds: number, start: number): number[] {
  const out: number[] = [];
  let y = start;
  const k = 1 / seconds;
  for (const v of values) {
    y += (v - y) * k;
    out.push(y);
  }
  return out;
}

function noise(n: number, rng: Rng, amount: number): number[] {
  return smooth(
    Array.from({ length: n }, () => gauss(rng)),
    3,
  ).map((v) => 1 + amount * v * 2.2);
}

function altitudeFrom(n: number, gainM: number, rng: Rng): number[] {
  const waves = [0, 1, 2].map(() => ({ period: 400 + rng() * 1200, phase: rng() * Math.PI * 2, size: 0.5 + rng() }));
  const raw: number[] = [];
  for (let i = 0; i <= n; i++) {
    raw.push(waves.reduce((a, w) => a + w.size * Math.sin(i / w.period + w.phase), 0));
  }
  let up = 0;
  for (let i = 1; i < raw.length; i++) up += Math.max(0, (raw[i] as number) - (raw[i - 1] as number));
  const k = up > 0 ? gainM / up : 0;
  const base = 20 + rng() * 60;
  return raw.map((v) => Math.round((base + v * k) * 10) / 10);
}

function cumulative(speed: number[], totalM: number | undefined): number[] {
  const raw: number[] = [0];
  for (const v of speed) raw.push((raw[raw.length - 1] as number) + v);
  const end = raw[raw.length - 1] as number;
  const k = totalM !== undefined && end > 0 ? totalM / end : 1;
  return raw.map((v) => Math.round(v * k * 10) / 10);
}

export function streamOf(activity: Activity, planned: PlannedWorkout | undefined): ActivityStream {
  const n = Math.max(1, Math.round(activity.summary.durationS));
  const rng = rngFor('stream', activity.id);
  const s = activity.summary;
  const level = profile(n, planned, rng);
  const avgHr = s.avgHr ?? 130;
  const hrTarget = level.map((l) => avgHr * (0.82 + 0.18 * l));
  const hrBpm = lag(hrTarget, 45, avgHr * 0.7).map((v, i) => Math.round(v + (i % 7 === 0 ? gauss(rng) : 0)));
  const out: ActivityStream = { activityId: activity.id, seconds: n, hrBpm };

  if (activity.sport === 'bike') {
    const avgP = s.avgPowerW ?? 180;
    const shape = noise(n, rng, 0.05);
    const power = normalise(
      level.map((l, i) => l * (shape[i] as number)),
      avgP,
    ).map((v) => Math.max(0, Math.round(v)));
    // A few coasting moments.
    for (let k = 0; k < Math.floor(n / 900); k++) {
      const at = Math.floor(rng() * n);
      for (let i = at; i < Math.min(n, at + 4 + Math.floor(rng() * 6)); i++) power[i] = 0;
    }
    out.powerW = power;
    const speed = normalise(
      level.map((l, i) => l ** 0.35 * (shape[i] as number)),
      s.avgSpeedMps ?? 8,
    ).map((v) => Math.round(v * 100) / 100);
    out.speedMps = speed;
    out.distanceM = cumulative(speed, s.distanceM);
    out.cadence = power.map((p) => (p === 0 ? 0 : Math.round((s.cadence ?? 88) + gauss(rng) * 4)));
    out.altitudeM = altitudeFrom(n, s.elevationGainM ?? 0, rng);
  } else if (activity.sport === 'run') {
    const shape = noise(n, rng, 0.025);
    const speed = normalise(
      level.map((l, i) => l * (shape[i] as number)),
      s.avgSpeedMps ?? 3.2,
    ).map((v) => Math.round(v * 100) / 100);
    out.speedMps = speed;
    out.distanceM = cumulative(speed, s.distanceM);
    out.cadence = speed.map(() => Math.round((s.cadence ?? 172) + gauss(rng) * 2));
    out.altitudeM = altitudeFrom(n, s.elevationGainM ?? 0, rng);
  } else if (activity.sport === 'swim') {
    const speed = normalise(
      level.map((l) => l * (1 + gauss(rng) * 0.03)),
      s.avgSpeedMps ?? 0.9,
    ).map((v) => Math.round(v * 1000) / 1000);
    out.speedMps = speed;
    out.distanceM = cumulative(speed, s.distanceM);
  } else {
    // Strength: sets of work and rest.
    for (let i = 0; i < n; i++) {
      const inSet = Math.floor(i / 90) % 2 === 0;
      out.hrBpm[i] = Math.round(avgHr + (inSet ? 8 : -8) + gauss(rng) * 2);
    }
  }
  return out;
}
