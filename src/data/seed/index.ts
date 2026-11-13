/**
 * Seed generator. A fixed seed always gives the same data: a small PRNG with named streams,
 * day offsets only, nothing from Math.random or the wall clock except `today` (time.ts).
 * Only summaries are stored; `streamFor(activityId)` makes detailed streams on demand.
 */
import { badges, seenAfterReset } from '../../domain/gamification.ts';
import type { BadgeSeen, WeekExcuse } from '../../domain/gamification.ts';
import {
  acknowledgeFlag,
  addFlagNote,
  emptyFlagsState,
  stepFlags,
} from '../../domain/flags.ts';
import type { AthleteData, FlagRecord, FlagsState } from '../../domain/flags.ts';
import { evaluateCompliance } from '../../domain/metrics/compliance.ts';
import { dailyLoads, fitnessSeries } from '../../domain/metrics/fitness.ts';
import type { FitnessPoint } from '../../domain/metrics/fitness.ts';
import { today as clockToday, weekOfDay } from '../../domain/time.ts';
import type {
  Activity,
  Athlete,
  AthleteId,
  Badge,
  Coach,
  DayOffset,
  Flag,
  Kudos,
  Phase,
  PlannedWorkout,
  Race,
  Threshold,
  WorkoutTemplate,
} from '../../domain/types.ts';
import { buildActivities } from './activities.ts';
import { buildCheckIns } from './checkins.ts';
import type { SeedCheckIn } from './checkins.ts';
import {
  ATHLETES,
  ATHLETE_IDS,
  COACH,
  CURRENT_WEEK,
  PLAN_LAST_WEEK,
  RACES,
  THRESHOLDS,
  weekFirstDay,
} from './people.ts';
import { buildPlanned, phasesFor } from './schedule.ts';
import { TEMPLATES } from './templates.ts';

export type { ActivityStream } from './streams.ts';
export type { SeedCheckIn } from './checkins.ts';
export { ATHLETE_IDS, COACH, PLAN_LAST_WEEK, HISTORY_LAST_WEEK, CURRENT_WEEK } from './people.ts';

/** Fitness and Fatigue on the day before day 0, so early weeks do not start from nothing. */
export const START_FORM: Record<AthleteId, { fitness: number; fatigue: number }> = {
  amir: { fitness: 48, fatigue: 48 },
  danial: { fitness: 44, fatigue: 44 },
  irfan: { fitness: 46, fatigue: 46 },
};

export interface Seed {
  /** The day the seed was generated for. Activities and check-ins stop here. */
  today: DayOffset;
  coach: Coach;
  athletes: Athlete[];
  thresholds: Threshold[];
  races: Race[];
  phases: Phase[];
  templates: WorkoutTemplate[];
  /** Weeks 1 to 29: 16 of history, the current week and the 12 after it. */
  planned: PlannedWorkout[];
  activities: Activity[];
  checkIns: SeedCheckIn[];
  /** Flags in the domain Flag shape, for lists and cards. */
  flags: Flag[];
  /** Flag records with their full lifecycle, per athlete, for the rules engine. */
  flagsState: Record<AthleteId, FlagsState>;
  kudos: Kudos[];
  badges: Badge[];
  /** Every seeded award counts as already shown. */
  badgeSeen: BadgeSeen;
  excuses: WeekExcuse[];
  startForm: Record<AthleteId, { fitness: number; fatigue: number }>;
  planLastWeek: number;
}

export interface SeedOptions {
  /** Defaults to the real today as a day offset. Tests pass a fixed value. */
  today?: DayOffset;
}

const byAthlete = <T extends { athleteId: AthleteId }>(items: readonly T[], id: AthleteId): T[] =>
  items.filter((i) => i.athleteId === id);

