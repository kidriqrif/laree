/**
 * Selectors: everything derived from the stored items. Nothing here is stored. Each selector is
 * memoised on the identity of its inputs, so `useLaree((s) => selectWeek(s.data, ...))` returns
 * the same object until the data or the arguments change.
 */
import { isActive } from '../domain/flags.ts'
import type { FlagRecord, FlagStatus } from '../domain/flags.ts'
import { badges as computeBadges, lap, streak } from '../domain/gamification.ts'
import type { BadgeAward, GamificationInput, LapState, StreakResult } from '../domain/gamification.ts'
import { evaluateCompliance, weeklyCompliance } from '../domain/metrics/compliance.ts'
import type { ComplianceEvaluation, PlannedEvaluation } from '../domain/metrics/compliance.ts'
import { projectedSeries } from '../domain/metrics/fitness.ts'
import type { FitnessPoint } from '../domain/metrics/fitness.ts'
import { today as clockToday, weekOfDay, weekRange } from '../domain/time.ts'
import type {
  Activity,
  AthleteId,
  Badge,
  CheckIn,
  DayOffset,
  Kudos,
  Phase,
  PlannedWorkout,
  Race,
  Settings,
  WeeklyTarget,
  WorkoutTemplate,
} from '../domain/types.ts'
import type { Severity } from '../domain/flags.ts'
import type { LareeData } from './store.ts'
import { START_FORM } from './seed/index.ts'

const ATHLETES: readonly AthleteId[] = ['amir', 'danial', 'irfan']

/** Cache by a string key; an entry is reused while every argument is identical (Object.is). */
function memoize<A extends readonly unknown[], R>(fn: (...args: A) => R, keyOf: (...args: A) => string): (...args: A) => R {
  const cache = new Map<string, { args: A; result: R }>()
  return (...args: A): R => {
    const key = keyOf(...args)
    const hit = cache.get(key)
    if (hit && hit.args.length === args.length && hit.args.every((a, i) => Object.is(a, args[i]))) return hit.result
    const result = fn(...args)
    cache.set(key, { args, result })
    return result
  }
}

const mine = <T extends { athleteId: string }>(items: readonly T[], id: AthleteId): T[] =>
  items.filter((i) => i.athleteId === id)

// ------------------------------------------------------------------ shared building blocks

/** Match, score and mark missed, for one athlete. */
export const selectEvaluation = memoize(
  (data: LareeData, athleteId: AthleteId, today: DayOffset): ComplianceEvaluation =>
    evaluateCompliance(
      mine(data.planned, athleteId),
      mine(data.activities, athleteId).filter((a) => a.day <= today),
      today,
    ),
  (_d, id, today) => `eval:${id}:${today}`,
)

/** Fitness, Fatigue, Form and Ramp per day: completed days, then the plan projected forward. */
export const selectFitnessSeries = memoize(
  (data: LareeData, athleteId: AthleteId, today: DayOffset): FitnessPoint[] => {
    const ev = selectEvaluation(data, athleteId, today)
    const matched = new Set(ev.planned.filter((e) => e.status === 'matched').map((e) => e.plannedId))
    const start = START_FORM[athleteId]
    return projectedSeries({
      firstDay: 0,
      today,
      actual: mine(data.activities, athleteId)
        .filter((a) => a.day <= today)
        .map((a) => ({ day: a.day, load: a.load.load })),
      planned: mine(data.planned, athleteId).map((w) => ({
        day: w.day,
        plannedLoad: w.plannedLoad,
        matched: matched.has(w.id),
      })),
      startFitness: start.fitness,
      startFatigue: start.fatigue,
    })
  },
  (_d, id, today) => `fit:${id}:${today}`,
)

function gamificationInput(data: LareeData, athleteId: AthleteId, today: DayOffset): GamificationInput {
  return {
    athleteId,
    today,
    planned: mine(data.planned, athleteId),
    activities: mine(data.activities, athleteId),
    checkIns: mine(data.checkIns, athleteId),
    kudos: mine(data.kudos, athleteId),
    thresholds: data.thresholds,
    races: data.races,
    phases: mine(data.phases, athleteId),
    excuses: data.excuses,
  }
}

/** Every badge the athlete has earned by `today`, worked out from the data. */
export const earnedAwards = memoize(
  (data: LareeData, athleteId: AthleteId, today: DayOffset): BadgeAward[] =>
    computeBadges(gamificationInput(data, athleteId, today)),
  (_d, id, today) => `awards:${id}:${today}`,
)

// ------------------------------------------------------------------ athlete: day

