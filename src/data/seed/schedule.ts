/** Phases and the weekly plan for each athlete, built from the template library. */
import { derivePhases, weeklyTargets } from '../../domain/plan.ts';
import { workoutTotals } from '../../domain/steps.ts';
import { weekOfDay } from '../../domain/time.ts';
import type {
  AthleteId,
  DayOffset,
  Phase,
  PhaseKind,
  PlannedWorkout,
  Race,
  Sport,
  WeeklyTarget,
} from '../../domain/types.ts';
import { PLAN_LAST_WEEK, RACES, THRESHOLDS, thresholdsOn, weekFirstDay } from './people.ts';
import { scaleSteps, templateById } from './templates.ts';

export const MORNING = 360;
export const EVENING = 1050;
/** First week with a brick run after the long ride (Amir). */
export const FIRST_BRICK_WEEK = 6;

/** How much of the template week each athlete trains, so weekly Load sits at a believable level. */
export const VOLUME: Record<AthleteId, number> = { amir: 0.78, danial: 0.85, irfan: 0.66 };

export interface Slot {
  /** 0 = Monday ... 6 = Sunday. */
  day: number;
  sport: Sport;
  /** One template, or a list the weeks rotate through. */
  template: string | string[];
  /** Template used in the build, peak and taper phases instead of the rotation. */
  lateTemplate?: string;
  key: boolean;
  start: number;
  order: number;
  /** Extra size multiplier for this slot. */
  mult?: number;
  /** Brick run: starts straight after the day's ride. */
  brick?: boolean;
  fromWeek?: number;
}

export const SLOTS: Record<AthleteId, Slot[]> = {
  amir: [
    { day: 1, sport: 'swim', template: 'swim-css', key: false, start: MORNING, order: 1, mult: 1.3 },
    { day: 1, sport: 'run', template: 'run-easy', key: false, start: EVENING, order: 2 },
    { day: 2, sport: 'bike', template: ['bike-sweetspot', 'bike-threshold'], lateTemplate: 'bike-vo2', key: true, start: MORNING, order: 1 },
    { day: 3, sport: 'swim', template: 'swim-endurance', key: false, start: MORNING, order: 1, mult: 1.3 },
    { day: 3, sport: 'strength', template: 'strength-foundation', key: false, start: EVENING, order: 2 },
    { day: 4, sport: 'swim', template: 'swim-technique', key: false, start: MORNING, order: 1, mult: 1.3 },
    { day: 5, sport: 'bike', template: 'bike-long', key: true, start: MORNING, order: 1 },
    { day: 5, sport: 'run', template: 'run-brick', key: false, start: MORNING, order: 2, brick: true, fromWeek: FIRST_BRICK_WEEK },
    { day: 6, sport: 'run', template: 'run-long', key: true, start: MORNING, order: 1 },
  ],
  danial: [
    { day: 1, sport: 'run', template: ['run-intervals', 'run-threshold'], key: true, start: MORNING, order: 1 },
    { day: 1, sport: 'strength', template: 'strength-foundation', key: false, start: EVENING, order: 2 },
    { day: 2, sport: 'run', template: 'run-easy', key: false, start: MORNING, order: 1 },
    { day: 3, sport: 'run', template: 'run-threshold', lateTemplate: 'run-marathon-pace', key: true, start: MORNING, order: 1 },
    { day: 4, sport: 'run', template: 'run-easy', key: false, start: MORNING, order: 1, mult: 0.9 },
    { day: 4, sport: 'strength', template: 'strength-core', key: false, start: EVENING, order: 2 },
    { day: 6, sport: 'run', template: 'run-long', key: true, start: MORNING, order: 1 },
  ],
  irfan: [
    { day: 1, sport: 'bike', template: ['bike-sweetspot', 'bike-threshold'], key: true, start: MORNING, order: 1 },
    { day: 2, sport: 'bike', template: 'bike-endurance', key: false, start: MORNING, order: 1, mult: 0.8 },
    { day: 2, sport: 'strength', template: 'strength-foundation', key: false, start: EVENING, order: 2 },
    { day: 3, sport: 'bike', template: 'bike-threshold', lateTemplate: 'bike-climbing', key: true, start: MORNING, order: 1 },
    { day: 5, sport: 'bike', template: 'bike-long', key: true, start: MORNING, order: 1 },
    { day: 6, sport: 'bike', template: 'bike-endurance', key: false, start: MORNING, order: 1, mult: 1.1 },
  ],
};