function annotateCompliance(
  planned: readonly PlannedWorkout[],
  activities: Activity[],
  today: DayOffset,
): void {
  const ev = evaluateCompliance(planned, activities, today);
  const byId = new Map(activities.map((a) => [a.id, a]));
  for (const e of ev.planned) {
    if (e.status !== 'matched' || e.activityId === undefined) continue;
    const a = byId.get(e.activityId);
    if (!a) continue;
    a.matchedWorkoutId = e.plannedId;
    if (e.band) a.complianceBand = e.band;
  }
  for (const id of ev.unplannedActivityIds) {
    const a = byId.get(id);
    if (a) a.complianceBand = 'unplanned';
  }
}

function fitnessFor(athleteId: AthleteId, activities: readonly Activity[], today: DayOffset): FitnessPoint[] {
  const loads = dailyLoads(
    activities.map((a) => ({ day: a.day, load: a.load.load })),
    0,
    today,
  );
  const start = START_FORM[athleteId];
  return fitnessSeries(loads, { startFitness: start.fitness, startFatigue: start.fatigue });
}

/** Replay the flag rules day by day, the way the app would have run them. */
function replay(
  athlete: Athlete,
  planned: readonly PlannedWorkout[],
  activities: readonly Activity[],
  checkIns: readonly SeedCheckIn[],
  fitness: readonly FitnessPoint[],
  today: DayOffset,
): FlagsState {
  let state = emptyFlagsState();
  const flagPlanned = planned.map((w) => ({
    id: w.id,
    athleteId: w.athleteId,
    day: w.day,
    sport: w.sport,
    title: w.title,
    keySession: w.keySession,
  }));
  for (let d = 0; d <= today; d++) {
    const first = weekFirstDay(weekOfDay(d));
    const weekPlan = planned.filter((w) => w.day >= first && w.day <= first + 6);
    const weekActs = activities.filter((a) => a.day >= first && a.day <= first + 6 && a.day <= d);
    const ev = evaluateCompliance(weekPlan, weekActs, d);
    const data: AthleteData = {
      name: athlete.name,
      checkIns,
      fitness,
      planned: flagPlanned,
      evaluations: ev.planned.map((e) => ({ plannedId: e.plannedId, band: e.band })),
    };
    state = stepFlags(athlete.id, d, data, state);
  }
  return state;
}

const RESOLUTION_NOTE: Record<string, string> = {
  auto: 'Back inside the usual range.',
  'week-ended': 'The week ended.',
  'no-data': 'No check-ins to judge by.',
};

const CITES_ACTIVITIES = new Set(['ramp-high', 'form-deep', 'key-missed', 'mood-low-under-load', 'soreness-high']);

function toFlag(
  rec: FlagRecord,
  checkIns: readonly SeedCheckIn[],
  activities: readonly Activity[],
): Flag {
  const day = rec.openedDay;
  const citedCheckInIds = checkIns.filter((c) => c.day >= day - 2 && c.day <= day).map((c) => c.id);
  const citedActivityIds = CITES_ACTIVITIES.has(rec.ruleId)
    ? activities.filter((a) => a.day >= day - 6 && a.day <= day).map((a) => a.id)
    : [];
  const flag: Flag = {
    id: rec.id,
    athleteId: rec.athleteId as AthleteId,
    ruleId: rec.ruleId,
    raisedDay: rec.openedDay,
    values: rec.valuesLatest,
    explanation: rec.explanation,
    state: rec.status,
    citedCheckInIds,
    citedActivityIds,
  };
  const lastNote = rec.notes[rec.notes.length - 1]?.text;
  const note = lastNote ?? (rec.resolution ? RESOLUTION_NOTE[rec.resolution] : undefined);
  if (note && rec.status !== 'open') flag.resolutionNote = note;
  return flag;
}

