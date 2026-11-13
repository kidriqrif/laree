/**
 * What Today shows, worked out from the selectors. Pure: no React. The selectors do the matching,
 * the scoring and the lap; this file only decides which state the screen is in and words it.
 */
import { selectAthleteDay, selectProgress, selectWeek } from '../../../data/selectors.ts'
import type { AthleteDay, PlannedItem } from '../../../data/selectors.ts'
import type { LareeData } from '../../../data/store.ts'
import type { LapState } from '../../../domain/gamification.ts'
import type { LoadThresholds } from '../../../domain/metrics/load.ts'
import { weekOfDay } from '../../../domain/time.ts'
import type { AthleteId, DayOffset, PhaseKind, PlainStep, Race, RepeatStep, Sport, Step } from '../../../domain/types.ts'
import type { SportKey } from '../../../ui/core/index.ts'
import { distanceLabel, durationLabel, targetText } from '../workout/targets.ts'

/**
 * - `first-time`: nothing has ever been planned or logged for this athlete.
 * - `nothing-planned`: the coach has not planned this week at all.
 * - `rest`: the week has a plan and today is left free on purpose.
 * - `sessions`: one or more sessions are planned today.
 */
export type TodayKind = 'first-time' | 'nothing-planned' | 'rest' | 'sessions'

export interface TodayModel {
  kind: TodayKind
  day: DayOffset
  today: AthleteDay
  /** Yesterday's sessions that ended unlogged. They can still be logged. */
  missed: PlannedItem[]
  tomorrow: AthleteDay
  /** Tomorrow's week has a plan, so an empty tomorrow is a rest day rather than "not planned yet". */
  tomorrowPlanned: boolean
  lap: LapState
  race: Race | undefined
  /** The training phase this week sits in, if the plan has one. */
  phase: PhaseKind | undefined
}

export function todayModel(data: LareeData, athleteId: AthleteId, day: DayOffset): TodayModel {
  const today = selectAthleteDay(data, athleteId, day, day)
  const yesterday = selectAthleteDay(data, athleteId, day - 1, day)
  const tomorrow = selectAthleteDay(data, athleteId, day + 1, day)
  const week = selectWeek(data, athleteId, weekOfDay(day), day)
  const nextWeek = weekOfDay(day + 1) === week.week ? week : selectWeek(data, athleteId, weekOfDay(day + 1), day)
  const progress = selectProgress(data, athleteId, day)
  const fresh =
    !data.planned.some((w) => w.athleteId === athleteId) && !data.activities.some((a) => a.athleteId === athleteId)

  let kind: TodayKind
  if (fresh) kind = 'first-time'
  else if (today.planned.length > 0) kind = 'sessions'
  else if (week.unplanned) kind = 'nothing-planned'
  else kind = 'rest'

  return {
    kind,
    day,
    today,
    missed: yesterday.planned.filter((p) => p.evaluation?.status === 'missed'),
    tomorrow,
    tomorrowPlanned: !nextWeek.unplanned,
    lap: progress.lap,
    race: progress.nextRace,
    phase: week.phase?.kind,
  }
}

// ------------------------------------------------------------------ words

export { sessionName, sportName } from '../../shared/activity/format.ts'

export const PHASE_LABEL: Record<PhaseKind, string> = {
  base: 'Base phase',
  build: 'Build phase',
  peak: 'Peak phase',
  taper: 'Taper',
  race: 'Race week',
  recovery: 'Recovery',
}

/** The sport mark's key, or null for "other", which has no glyph. */
export function sportKey(sport: Sport): SportKey | null {
  return sport === 'other' ? null : sport
}

export interface DurationFigure {
  /** "55" or "1:30". */
  value: string
  /** "min" or "h". */
  unit: string
  /** "55 min" or "1 h 30 min", for sentences and accessible names. */
  words: string
}

/** A duration as the big number on the bib: minutes under an hour, h:mm from an hour. */
export function durationFigure(seconds: number): DurationFigure {
  const m = Math.max(0, Math.round(seconds / 60))
  if (m < 60) return { value: String(m), unit: 'min', words: `${m} min` }
  const h = Math.floor(m / 60)
  const rest = m - h * 60
  return { value: `${h}:${String(rest).padStart(2, '0')}`, unit: 'h', words: durationLabel(m * 60) }
}

function sizeOf(step: PlainStep): string {
  if (step.durationS !== undefined) return durationLabel(step.durationS)
  if (step.distanceM !== undefined) return distanceLabel(step.distanceM)
  return ''
}

function targetOf(step: PlainStep, th: LoadThresholds): string | null {
  if (!step.target) return null
  const t = targetText(step.target, th)
  return t.absolute ?? t.basis
}

function line(size: string, target: string | null, prefix = ''): string | null {
  const head = `${prefix}${size}`.trim()
  if (!head) return null
  return target ? `${head} at ${target}` : head
}

/**
 * The main set in one line, in the athlete's own numbers: "3 × 10 min at 4:25-4:39 /km".
 * Repeats first, then a single interval, then the longest steady block with a target.
 * Null for a session without a set structure.
 */
export function mainSetLine(steps: readonly Step[], th: LoadThresholds): string | null {
  const repeat = steps.find((s): s is RepeatStep => s.kind === 'repeat')
  if (repeat) {
    const work = repeat.steps.find((s) => s.kind === 'interval') ?? repeat.steps.find((s) => s.kind === 'steady') ?? repeat.steps[0]
    return work ? line(sizeOf(work), targetOf(work, th), `${repeat.repeat} × `) : null
  }
  const plain = steps.filter((s): s is PlainStep => s.kind !== 'repeat')
  const interval = plain.find((s) => s.kind === 'interval')
  if (interval) return line(sizeOf(interval), targetOf(interval, th))
  const steady = plain
    .filter((s) => s.kind === 'steady' && s.target !== undefined && s.target.kind !== 'rpe')
    .toSorted((a, b) => (b.durationS ?? 0) - (a.durationS ?? 0))[0]
  return steady ? line(sizeOf(steady), targetOf(steady, th)) : null
}

/** "Tasik Olympic Tri. B race. In 4 weeks." */
export function raceLine(race: Race, day: DayOffset): string {
  const days = race.day - day
  let when: string
  if (days <= 0) when = 'Today'
  else if (days === 1) when = 'Tomorrow'
  else if (days < 14) when = `In ${days} days`
  else when = `In ${Math.round(days / 7)} weeks`
  return `${race.name}. ${race.priority} race. ${when}.`
}