/** Short coach notes on selected sessions. */
const NOTES: Record<string, string> = {
  'bike-long': 'Fuel early: 60 g of carbohydrate an hour from the first hour.',
  'bike-climbing': 'Stay seated and steady. Same power on every climb.',
  'bike-threshold': 'Even power on each repeat. Stop one rep early if it fades.',
  'bike-sweetspot': 'Hard but repeatable. You should finish able to do one more.',
  'run-long': 'First half easy. Take fluids every 20 minutes.',
  'run-marathon-pace': 'Settle onto goal pace by the second kilometre and hold it.',
  'run-threshold': 'Controlled, not flat out. The last rep should match the first.',
  'swim-css': 'Same time on every 200. Take the full 20 seconds of rest.',
};

function hasBrick(athleteId: AthleteId): boolean {
  return SLOTS[athleteId].some((s) => s.brick);
}

function racesOf(athleteId: AthleteId): Race[] {
  return RACES.filter((r) => r.athleteId === athleteId);
}

function aRace(athleteId: AthleteId): Race {
  const r = racesOf(athleteId).find((x) => x.priority === 'A');
  if (!r) throw new Error(`No A race for ${athleteId}`);
  return r;
}

export function phaseKindOf(phases: readonly Phase[], week: number): PhaseKind {
  return phases.find((p) => week >= p.firstWeek && week <= p.lastWeek)?.kind ?? 'base';
}

/** Standard-week load at size 1, used as the base load of the plan. */
function referenceLoad(athleteId: AthleteId, week: number): number {
  let total = 0;
  for (const slot of SLOTS[athleteId]) {
    if (slot.fromWeek !== undefined) continue;
    const t = templateById(Array.isArray(slot.template) ? (slot.template[0] as string) : slot.template);
    const th = thresholdsOn(athleteId, weekFirstDay(week), THRESHOLDS);
    const steps = scaleSteps(t.steps, slot.mult ?? 1, 'ref');
    total += workoutTotals(steps, slot.sport, th).load;
  }
  return total;
}

function referenceHours(athleteId: AthleteId): number {
  let total = 0;
  for (const slot of SLOTS[athleteId]) {
    if (slot.fromWeek !== undefined) continue;
    const t = templateById(Array.isArray(slot.template) ? (slot.template[0] as string) : slot.template);
    const steps = scaleSteps(t.steps, slot.mult ?? 1, 'ref');
    total += workoutTotals(steps, slot.sport, thresholdsOn(athleteId, 0, THRESHOLDS)).durationS;
  }
  return total / 3600;
}

export interface PlanSizing {
  baseLoad: number;
  baseHours: number;
}

export function sizingOf(athleteId: AthleteId): PlanSizing {
  return {
    baseLoad: Math.round(referenceLoad(athleteId, 1)),
    baseHours: Math.round(referenceHours(athleteId) * 2) / 2,
  };
}

/** Phases for an athlete: base up to the build, then worked back from the A race, clipped to the plan. */
export function phasesFor(athleteId: AthleteId): Phase[] {
  const { baseLoad, baseHours } = sizingOf(athleteId);
  const derived = derivePhases(aRace(athleteId), { firstWeek: 1, baseLoad, baseHours });
  const out: Phase[] = [];
  for (const p of derived) {
    if (p.firstWeek > PLAN_LAST_WEEK) continue;
    const lastWeek = Math.min(p.lastWeek, PLAN_LAST_WEEK);
    // The first block stretches back to week 1 as base.
    const firstWeek = out.length === 0 ? 1 : p.firstWeek;
    out.push({
      ...p,
      id: `${athleteId}-${p.kind}-${firstWeek}`,
      firstWeek,
      lastWeek,
      weeklyTargets: weeklyTargets(p.kind, firstWeek, lastWeek, baseLoad, baseHours),
    });
  }
  const last = out[out.length - 1];
  if (last && last.lastWeek < PLAN_LAST_WEEK) {
    const firstWeek = last.lastWeek + 1;
    out.push({
      id: `${athleteId}-base-${firstWeek}`,
      athleteId,
      kind: 'base',
      firstWeek,
      lastWeek: PLAN_LAST_WEEK,
      weeklyTargets: weeklyTargets('base', firstWeek, PLAN_LAST_WEEK, baseLoad, baseHours),
    });
  }
  return out;
}

