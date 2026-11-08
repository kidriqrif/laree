/**
 * Session load and planned load. Pure functions; see docs/spec/metrics.md sections 2 and 3.
 * Thresholds here use the spec's units (threshold pace in s/km, CSS in s/100 m) because that
 * is how coaches enter them; streams and results use SI units.
 */
import type { Confidence, LoadMethod, LoadResult, Sport, Step, StepTargetKind } from '../types.ts';

/** Thresholds in force on the activity's day. A missing value makes that method fail. */
export interface LoadThresholds {
  /** Watts. */
  ftp?: number;
  /** Seconds per kilometre. */
  thresholdPaceSPerKm?: number;
  /** Seconds per 100 m. */
  cssSPer100m?: number;
  lthr?: number;
  restingHr?: number;
}

/** null, undefined and NaN mean a missing reading. */
export type Reading = number | null | undefined;

export interface LoadStreams {
  /** One entry per timer second. */
  powerW?: Reading[];
  /** One entry per timer second. */
  hrBpm?: Reading[];
  /** Cumulative distance in metres, n + 1 readings for n timer seconds. */
  distanceM?: Reading[];
  /** Altitude in metres, n + 1 readings. */
  altitudeM?: Reading[];
}

export interface LoadSummary {
  weightedPowerW?: number;
  distanceM?: number;
  /** Graded distance stored by an importer. */
  gradedDistanceM?: number;
}

export interface LoadInput {
  sport: Sport;
  /** Timer time in seconds (paused time removed). */
  timerS: number;
  thresholds: LoadThresholds;
  streams?: LoadStreams;
  summary?: LoadSummary;
  /** 0 to 10. */
  rpe?: number;
  treadmill?: boolean;
  openWater?: boolean;
}

const MAX_POWER = 2500;
const MIN_HR = 30;
const MAX_HR = 230;
const MAX_RUN_SPEED = 12;
const COVERAGE = 0.8;
const MAX_PLAUSIBLE_INTENSITY = 1.5;
const EFFORT_K = 5 / 21;

export const DEFAULT_INTENSITY: Record<Sport, number> = {
  run: 0.75,
  bike: 0.65,
  swim: 0.75,
  strength: 0.6,
  other: 0.5,
};

function isNum(x: Reading): x is number {
  return typeof x === 'number' && Number.isFinite(x);
}

/** Power below 0 or above 2,500 W becomes missing. */
export function cleanPower(stream: Reading[]): (number | null)[] {
  return stream.map((p) => (isNum(p) && p >= 0 && p <= MAX_POWER ? p : null));
}

/** Heart rate below 30 or above 230 bpm becomes missing. */
export function cleanHr(stream: Reading[]): (number | null)[] {
  return stream.map((h) => (isNum(h) && h >= MIN_HR && h <= MAX_HR ? h : null));
}

/**
 * Cumulative distance: a reading implying more than 12 m/s since the last good one (or going
 * backwards) becomes missing; gaps are filled by linear interpolation. Leading or trailing
 * gaps repeat the nearest reading.
 */
export function cleanDistance(stream: Reading[]): number[] {
  const kept: (number | null)[] = [];
  let lastIdx = -1;
  let lastVal = 0;
  for (let i = 0; i < stream.length; i++) {
    const d = stream[i];
    if (!isNum(d)) {
      kept.push(null);
      continue;
    }
    if (lastIdx >= 0 && (d < lastVal || (d - lastVal) / (i - lastIdx) > MAX_RUN_SPEED)) {
      kept.push(null);
      continue;
    }
    kept.push(d);
    lastIdx = i;
    lastVal = d;
  }
  const out: number[] = Array.from({ length: kept.length }, () => 0);
  let prevI = -1;
  for (let i = 0; i < kept.length; i++) {
    const v = kept[i];
    if (v === null || v === undefined) continue;
    if (prevI === -1) {
      for (let k = 0; k < i; k++) out[k] = v;
    } else {
      const a = kept[prevI] as number;
      for (let k = prevI + 1; k < i; k++) out[k] = a + ((v - a) * (k - prevI)) / (i - prevI);
    }
    out[i] = v;
    prevI = i;
  }
  if (prevI >= 0) {
    const tail = kept[prevI] as number;
    for (let k = prevI + 1; k < kept.length; k++) out[k] = tail;
  }
  return out;
}

function coverage(stream: (number | null)[], timerS: number): number {
  let count = 0;
  for (const v of stream) if (v !== null) count++;
  return timerS > 0 ? count / timerS : 0;
}

