/**
 * The one facts builder (docs/spec/ai.md 3). It reads summaries Laree already shows and nothing more:
 * no names, notes, coordinates, real dates or other athletes. Days are weekdays and relative weeks.
 */
import { selectFitnessSeries, selectOpenFlags, selectWeek } from '../data/selectors.ts'
import { ATHLETES } from '../data/seed/people.ts'
import type { LareeData } from '../data/store.ts'
import { RULES, summariseValues } from '../domain/flags.ts'
import { weekOfDay, weekRange, weekdayIndex } from '../domain/time.ts'
import type { AthleteId, DayOffset, PhaseKind, Sport } from '../domain/types.ts'

export const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const

export interface FactsSession {
  id: string
  weekday: string
  sport: Sport
  title: string
  durationS: number
  load: number
  key: boolean
}

export interface RaceFact {
  name: string
  priority: 'A' | 'B' | 'C'
  weeksTo: number
}

export interface RecapFacts {
  athleteId: AthleteId
  weeksAgo: number
  plannedCount: number
  doneCount: number
  activityCount: number
  plannedDurationS: number
  doneDurationS: number
  plannedLoad: number
  doneLoad: number
  compliance: number | null
  fitnessEnd: number
  formEnd: number
  nextKeySessions: FactsSession[]
  race: RaceFact | null
  downWeek: boolean
}

export interface CheckInFacts {
  athleteId: AthleteId
  checkInsLast7: number
  baselineRestingHr: number
  baselineHrvMs: number
  /** Oldest first, last 14 days. */
  recent: Array<{
    weekday: string
    sleepHours: number
    soreness: number
    mood: number
    restingHr?: number
    hrvMs?: number
  }>
  flags: Array<{ ruleId: string; text: string }>
  missedKeySessions: number
}

export interface TemplateFact {
  id: string
  title: string
  sport: Sport
  durationS: number
  load: number
}

export interface SuggestFacts {
  athleteId: AthleteId
  historyDays: number
  firstDay: DayOffset
  nextWeek: FactsSession[]
  form: number
  ramp: number
  phase: PhaseKind | null
  downWeek: boolean
  flagRuleIds: string[]
  raceWeekdays: string[]
  race: RaceFact | null
  sports: Sport[]
  templates: TemplateFact[]
}

const dayName = (day: DayOffset): string => WEEKDAYS[weekdayIndex(day)] ?? 'Monday'

function weekSessions(data: LareeData, athleteId: AthleteId, week: number, today: DayOffset): FactsSession[] {
  const w = selectWeek(data, athleteId, week, today)
  return w.days.flatMap((d) =>
    d.planned.map(({ workout: p }) => ({
      id: p.id,
      weekday: dayName(p.day),
      sport: p.sport,
      title: p.title,
      durationS: p.plannedDurationS,
      load: p.plannedLoad,
      key: p.keySession,
    })),
  )
}

function nextRace(data: LareeData, athleteId: AthleteId, today: DayOffset): RaceFact | null {
  const r = data.races
    .filter((x) => x.athleteId === athleteId && x.day >= today)
    .toSorted((a, b) => a.day - b.day)[0]
  return r ? { name: r.name, priority: r.priority, weeksTo: Math.max(0, weekOfDay(r.day) - weekOfDay(today)) } : null
}

