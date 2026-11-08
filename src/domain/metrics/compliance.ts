/** Matching, session compliance bands and weekly compliance. See docs/spec/metrics.md section 7. Pure. */

import type { Activity, ComplianceBand, DayOffset, PlannedWorkout, Step } from '../types.ts';
import { weekRange } from '../time.ts';

/** Rounds half away from zero to `dp` decimal places. */
export function roundHalfAway(x: number, dp = 0): number {
  const f = 10 ** dp;
  return (Math.sign(x) * Math.round(Math.abs(x) * f)) / f;
}

/** Band of a percentage that is already rounded to 1 decimal place. */
export function band(pct: number): Exclude<ComplianceBand, 'missed' | 'unplanned'> {
  if (pct < 50) return 'short';
  if (pct < 80) return 'under';
  if (pct <= 120) return 'onPlan';
  if (pct <= 150) return 'over';
  return 'wellOver';
}

export const BAND_LABELS: Readonly<Record<ComplianceBand, string>> = {
  short: 'Short',
  under: 'Under',
  onPlan: 'On plan',
  over: 'Over',
  wellOver: 'Well over',
  missed: 'Missed',
  unplanned: 'Unplanned',
};

/** `pct = roundHalfAway(100 * done / planned, 1)`. */
export function compliancePct(done: number, planned: number): number {
  return roundHalfAway((100 * done) / planned, 1);
}

/** Whole percentage rounded away from 100: down below 100, up above. 79.9 -> 79, 120.1 -> 121. */
export function displayPct(pct: number): number {
  if (pct < 100) return Math.floor(pct);
  if (pct > 100) return Math.ceil(pct);
  return 100;
}

// ---------- Matching ----------

export const DEFAULT_FIRST_START_MIN = 360;
export const DEFAULT_SECOND_START_MIN = 1020;

function keyOf(x: { athleteId: string; day: number; sport: string }): string {
  return `${x.athleteId}|${x.day}|${x.sport}`;
}

/** Planned start per workout id for one athlete, day and sport (sorted by order). */
function plannedStarts(group: readonly PlannedWorkout[]): Map<string, number> {
  const sorted = group.toSorted((a, b) => a.order - b.order);
  const out = new Map<string, number>();
  sorted.forEach((w, i) => {
    const fallback =
      i === 0 ? DEFAULT_FIRST_START_MIN : DEFAULT_SECOND_START_MIN + (i - 1) * 60;
    out.set(w.id, w.startMinute ?? fallback);
  });
  return out;
}

export interface MatchResult {
  /** plannedId -> activityId */
  pairs: Array<{ plannedId: string; activityId: string }>;
  /** Activities with no planned workout. */
  unplannedActivityIds: string[];
  /** Planned workouts nothing matched. */
  unmatchedPlannedIds: string[];
}

/**
 * One-to-one matching per athlete, day and sport; nearest start wins. Ties break on planned
 * order, then activity start. Activities of sport `other` never match.
 */
export function matchWorkouts(
  planned: readonly PlannedWorkout[],
  activities: readonly Activity[],
): MatchResult {
  const pairs: MatchResult['pairs'] = [];

  const plannedGroups = new Map<string, PlannedWorkout[]>();
  for (const w of planned) {
    if (w.sport === 'other') continue;
    const k = keyOf(w);
    plannedGroups.set(k, [...(plannedGroups.get(k) ?? []), w]);
  }
  const actGroups = new Map<string, Activity[]>();
  for (const a of activities) {
    if (a.sport === 'other') continue;
    const k = keyOf(a);
    actGroups.set(k, [...(actGroups.get(k) ?? []), a]);
  }

  for (const [k, group] of plannedGroups) {
    const acts = actGroups.get(k);
    if (!acts) continue;
    const starts = plannedStarts(group);
    const candidates: Array<{ gap: number; order: number; actStart: number; p: string; a: string }> = [];
    for (const w of group) {
      for (const a of acts) {
        candidates.push({
          gap: Math.abs(a.startMinute - (starts.get(w.id) as number)),
          order: w.order,
          actStart: a.startMinute,
          p: w.id,
          a: a.id,
        });
      }
    }
    candidates.sort((x, y) => x.gap - y.gap || x.order - y.order || x.actStart - y.actStart);
    const takenP = new Set<string>();
    const takenA = new Set<string>();
    for (const c of candidates) {
      if (takenP.has(c.p) || takenA.has(c.a)) continue;
      takenP.add(c.p);
      takenA.add(c.a);
      pairs.push({ plannedId: c.p, activityId: c.a });
    }
  }

  const matchedP = new Set(pairs.map((p) => p.plannedId));
  const matchedA = new Set(pairs.map((p) => p.activityId));
  return {
    pairs,
    unplannedActivityIds: activities.filter((a) => !matchedA.has(a.id)).map((a) => a.id),
    unmatchedPlannedIds: planned.filter((w) => !matchedP.has(w.id)).map((w) => w.id),
  };
}

// ---------- Session compliance ----------

export type Measure = 'load' | 'duration' | 'distance' | 'none';

export interface SessionCompliance {
  measure: Measure;
  /** 1 decimal place; 100 when unmeasured. */
  pct: number;
  band: Exclude<ComplianceBand, 'missed' | 'unplanned'>;
  /** Whole percentage rounded away from 100. */
  shownPct: number;
  /** "No shared measure" when unmeasured. */
  note?: string;
}

function anyStepHasTarget(steps: readonly Step[]): boolean {
  return steps.some((s) =>
    s.kind === 'repeat' ? s.steps.some((p) => p.target !== undefined) : s.target !== undefined,
  );
}