/** Weighted power from a cleaned 1 Hz stream; missing counts as 0 W. Null under 30 samples. */
export function weightedPowerFromStream(stream: (number | null)[]): number | null {
  const n = stream.length;
  if (n < 30) return null;
  let window = 0;
  for (let i = 0; i < 30; i++) window += stream[i] ?? 0;
  let sum4 = 0;
  let count = 0;
  for (let i = 29; i < n; i++) {
    if (i > 29) window += (stream[i] ?? 0) - (stream[i - 30] ?? 0);
    const m = window / 30;
    sum4 += m ** 4;
    count++;
  }
  return (sum4 / count) ** 0.25;
}

/** Grade factor f(g) = C(g) / 3.6, with g (a fraction) clamped to +-0.45. */
export function gradeFactor(g: number): number {
  const x = Math.max(-0.45, Math.min(0.45, g));
  const cost = 155.4 * x ** 5 - 30.4 * x ** 4 - 43.3 * x ** 3 + 46.3 * x ** 2 + 19.5 * x + 3.6;
  return cost / 3.6;
}

/**
 * Graded distance in metres from cleaned cumulative distance and altitude (n + 1 readings).
 * The gradient at second t uses the latest earlier reading at least 50 m behind.
 */
export function gradedDistance(distanceM: number[], altitudeM: number[] | null): number {
  const n = distanceM.length - 1;
  let total = 0;
  let j = 0;
  for (let t = 1; t <= n; t++) {
    const dt = distanceM[t] as number;
    let g = 0;
    if (altitudeM) {
      while (j + 1 < t && dt - (distanceM[j + 1] as number) >= 50) j++;
      const dj = distanceM[j] as number;
      if (dt - dj >= 50) g = ((altitudeM[t] as number) - (altitudeM[j] as number)) / (dt - dj);
    }
    total += (dt - (distanceM[t - 1] as number)) * gradeFactor(g);
  }
  return total;
}

function result(
  load: number,
  method: LoadMethod,
  confidence: Confidence,
  intensity: number | null,
  extra: Partial<LoadResult> = {},
): LoadResult {
  return { load, method, confidence, intensity, ...extra };
}

function powerMethod(input: LoadInput): LoadResult | null {
  const ftp = input.thresholds.ftp;
  if (input.sport !== 'bike' || !ftp || ftp <= 0) return null;
  let wp: number | null = null;
  const raw = input.streams?.powerW;
  if (raw) {
    const clean = cleanPower(raw);
    if (coverage(clean, input.timerS) < COVERAGE) return null;
    wp = weightedPowerFromStream(clean);
  } else if (input.summary?.weightedPowerW !== undefined) {
    wp = input.summary.weightedPowerW;
  }
  if (wp === null || !(wp > 0)) return null;
  const intensity = wp / ftp;
  const load = (input.timerS / 3600) * intensity ** 2 * 100;
  return result(load, 'power', 'high', intensity, { weightedPowerW: wp });
}

function paceMethod(input: LoadInput): LoadResult | null {
  const tp = input.thresholds.thresholdPaceSPerKm;
  if (input.sport !== 'run' || !tp || tp <= 0) return null;
  const vt = 1000 / tp;
  let distance: number;
  let graded: number;
  let confidence: Confidence;
  const dRaw = input.streams?.distanceM;
  if (dRaw && dRaw.length > 1) {
    const d = cleanDistance(dRaw);
    const aRaw = input.streams?.altitudeM;
    const hasAlt = !!aRaw && aRaw.length === d.length && aRaw.every(isNum);
    distance = (d[d.length - 1] as number) - (d[0] as number);
    graded = gradedDistance(d, hasAlt ? (aRaw as number[]) : null);
    confidence = hasAlt || input.treadmill ? 'high' : 'medium';
  } else {
    const s = input.summary;
    if (s?.gradedDistanceM !== undefined) {
      distance = s.distanceM ?? s.gradedDistanceM;
      graded = s.gradedDistanceM;
      confidence = 'high';
    } else if (s?.distanceM !== undefined) {
      distance = s.distanceM;
      graded = s.distanceM;
      confidence = input.treadmill ? 'high' : 'medium';
    } else return null;
  }
  if (distance < 100) return null;
  const vg = graded / input.timerS;
  const intensity = vg / vt;
  if (intensity > MAX_PLAUSIBLE_INTENSITY) return null;
  return result((input.timerS / 3600) * intensity ** 2 * 100, 'pace', confidence, intensity, {
    gradedSpeedMps: vg,
  });
}