export function targetOf(phases: readonly Phase[], week: number): WeeklyTarget | undefined {
  for (const p of phases) {
    const t = p.weeklyTargets.find((x) => x.week === week);
    if (t) return t;
  }
  return undefined;
}

function pickTemplate(slot: Slot, week: number, kind: PhaseKind): string {
  const late = kind === 'build' || kind === 'peak' || kind === 'taper';
  if (late && slot.lateTemplate) return slot.lateTemplate;
  if (Array.isArray(slot.template)) return slot.template[(week - 1) % slot.template.length] as string;
  return slot.template;
}

/** Planned workouts for weeks 1 to PLAN_LAST_WEEK. */
export function buildPlanned(athleteId: AthleteId, phases: readonly Phase[]): PlannedWorkout[] {
  const out: PlannedWorkout[] = [];
  const { baseLoad } = sizingOf(athleteId);
  const races = racesOf(athleteId);
  for (let week = 1; week <= PLAN_LAST_WEEK; week++) {
    const target = targetOf(phases, week);
    if (!target) continue;
    const kind = phaseKindOf(phases, week);
    const raceThisWeek = races.filter((r) => weekOfDay(r.day) === week);
    const bcRace = raceThisWeek.find((r) => r.priority !== 'A');
    const weekScale = (target.loadTarget / baseLoad) * VOLUME[athleteId] * (bcRace ? 0.8 : 1);
    const first = weekFirstDay(week);
    const th = thresholdsOn(athleteId, first, THRESHOLDS);
    const rideEnd = new Map<DayOffset, number>();

    for (const slot of SLOTS[athleteId]) {
      if (slot.fromWeek !== undefined && week < slot.fromWeek) continue;
      const day = first + slot.day;
      if (raceThisWeek.some((r) => r.day === day)) continue;
      const templateId = slot.brick ? 'run-brick' : pickTemplate(slot, week, kind);
      const tpl = templateById(templateId);
      const factor = slot.brick ? Math.max(0.7, Math.min(1.2, weekScale)) : weekScale * (slot.mult ?? 1);
      const id = `${athleteId}-p-w${week}-d${slot.day}-${slot.sport}`;
      const steps = scaleSteps(tpl.steps, factor, id);
      const dayTh = thresholdsOn(athleteId, day, THRESHOLDS);
      const totals = workoutTotals(steps, slot.sport, { ...th, ...dayTh });
      let start = slot.start;
      if (slot.brick) start = (rideEnd.get(day) ?? slot.start) + 5;
      if (slot.sport === 'bike') rideEnd.set(day, slot.start + totals.durationS / 60);
      const workout: PlannedWorkout = {
        id,
        athleteId,
        day,
        order: slot.order,
        startMinute: Math.round(start),
        sport: slot.sport,
        title: tpl.name,
        steps,
        plannedDurationS: Math.round(totals.durationS),
        plannedLoad: Math.round(totals.load * 10) / 10,
        keySession: slot.key,
        sourceTemplateId: tpl.id,
      };
      if (totals.distanceM !== undefined) workout.plannedDistanceM = Math.round(totals.distanceM);
      const note = NOTES[tpl.id];
      if (note && slot.key) workout.coachNote = note;
      out.push(workout);
    }
  }
  return out.toSorted((a, b) => a.day - b.day || a.order - b.order);
}

export { hasBrick };