/** `steps` when at least one step has a target, else `default` (metrics.md section 3.2). */
export function loadSourceOf(workout: PlannedWorkout): 'steps' | 'default' {
  return anyStepHasTarget(workout.steps) ? 'steps' : 'default';
}

const MEASURED_LOAD_METHODS = new Set(['power', 'pace', 'swim', 'heartRate']);

/** Compare a planned workout with its matched activity on the first shared measure. */
export function sessionCompliance(planned: PlannedWorkout, activity: Activity): SessionCompliance {
  let measure: Measure = 'none';
  let done = 0;
  let target = 0;
  if (
    loadSourceOf(planned) === 'steps' &&
    MEASURED_LOAD_METHODS.has(activity.load.method) &&
    planned.plannedLoad > 0
  ) {
    measure = 'load';
    done = activity.load.load;
    target = planned.plannedLoad;
  } else if (planned.plannedDurationS > 0 && activity.summary.durationS > 0) {
    measure = 'duration';
    done = activity.summary.durationS;
    target = planned.plannedDurationS;
  } else if (
    planned.plannedDistanceM !== undefined &&
    planned.plannedDistanceM > 0 &&
    activity.summary.distanceM !== undefined
  ) {
    measure = 'distance';
    done = activity.summary.distanceM;
    target = planned.plannedDistanceM;
  }
  if (measure === 'none') {
    return { measure, pct: 100, band: 'onPlan', shownPct: 100, note: 'No shared measure' };
  }
  const pct = compliancePct(done, target);
  return { measure, pct, band: band(pct), shownPct: displayPct(pct) };
}

export type EvalStatus = 'matched' | 'open' | 'missed';

export interface PlannedEvaluation {
  plannedId: string;
  day: DayOffset;
  status: EvalStatus;
  activityId?: string;
  compliance?: SessionCompliance;
  /** The band shown: the compliance band, or `missed`. Open workouts have none. */
  band?: ComplianceBand;
}

export interface ComplianceEvaluation {
  planned: PlannedEvaluation[];
  unplannedActivityIds: string[];
}

/** Match, then score. A leftover planned workout is open until its day ends, then missed. */
export function evaluateCompliance(
  planned: readonly PlannedWorkout[],
  activities: readonly Activity[],
  todayDay: DayOffset,
): ComplianceEvaluation {
  const m = matchWorkouts(planned, activities);
  const actById = new Map(activities.map((a) => [a.id, a]));
  const pairByPlanned = new Map(m.pairs.map((p) => [p.plannedId, p.activityId]));
  const result: PlannedEvaluation[] = planned.map((w) => {
    const actId = pairByPlanned.get(w.id);
    const act = actId === undefined ? undefined : actById.get(actId);
    if (act) {
      const compliance = sessionCompliance(w, act);
      return {
        plannedId: w.id,
        day: w.day,
        status: 'matched',
        activityId: act.id,
        compliance,
        band: compliance.band,
      };
    }
    return w.day < todayDay
      ? { plannedId: w.id, day: w.day, status: 'missed', band: 'missed' }
      : { plannedId: w.id, day: w.day, status: 'open' };
  });
  return { planned: result, unplannedActivityIds: m.unplannedActivityIds };
}

// ---------- Weekly compliance ----------

export const REST_DAY_KEPT_MAX_LOAD = 25;

/**
 * Weekly compliance as an unrounded percentage, or null when there is no plan this week or
 * nothing is due yet. Weighted form so it also serves "week so far": a workout weighs
 * `(nTrain / 7) * PL / sumPL` and a rest day 1/7, using only items that are due.
 *
 * `planned` and `activities` are the athlete's items in the week; `evaluations` come from
 * `evaluateCompliance`. Pass `todayDay` for the current week; any day on or after the week's
 * end counts the whole week.
 */
export function weeklyCompliance(args: {
  week: number;
  planned: readonly PlannedWorkout[];
  evaluations: readonly PlannedEvaluation[];
  activities: readonly Activity[];
  todayDay: DayOffset;
}): number | null {
  const { firstDay, lastDay } = weekRange(args.week);
  const plan = args.planned.filter((w) => w.day >= firstDay && w.day <= lastDay);
  if (plan.length === 0) return null;
  const evalById = new Map(args.evaluations.map((e) => [e.plannedId, e]));
  const trainDays = new Set(plan.map((w) => w.day));
  const nTrain = trainDays.size;
  const sumPl = plan.reduce((s, w) => s + w.plannedLoad, 0);

  let weightSum = 0;
  let creditSum = 0;
  for (const w of plan) {
    const e = evalById.get(w.id);
    let credit: number | null = null;
    if (e?.status === 'matched' && e.compliance) {
      credit = e.compliance.measure === 'none' ? 1 : Math.min(e.compliance.pct, 100) / 100;
    } else if (e?.status === 'missed' || (e === undefined && w.day < args.todayDay)) {
      credit = 0;
    }
    if (credit === null) continue;
    const weight =
      sumPl > 0 ? ((nTrain / 7) * w.plannedLoad) / sumPl : nTrain / 7 / plan.length;
    weightSum += weight;
    creditSum += weight * credit;
  }

  for (let d = firstDay; d <= lastDay; d++) {
    if (trainDays.has(d) || d >= args.todayDay) continue;
    const load = args.activities
      .filter((a) => a.day === d)
      .reduce((s, a) => s + a.load.load, 0);
    weightSum += 1 / 7;
    if (load <= REST_DAY_KEPT_MAX_LOAD) creditSum += 1 / 7;
  }

  if (weightSum === 0) return null;
  return (100 * creditSum) / weightSum;
}
