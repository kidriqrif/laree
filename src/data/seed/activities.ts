/** Completed activities, made from the plan plus each athlete's scripted behaviour. Summaries only. */
import { sessionLoad } from '../../domain/metrics/load.ts';
import type { LoadInput } from '../../domain/metrics/load.ts';
import { weekOfDay } from '../../domain/time.ts';
import type {
  Activity,
  ActivitySource,
  ActivitySummary,
  AthleteId,
  DayOffset,
  PlannedWorkout,
  Sport,
} from '../../domain/types.ts';
import { BEHAVIOUR, CURRENT_WEEK_BEHAVIOUR } from './behaviour.ts';
import type { Directive, Extra } from './behaviour.ts';
import { ATHLETES, HISTORY_LAST_WEEK, THRESHOLDS, thresholdsOn, weekFirstDay } from './people.ts';
import { between, clamped, pick, rngFor } from './rng.ts';
import type { Rng } from './rng.ts';

const NOTES = [
  'Legs felt heavy at the start, better after twenty minutes.',
  'Felt smooth today.',
  'Warm and humid. Drank more than usual.',
  'Short on sleep but it went fine.',
  'Windy on the way back.',
  'Good rhythm all the way through.',
  'Had to cut a few minutes for work.',
];

const SOURCE: Record<Sport, ActivitySource> = {
  bike: 'file',
  run: 'simulatedDevice',
  swim: 'simulatedDevice',
  strength: 'manual',
  other: 'manual',
};

export function slotKey(w: { day: DayOffset; sport: Sport }): string {
  return `${((w.day % 7) + 7) % 7}:${w.sport}`;
}

interface Spec {
  id: string;
  athleteId: AthleteId;
  day: DayOffset;
  startMinute: number;
  sport: Sport;
  title: string;
  /** Timer seconds. */
  durationS: number;
  /** Fraction of threshold (strength: ignored). */
  intensity: number;
  /** Strength only. */
  rpe?: number;
  /** Rescale duration so the load equals this, keeping intensity (not for strength). */
  targetLoad?: number;
  rng: Rng;
  note?: string;
}

function summaryOf(spec: Spec, durationS: number): { summary: ActivitySummary; input: LoadInput } {
  const th = thresholdsOn(spec.athleteId, spec.day, THRESHOLDS);
  const athlete = ATHLETES.find((a) => a.id === spec.athleteId);
  const rest = th.restingHr ?? athlete?.baselines.restingHr ?? 50;
  const lthr = th.lthr ?? 165;
  const i = spec.intensity;
  const hrFraction = Math.min(0.97, 0.18 + 0.8 * i);
  const avgHr = Math.round(rest + (lthr - rest) * (spec.sport === 'strength' ? 0.42 : hrFraction));
  const summary: ActivitySummary = {
    durationS: Math.round(durationS),
    movingTimeS: Math.round(durationS * (spec.sport === 'bike' ? 0.985 : spec.sport === 'run' ? 0.995 : 1)),
    avgHr,
    maxHr: Math.round(avgHr + (spec.sport === 'strength' ? 22 : 12 + 16 * i)),
  };
  const input: LoadInput = { sport: spec.sport, timerS: Math.round(durationS), thresholds: th };
  if (spec.sport === 'bike') {
    const ftp = th.ftp ?? 250;
    const wp = Math.round(i * ftp);
    summary.weightedPowerW = wp;
    summary.avgPowerW = Math.round(wp * 0.93);
    summary.intensity = Math.round(i * 100) / 100;
    summary.avgSpeedMps = Math.round((6.6 + 3.6 * i) * 100) / 100;
    summary.distanceM = Math.round(summary.avgSpeedMps * durationS);
    summary.elevationGainM = Math.round((summary.distanceM / 1000) * between(spec.rng, 8, 14));
    summary.cadence = Math.round(between(spec.rng, 84, 92));
    input.summary = { weightedPowerW: wp };
  } else if (spec.sport === 'run') {
    const vThr = 1000 / (th.thresholdPaceSPerKm ?? 265);
    const v = Math.round(i * vThr * 1000) / 1000;
    summary.avgSpeedMps = v;
    summary.distanceM = Math.round(v * durationS);
    summary.intensity = Math.round(i * 100) / 100;
    summary.elevationGainM = Math.round((summary.distanceM / 1000) * between(spec.rng, 6, 12));
    summary.cadence = Math.round(between(spec.rng, 168, 178));
    input.summary = { distanceM: summary.distanceM };
  } else if (spec.sport === 'swim') {
    const vCss = 100 / (th.cssSPer100m ?? 108);
    const v = Math.round(i * vCss * 1000) / 1000;
    summary.avgSpeedMps = v;
    summary.distanceM = Math.round((v * durationS) / 25) * 25;
    summary.intensity = Math.round(i * 100) / 100;
    input.summary = { distanceM: summary.distanceM };
  } else {
    input.rpe = spec.rpe ?? 6;
  }
  return { summary, input };
}