function swimMethod(input: LoadInput): LoadResult | null {
  const css = input.thresholds.cssSPer100m;
  const distance = input.summary?.distanceM;
  if (input.sport !== 'swim' || !css || css <= 0 || distance === undefined) return null;
  if (distance < 25) return null;
  const intensity = distance / input.timerS / (100 / css);
  if (intensity > MAX_PLAUSIBLE_INTENSITY) return null;
  const confidence: Confidence = input.openWater ? 'low' : 'medium';
  return result((input.timerS / 3600) * intensity ** 3 * 100, 'swim', confidence, intensity);
}

/** Heart-rate impulse with b = 1: w(r) = r * e^(r - 1). */
export function hrWeight(r: number): number {
  return r * Math.exp(r - 1);
}

function heartRateMethod(input: LoadInput): LoadResult | null {
  const { lthr, restingHr } = input.thresholds;
  const raw = input.streams?.hrBpm;
  if (!raw || lthr === undefined || restingHr === undefined || lthr - restingHr < 20) return null;
  const clean = cleanHr(raw);
  if (coverage(clean, input.timerS) < COVERAGE) return null;
  let sum = 0;
  let count = 0;
  for (const hr of clean) {
    if (hr === null) continue;
    sum += hrWeight(Math.max(0, (hr - restingHr) / (lthr - restingHr)));
    count++;
  }
  return result((100 / 3600) * sum * (input.timerS / count), 'heartRate', 'medium', null);
}

function effortMethod(input: LoadInput): LoadResult | null {
  const rpe = input.rpe;
  if (rpe === undefined || !Number.isFinite(rpe) || rpe < 0 || rpe > 10) return null;
  return result((input.timerS / 60) * rpe * EFFORT_K, 'effort', 'medium', null);
}

function durationMethod(input: LoadInput): LoadResult {
  const i = DEFAULT_INTENSITY[input.sport];
  return result((input.timerS / 3600) * i * i * 100, 'duration', 'low', null);
}

const finite = (r: LoadResult | null): LoadResult | null => (r && Number.isFinite(r.load) ? r : null);

/** Session load: the first method with data wins. */
export function sessionLoad(input: LoadInput): LoadResult {
  if (!Number.isFinite(input.timerS) || input.timerS < 60) return result(0, 'duration', 'low', null);
  // A method that comes out non-finite (garbage input) counts as having no data.
  return (
    finite(powerMethod(input)) ??
    finite(paceMethod(input)) ??
    finite(swimMethod(input)) ??
    finite(heartRateMethod(input)) ??
    finite(effortMethod(input)) ??
    durationMethod(input)
  );
}

// ---------------------------------------------------------------- planned load

export type PlanBasis = 'power' | 'pace' | 'swim' | 'heartRate' | 'effort';
export type LoadSource = 'steps' | 'default';

export interface PlannedLoadInput {
  sport: Sport;
  steps: Step[];
  thresholds: LoadThresholds;
  /** Used when the workout has no steps. */
  plannedDurationS?: number;
  plannedDistanceM?: number;
}

export interface PlannedLoadResult {
  load: number;
  durationS: number;
  /** Undefined when not known (for example time steps on a power basis). */
  distanceM?: number;
  loadSource: LoadSource;
  basis: PlanBasis | null;
}

const BASIS_OF: Record<StepTargetKind, PlanBasis> = {
  pctFtp: 'power',
  pctThresholdPace: 'pace',
  pctCss: 'swim',
  pctLthr: 'heartRate',
  rpe: 'effort',
};

const STEP_DEFAULTS: Record<string, Record<PlanBasis, number>> = {
  warmup: { power: 60, pace: 60, swim: 75, heartRate: 75, effort: 3 },
  steady: { power: 70, pace: 70, swim: 85, heartRate: 85, effort: 4 },
  interval: { power: 95, pace: 95, swim: 100, heartRate: 97, effort: 7 },
  recovery: { power: 50, pace: 50, swim: 70, heartRate: 70, effort: 2 },
  cooldown: { power: 55, pace: 55, swim: 70, heartRate: 72, effort: 2 },
};

interface FlatStep {
  kind: string;
  durationS?: number;
  distanceM?: number;
  mid: number | null;
  basis: PlanBasis | null;
}

type PlainLike = Exclude<Step, { kind: 'repeat' }>;