export function generateSeed(options: SeedOptions = {}): Seed {
  const today = options.today ?? clockToday();
  const phases: Phase[] = [];
  const planned: PlannedWorkout[] = [];
  const activities: Activity[] = [];
  const checkIns: SeedCheckIn[] = [];
  const flagsState = {} as Record<AthleteId, FlagsState>;
  const flags: Flag[] = [];

  for (const athlete of ATHLETES) {
    const id = athlete.id;
    const ph = phasesFor(id);
    const plan = buildPlanned(id, ph);
    const acts = buildActivities(id, plan, today);
    annotateCompliance(plan, acts, today);
    const cis = buildCheckIns(id, today);
    const fitness = fitnessFor(id, acts, today);
    let state = replay(athlete, plan, acts, cis, fitness, today);

    // Demo coverage: Amir's sleep-short flag is acknowledged, with a coach note.
    if (id === 'amir') {
      const sleep = state.flags.find((f) => f.ruleId === 'sleep-short' && f.status === 'open' && f.openedDay >= weekFirstDay(CURRENT_WEEK));
      if (sleep) {
        const day = Math.min(today, sleep.openedDay + 1);
        state = acknowledgeFlag(state, sleep.id, day);
        state = addFlagNote(state, sleep.id, day, 'Late shifts this week. Keep the long ride easy and check in again on Friday.');
      }
    }

    phases.push(...ph);
    planned.push(...plan);
    activities.push(...acts);
    checkIns.push(...cis);
    flagsState[id] = state;
    flags.push(...state.flags.map((f) => toFlag(f, cis, acts)));
  }

  const kudos = buildKudos(activities, today);
  const excuseRows: WeekExcuse[] = [
    {
      athleteId: 'danial',
      week: 11,
      reason: 'ill',
      note: 'Fever and a heavy cold. Rest week, no catch-up.',
      day: weekFirstDay(12),
    },
  ];
  const excuses = excuseRows.filter((e) => e.day <= today);

  const awards = ATHLETE_IDS.flatMap((id) =>
    badges({
      athleteId: id,
      today,
      planned: byAthlete(planned, id),
      activities: byAthlete(activities, id),
      checkIns: byAthlete(checkIns, id),
      kudos: byAthlete(kudos, id),
      thresholds: THRESHOLDS,
      races: RACES,
      phases: byAthlete(phases, id),
      excuses,
    }),
  );
  const badgeRows: Badge[] = awards.map((a) => ({
    id: a.id,
    athleteId: a.athleteId,
    key: a.key,
    earnedDay: a.earnedDay,
    sourceItemId: a.sourceItemId,
  }));

  return {
    today,
    coach: COACH,
    athletes: ATHLETES,
    thresholds: THRESHOLDS,
    races: RACES,
    phases,
    templates: TEMPLATES,
    planned,
    activities,
    checkIns,
    flags,
    flagsState,
    kudos,
    badges: badgeRows,
    badgeSeen: seenAfterReset(awards),
    excuses,
    startForm: START_FORM,
    planLastWeek: PLAN_LAST_WEEK,
  };
}

function buildKudos(activities: readonly Activity[], today: DayOffset): Kudos[] {
  const out: Kudos[] = [];
  // Amir: kudos on the first brick (the Saturday run of week 6).
  const brick = activities.find((a) => a.athleteId === 'amir' && a.id === 'amir-a-w6-d5-run');
  if (brick) {
    out.push({
      id: 'kudos-amir-1',
      athleteId: 'amir',
      activityId: brick.id,
      message: 'First brick done. That wobble in the legs passes quickly. Well ridden.',
      day: brick.day,
      seenByAthlete: true,
    });
  }
  // Danial: kudos on the long run of week 3.
  const long = activities.find((a) => a.athleteId === 'danial' && a.id === 'danial-a-w3-d6-run');
  if (long) {
    out.push({
      id: 'kudos-danial-1',
      athleteId: 'danial',
      activityId: long.id,
      message: 'Steady all the way through. This is how a marathon block starts.',
      day: long.day,
      seenByAthlete: true,
    });
  }
  return out.filter((k) => k.day <= today);
}