export interface PlannedItem {
  workout: PlannedWorkout
  /** Matching state: matched, open or missed, with the band shown. */
  evaluation: PlannedEvaluation | undefined
  /** The activity that counted for it, if any. */
  activity: Activity | undefined
}

export interface AthleteDay {
  athleteId: AthleteId
  day: DayOffset
  planned: PlannedItem[]
  /** Everything logged that day, planned or not. */
  activities: Activity[]
  /** Logged that day and not matched to a plan. */
  unplanned: Activity[]
  checkIn: CheckIn | null
  /** Nothing planned and nothing logged. */
  isEmpty: boolean
}

export const selectAthleteDay = memoize(
  (data: LareeData, athleteId: AthleteId, day: DayOffset, today: DayOffset): AthleteDay => {
    const ev = selectEvaluation(data, athleteId, today)
    const evById = new Map(ev.planned.map((e) => [e.plannedId, e]))
    const acts = mine(data.activities, athleteId)
    const actById = new Map(acts.map((a) => [a.id, a]))
    const planned = mine(data.planned, athleteId)
      .filter((w) => w.day === day)
      .toSorted((a, b) => a.order - b.order)
      .map((workout): PlannedItem => {
        const evaluation = evById.get(workout.id)
        const activity = evaluation?.activityId === undefined ? undefined : actById.get(evaluation.activityId)
        return { workout, evaluation, activity }
      })
    const activities = acts.filter((a) => a.day === day).toSorted((a, b) => a.startMinute - b.startMinute)
    const matchedIds = new Set(planned.flatMap((p) => (p.activity ? [p.activity.id] : [])))
    const unplanned = activities.filter((a) => !matchedIds.has(a.id))
    const checkIn = data.checkIns.find((c) => c.athleteId === athleteId && c.day === day) ?? null
    return { athleteId, day, planned, activities, unplanned, checkIn, isEmpty: planned.length === 0 && activities.length === 0 }
  },
  (_d, id, day, today) => `day:${id}:${day}:${today}`,
)

// ------------------------------------------------------------------ athlete: week

export interface WeekSummary {
  athleteId: AthleteId
  week: number
  firstDay: DayOffset
  days: AthleteDay[]
  plannedLoad: number
  doneLoad: number
  plannedDurationS: number
  doneDurationS: number
  /** Weekly compliance, unrounded, or null when there is no plan or nothing is due. */
  compliance: number | null
  phase: Phase | undefined
  target: WeeklyTarget | undefined
  /** No workouts planned in this week. */
  unplanned: boolean
}

export const selectWeek = memoize(
  (data: LareeData, athleteId: AthleteId, week: number, today: DayOffset): WeekSummary => {
    const { firstDay, lastDay } = weekRange(week)
    const days: AthleteDay[] = []
    for (let d = firstDay; d <= lastDay; d++) days.push(selectAthleteDay(data, athleteId, d, today))
    const plan = days.flatMap((d) => d.planned.map((p) => p.workout))
    const acts = days.flatMap((d) => d.activities)
    const ev = selectEvaluation(data, athleteId, today)
    const compliance = weeklyCompliance({
      week,
      planned: plan,
      evaluations: ev.planned,
      activities: acts,
      todayDay: today,
    })
    const phase = mine(data.phases, athleteId).find((p) => week >= p.firstWeek && week <= p.lastWeek)
    return {
      athleteId,
      week,
      firstDay,
      days,
      plannedLoad: plan.reduce((s, w) => s + w.plannedLoad, 0),
      doneLoad: acts.reduce((s, a) => s + a.load.load, 0),
      plannedDurationS: plan.reduce((s, w) => s + w.plannedDurationS, 0),
      doneDurationS: acts.reduce((s, a) => s + a.summary.durationS, 0),
      compliance,
      phase,
      target: phase?.weeklyTargets.find((t) => t.week === week),
      unplanned: plan.length === 0,
    }
  },
  (_d, id, week, today) => `week:${id}:${week}:${today}`,
)

// ------------------------------------------------------------------ athlete: progress

export interface AthleteProgress {
  athleteId: AthleteId
  streak: StreakResult
  /** The lap for the current week. */
  lap: LapState
  badges: Badge[]
  /** Fitness, Fatigue, Form and Ramp today. */
  form: FitnessPoint | undefined
  nextRace: Race | undefined
}

export const selectProgress = memoize(
  (data: LareeData, athleteId: AthleteId, today: DayOffset): AthleteProgress => {
    const input = gamificationInput(data, athleteId, today)
    const series = selectFitnessSeries(data, athleteId, today)
    return {
      athleteId,
      streak: streak(input),
      lap: lap(input, weekOfDay(today)),
      badges: mine(data.badges, athleteId),
      form: series.find((p) => p.day === today),
      nextRace: nextRace(data, athleteId, today),
    }
  },
  (_d, id, today) => `progress:${id}:${today}`,
)