function toFlat(s: PlainLike): FlatStep {
  const out: FlatStep = {
    kind: s.kind,
    mid: s.target ? (s.target.low + s.target.high) / 2 : null,
    basis: s.target ? BASIS_OF[s.target.kind] : null,
  };
  if (s.durationS !== undefined) out.durationS = s.durationS;
  if (s.distanceM !== undefined) out.distanceM = s.distanceM;
  return out;
}

function expandSteps(steps: Step[]): FlatStep[] {
  const flat: FlatStep[] = [];
  for (const s of steps) {
    if (s.kind === 'repeat') {
      for (let r = 0; r < s.repeat; r++) for (const c of s.steps) flat.push(toFlat(c));
    } else flat.push(toFlat(s));
  }
  return flat;
}

/** Duration-only load for a workout with no targets (section 3.2 last paragraph). */
function defaultLoad(
  sport: Sport,
  th: LoadThresholds,
  durationS: number,
  distanceM: number,
): { load: number; durationS: number } {
  let t = durationS;
  if (t <= 0 && distanceM > 0) {
    let speed = 7.5;
    if (sport === 'run' && th.thresholdPaceSPerKm) speed = 0.8 * (1000 / th.thresholdPaceSPerKm);
    else if (sport === 'swim' && th.cssSPer100m) speed = 0.9 * (100 / th.cssSPer100m);
    t = distanceM / speed;
  }
  const i = DEFAULT_INTENSITY[sport];
  return { load: (t / 3600) * i * i * 100, durationS: t };
}

/** Planned load of a workout from its steps (section 3). */
export function plannedLoad(input: PlannedLoadInput): PlannedLoadResult {
  const flat = expandSteps(input.steps);
  const basis = flat.find((s) => s.basis)?.basis ?? null;
  const th = input.thresholds;

  if (!basis) {
    const stepDur = flat.reduce((a, s) => a + (s.durationS ?? 0), 0);
    const stepDist = flat.reduce((a, s) => a + (s.distanceM ?? 0), 0);
    const dist = stepDist || input.plannedDistanceM || 0;
    const r = defaultLoad(input.sport, th, stepDur || input.plannedDurationS || 0, dist);
    const out: PlannedLoadResult = { load: r.load, durationS: r.durationS, loadSource: 'default', basis: null };
    if (dist > 0) out.distanceM = dist;
    return out;
  }

  const vThr =
    basis === 'pace' && th.thresholdPaceSPerKm
      ? 1000 / th.thresholdPaceSPerKm
      : basis === 'swim' && th.cssSPer100m
        ? 100 / th.cssSPer100m
        : 0;
  const rows = flat.map((s) => {
    const mid = s.mid ?? STEP_DEFAULTS[s.kind]?.[basis] ?? 0;
    const i = basis === 'effort' ? mid : mid / 100;
    let t = s.durationS ?? 0;
    if (s.durationS === undefined && s.distanceM !== undefined && vThr > 0 && i > 0) t = s.distanceM / (i * vThr);
    return { t, i, s };
  });
  const T = rows.reduce((a, r) => a + r.t, 0);
  let load = 0;
  if (T > 0) {
    if (basis === 'power') {
      const iw = (rows.reduce((a, r) => a + r.t * r.i ** 4, 0) / T) ** 0.25;
      load = (T / 3600) * iw * iw * 100;
    } else if (basis === 'pace' || basis === 'swim') {
      const im = rows.reduce((a, r) => a + r.t * r.i, 0) / T;
      load = (T / 3600) * im ** (basis === 'pace' ? 2 : 3) * 100;
    } else if (basis === 'heartRate') {
      const lthr = th.lthr ?? 0;
      const rest = th.restingHr ?? 0;
      if (lthr - rest > 0) {
        for (const r of rows) {
          const rs = (r.i * lthr - rest) / (lthr - rest);
          load += 100 * (r.t / 3600) * hrWeight(rs);
        }
      }
    } else {
      load = rows.reduce((a, r) => a + (r.t / 60) * r.i * EFFORT_K, 0);
    }
  }
  let distance = 0;
  let known = false;
  for (const r of rows) {
    if (r.s.distanceM !== undefined) {
      distance += r.s.distanceM;
      known = true;
    } else if (vThr > 0) {
      distance += r.t * r.i * vThr;
      known = true;
    }
  }
  const out: PlannedLoadResult = { load, durationS: T, loadSource: 'steps', basis };
  if (known) out.distanceM = distance;
  return out;
}