export function buildRecapFacts(data: LareeData, athleteId: AthleteId, week: number, today: DayOffset): RecapFacts {
  const w = selectWeek(data, athleteId, week, today)
  const series = selectFitnessSeries(data, athleteId, today)
  const { lastDay } = weekRange(week)
  const end = series.find((p) => p.day === Math.min(lastDay, today))
  return {
    athleteId,
    weeksAgo: weekOfDay(today) - week,
    plannedCount: w.days.reduce((n, d) => n + d.planned.length, 0),
    doneCount: w.days.reduce((n, d) => n + d.planned.filter((p) => p.evaluation?.status === 'matched').length, 0),
    activityCount: w.days.reduce((n, d) => n + d.activities.length, 0),
    plannedDurationS: w.plannedDurationS,
    doneDurationS: w.doneDurationS,
    plannedLoad: w.plannedLoad,
    doneLoad: w.doneLoad,
    compliance: w.compliance,
    fitnessEnd: end?.fitness ?? 0,
    formEnd: end?.form ?? 0,
    nextKeySessions: weekSessions(data, athleteId, week + 1, today).filter((s) => s.key),
    race: nextRace(data, athleteId, today),
    downWeek: w.target?.downWeek === true,
  }
}

export function buildCheckInFacts(data: LareeData, athleteId: AthleteId, today: DayOffset): CheckInFacts {
  const base = ATHLETES.find((a) => a.id === athleteId)?.baselines ?? { restingHr: 0, hrvMs: 0 }
  const recent = data.checkIns
    .filter((c) => c.athleteId === athleteId && c.day <= today && c.day > today - 14)
    .toSorted((a, b) => a.day - b.day)
  const thisWeek = weekOfDay(today)
  const missed = [thisWeek - 1, thisWeek].reduce(
    (n, wk) =>
      n +
      selectWeek(data, athleteId, wk, today).days.reduce(
        (m, d) => m + d.planned.filter((p) => p.workout.keySession && p.evaluation?.band === 'missed').length,
        0,
      ),
    0,
  )
  return {
    athleteId,
    checkInsLast7: recent.filter((c) => c.day > today - 7).length,
    baselineRestingHr: base.restingHr,
    baselineHrvMs: base.hrvMs,
    recent: recent.map((c) => ({
      weekday: dayName(c.day),
      sleepHours: c.sleepHours,
      soreness: c.soreness,
      mood: c.mood,
      ...(c.restingHr === undefined ? {} : { restingHr: c.restingHr }),
      ...(c.hrvMs === undefined ? {} : { hrvMs: c.hrvMs }),
    })),
    flags: selectOpenFlags(data, athleteId).map((f) => ({ ruleId: f.ruleId, text: `${RULES[f.ruleId].title}, ${summariseValues(f.ruleId, f.valuesLatest)}` })),
    missedKeySessions: missed,
  }
}

export function buildSuggestFacts(data: LareeData, athleteId: AthleteId, today: DayOffset): SuggestFacts {
  const nextWeekNo = weekOfDay(today) + 1
  const { firstDay, lastDay } = weekRange(nextWeekNo)
  const now = selectFitnessSeries(data, athleteId, today).find((p) => p.day === today)
  const w = selectWeek(data, athleteId, nextWeekNo, today)
  const sports = new Set<Sport>()
  for (const a of data.activities) {
    if (a.athleteId === athleteId && a.day > today - 28 && a.day <= today) sports.add(a.sport)
  }
  const phase = w.phase?.kind ?? null
  const templates = data.templates
    .filter((t) => phase === null || t.tags.phase === undefined || t.tags.phase === phase)
    .slice(0, 40)
    .map((t) => ({ id: t.id, title: t.name, sport: t.sport, durationS: t.estimatedDurationS, load: t.estimatedLoad }))
  return {
    athleteId,
    historyDays: today,
    firstDay,
    nextWeek: weekSessions(data, athleteId, nextWeekNo, today),
    form: now?.form ?? 0,
    ramp: now?.ramp ?? 0,
    phase,
    downWeek: w.target?.downWeek === true,
    flagRuleIds: selectOpenFlags(data, athleteId).map((f) => f.ruleId),
    raceWeekdays: data.races
      .filter((r) => r.athleteId === athleteId && r.day >= firstDay && r.day <= lastDay)
      .map((r) => dayName(r.day)),
    race: nextRace(data, athleteId, today),
    sports: [...sports].toSorted(),
    templates,
  }
}