function nextRace(data: LareeData, athleteId: AthleteId, today: DayOffset): Race | undefined {
  return mine(data.races, athleteId)
    .filter((r) => r.day >= today)
    .toSorted((a, b) => a.day - b.day)[0]
}

// ------------------------------------------------------------------ coach: roster

export interface RosterRow {
  athleteId: AthleteId
  fitness: number
  fatigue: number
  form: number
  ramp: number
  /** Weekly compliance so far this week (unrounded), or null. */
  compliance: number | null
  openFlags: number
  /** The most serious open or acknowledged flag. */
  topSeverity: Severity | null
  /** Day of the latest check-in, or null if there is none. */
  lastCheckInDay: DayOffset | null
  /** Whole days since the latest check-in. */
  daysSinceCheckIn: number | null
  nextRace: Race | undefined
  aiConsent: boolean
}

export const SEVERITY_RANK: Record<Severity, number> = { info: 0, watch: 1, act: 2 }

export const selectRosterRows = memoize(
  (data: LareeData, today: DayOffset): RosterRow[] =>
    ATHLETES.map((athleteId): RosterRow => {
      const point = selectFitnessSeries(data, athleteId, today).find((p) => p.day === today)
      const active = data.flagsState[athleteId].flags.filter(isActive)
      const top = active.reduce<Severity | null>(
        (m, f) => (m === null || SEVERITY_RANK[f.severity] > SEVERITY_RANK[m] ? f.severity : m),
        null,
      )
      const last = mine(data.checkIns, athleteId).reduce<number | null>(
        (m, c) => (c.day <= today && (m === null || c.day > m) ? c.day : m),
        null,
      )
      return {
        athleteId,
        fitness: point?.fitness ?? 0,
        fatigue: point?.fatigue ?? 0,
        form: point?.form ?? 0,
        ramp: point?.ramp ?? 0,
        compliance: selectWeek(data, athleteId, weekOfDay(today), today).compliance,
        openFlags: active.length,
        topSeverity: top,
        lastCheckInDay: last,
        daysSinceCheckIn: last === null ? null : today - last,
        nextRace: nextRace(data, athleteId, today),
        aiConsent: data.settings[athleteId].aiConsent,
      }
    }),
  (_d, today) => `roster:${today}`,
)

// ------------------------------------------------------------------ coach: analytics

export interface WeeklyPoint {
  week: number
  plannedLoad: number
  doneLoad: number
  plannedHours: number
  doneHours: number
  compliance: number | null
}

export interface AnalyticsSeries {
  athleteId: AthleteId
  fitness: FitnessPoint[]
  weekly: WeeklyPoint[]
}

export const selectAnalytics = memoize(
  (data: LareeData, athleteId: AthleteId, lastWeek: number, today: DayOffset): AnalyticsSeries => {
    const weekly: WeeklyPoint[] = []
    for (let w = 1; w <= lastWeek; w++) {
      const s = selectWeek(data, athleteId, w, today)
      weekly.push({
        week: w,
        plannedLoad: s.plannedLoad,
        doneLoad: s.doneLoad,
        plannedHours: s.plannedDurationS / 3600,
        doneHours: s.doneDurationS / 3600,
        compliance: s.compliance,
      })
    }
    return { athleteId, fitness: selectFitnessSeries(data, athleteId, today), weekly }
  },
  (_d, id, lastWeek, today) => `analytics:${id}:${lastWeek}:${today}`,
)

// ------------------------------------------------------------------ flags, check-ins, consent

/** Flag lifecycle records for one athlete, newest first. Pass a status to keep one kind. */
export const selectFlagRecords = memoize(
  (data: LareeData, athleteId: AthleteId, status: FlagStatus | undefined): FlagRecord[] =>
    data.flagsState[athleteId].flags
      .filter((f) => status === undefined || f.status === status)
      .toSorted((a, b) => b.openedDay - a.openedDay || a.id.localeCompare(b.id)),
  (_d, id, status) => `flagrecs:${id}:${status ?? 'all'}`,
)

/** Open flags for one athlete, most serious first. Acknowledged and resolved flags are not here. */
export const selectOpenFlags = memoize(
  (data: LareeData, athleteId: AthleteId): FlagRecord[] =>
    selectFlagRecords(data, athleteId, 'open').toSorted(
      (a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] || b.openedDay - a.openedDay,
    ),
  (_d, id) => `openflags:${id}`,
)