/** Build one activity. Load comes from the real engine, rescaled once to hit a target load. */
export function makeActivity(spec: Spec): Activity {
  let durationS = Math.max(120, spec.durationS);
  let built = summaryOf(spec, durationS);
  let load = sessionLoad(built.input);
  if (spec.targetLoad !== undefined && spec.sport !== 'strength' && load.load > 0) {
    durationS = Math.max(120, durationS * (spec.targetLoad / load.load));
    built = summaryOf(spec, durationS);
    load = sessionLoad(built.input);
  }
  const a: Activity = {
    id: spec.id,
    athleteId: spec.athleteId,
    day: spec.day,
    startMinute: spec.startMinute,
    sport: spec.sport,
    title: spec.title,
    source: SOURCE[spec.sport],
    summary: built.summary,
    load,
  };
  if (spec.sport === 'strength') a.rpe = spec.rpe ?? 6;
  else a.rpe = Math.max(2, Math.min(9, Math.round(1 + spec.intensity * 6.5)));
  if (spec.note) a.notes = spec.note;
  return a;
}

/** Average intensity implied by a planned workout's load and time. */
function plannedIntensity(w: PlannedWorkout): number {
  const hours = w.plannedDurationS / 3600;
  if (hours <= 0 || w.plannedLoad <= 0) return 0.6;
  const p = w.sport === 'swim' ? 1 / 3 : 1 / 2;
  return Math.min(1.3, (w.plannedLoad / (hours * 100)) ** p);
}

function avgRpe(w: PlannedWorkout): number {
  const rpes: number[] = [];
  const visit = (s: PlannedWorkout['steps'][number]): void => {
    if (s.kind === 'repeat') s.steps.forEach(visit);
    else if (s.target?.kind === 'rpe') rpes.push((s.target.low + s.target.high) / 2);
  };
  w.steps.forEach(visit);
  return rpes.length ? Math.round(rpes.reduce((a, b) => a + b, 0) / rpes.length) : 5;
}

/** Weekdays: a planned start with a little lateness. */
function startFor(w: PlannedWorkout, rng: Rng): number {
  const base = w.startMinute ?? 360;
  return Math.round(base + between(rng, 0, 14));
}

function fromPlanned(w: PlannedWorkout, d: Directive | undefined, rng: Rng): Activity | null {
  if (d?.miss) return null;
  const pct = d?.pct ?? Math.round(clamped(rng, 100, 4, 93, 108));
  const c = pct / 100;
  const spec: Spec = {
    id: `${w.athleteId}-a-${w.id.slice(w.athleteId.length + 3)}`,
    athleteId: w.athleteId,
    day: w.day,
    startMinute: startFor(w, rng),
    sport: w.sport,
    title: w.title,
    durationS: w.plannedDurationS * c,
    intensity: plannedIntensity(w) * (1 + between(rng, -0.015, 0.015)),
    rng,
  };
  if (w.sport === 'strength') {
    spec.rpe = avgRpe(w);
    spec.durationS = w.plannedDurationS * c;
  } else {
    spec.targetLoad = w.plannedLoad * c;
  }
  if (rng() < 0.12) spec.note = pick(rng, NOTES);
  return makeActivity(spec);
}

function fromExtra(athleteId: AthleteId, week: number, e: Extra, rng: Rng): Activity {
  const day = weekFirstDay(week) + e.day;
  return makeActivity({
    id: `${athleteId}-a-w${week}-d${e.day}-${e.sport}-extra`,
    athleteId,
    day,
    startMinute: e.startMinute,
    sport: e.sport,
    title: e.title,
    durationS: e.durationMin * 60,
    intensity: e.intensity,
    rng,
  });
}

/**
 * Activities for one athlete from the first day to the day before `today`. The session due
 * today is left to do, so the Today screen always has something to show.
 */
export function buildActivities(
  athleteId: AthleteId,
  planned: readonly PlannedWorkout[],
  today: DayOffset,
): Activity[] {
  const out: Activity[] = [];
  const lastWeek = Math.min(weekOfDay(today), HISTORY_LAST_WEEK + 1);
  for (const w of planned) {
    if (w.day >= today) continue;
    const week = weekOfDay(w.day);
    if (week > lastWeek) continue;
    const rng = rngFor('activity', w.id);
    const table = week <= HISTORY_LAST_WEEK ? BEHAVIOUR[athleteId][week] : CURRENT_WEEK_BEHAVIOUR[athleteId];
    const a = fromPlanned(w, table?.slots?.[slotKey(w)], rng);
    if (a) out.push(a);
  }
  for (let week = 1; week <= lastWeek; week++) {
    const table = week <= HISTORY_LAST_WEEK ? BEHAVIOUR[athleteId][week] : CURRENT_WEEK_BEHAVIOUR[athleteId];
    for (const e of table?.extras ?? []) {
      if (weekFirstDay(week) + e.day >= today) continue;
      out.push(fromExtra(athleteId, week, e, rngFor('extra', athleteId, week, e.day)));
    }
  }
  // A brick run starts a few minutes after the ride on the same day actually ends.
  const brickIds = new Set(planned.filter((w) => w.sourceTemplateId === 'run-brick').map((w) => w.id));
  for (const a of out) {
    if (a.sport !== 'run' || !a.id.endsWith('-d5-run') || !brickIds.has(a.id.replace('-a-', '-p-'))) continue;
    const ride = out.find((r) => r.day === a.day && r.sport === 'bike');
    if (ride) a.startMinute = Math.round(ride.startMinute + ride.summary.durationS / 60 + 6);
  }
  return out.toSorted((a, b) => a.day - b.day || a.startMinute - b.startMinute);
}