/** The number of open flags for one athlete, or for the whole team when no athlete is given. */
export function selectOpenFlagCount(data: LareeData, athleteId?: AthleteId): number {
  return (athleteId ? [athleteId] : ATHLETES).reduce(
    (n, id) => n + data.flagsState[id].flags.filter((f) => f.status === 'open').length,
    0,
  )
}

/** Whether the athlete has a check-in saved for the day. "Not today" is not a check-in. */
export function selectHasCheckedIn(data: LareeData, athleteId: AthleteId, day: DayOffset): boolean {
  return data.checkIns.some((c) => c.athleteId === athleteId && c.day === day)
}

/** Whether the athlete chose "Not today" for the day. */
export function selectCheckInSkipped(data: LareeData, athleteId: AthleteId, day: DayOffset): boolean {
  return data.skippedCheckIns.some((s) => s.athleteId === athleteId && s.day === day)
}

export type AiState = 'off' | 'athlete-only' | 'waiting-for-athlete' | 'active'

/**
 * The consent table in docs/spec/ai.md 2.1. 'athlete-only' reads "On for you. Coach hasn't turned
 * AI on yet." in Me; 'waiting-for-athlete' reads "Waiting for the athlete" in Settings.
 */
export function selectAiState(data: LareeData, athleteId: AthleteId): AiState {
  const athlete = data.settings[athleteId].aiConsent
  const coach = data.settings.coach.aiConsent
  if (athlete && coach) return 'active'
  if (athlete) return 'athlete-only'
  return coach ? 'waiting-for-athlete' : 'off'
}

// ------------------------------------------------------------------ badges, kudos, notes, lookups

/** Badges earned and not yet shown in the badge moment, oldest first. */
export const selectUnseenBadges = memoize(
  (data: LareeData, athleteId: AthleteId): Badge[] => {
    const seen = new Set(data.badgeSeen[athleteId] ?? [])
    return data.badges
      .filter((b) => b.athleteId === athleteId && !seen.has(b.id))
      .toSorted((a, b) => a.earnedDay - b.earnedDay)
  },
  (_d, id) => `unseenbadges:${id}`,
)

/** Kudos the athlete has not seen yet, newest first. */
export const selectUnseenKudos = memoize(
  (data: LareeData, athleteId: AthleteId): Kudos[] =>
    data.kudos.filter((k) => k.athleteId === athleteId && !k.seenByAthlete).toSorted((a, b) => b.day - a.day),
  (_d, id) => `unseenkudos:${id}`,
)

/** Kudos sent about one activity. */
export const selectKudosForActivity = memoize(
  (data: LareeData, activityId: string): Kudos[] => data.kudos.filter((k) => k.activityId === activityId),
  (_d, id) => `kudosact:${id}`,
)

/** The coach's note on an activity, or undefined. */
export const selectActivityCoachNote = (data: LareeData, activityId: string): string | undefined =>
  data.activityNotes[activityId]

/** An athlete's races, soonest first. */
export const selectRaces = memoize(
  (data: LareeData, athleteId: AthleteId): Race[] => mine(data.races, athleteId).toSorted((a, b) => a.day - b.day),
  (_d, id) => `races:${id}`,
)

export const selectActivity = (data: LareeData, id: string): Activity | undefined =>
  data.activities.find((a) => a.id === id)

export const selectPlannedWorkout = (data: LareeData, id: string): PlannedWorkout | undefined =>
  data.planned.find((w) => w.id === id)

export const selectTemplate = (data: LareeData, id: string): WorkoutTemplate | undefined =>
  data.templates.find((t) => t.id === id)

// ------------------------------------------------------------------ small helpers

/** AI runs for an athlete only when both layers are on (docs/spec/ai.md 2.1). */
export function aiActiveFor(settings: Record<'coach' | AthleteId, Settings>, athleteId: AthleteId): boolean {
  return settings.coach.aiConsent && settings[athleteId].aiConsent
}

/** The threshold in force on a day: the latest row of that kind effective on or before it. */
export function thresholdOn(
  data: LareeData,
  athleteId: AthleteId,
  kind: LareeData['thresholds'][number]['kind'],
  day: DayOffset,
): number | undefined {
  return mine(data.thresholds, athleteId)
    .filter((t) => t.kind === kind && t.effectiveFromDay <= day)
    .toSorted((a, b) => b.effectiveFromDay - a.effectiveFromDay)[0]?.value
}

/** Today by the clock, for callers that have no reason to pin the day. */
export const currentDay = (): DayOffset => clockToday()
