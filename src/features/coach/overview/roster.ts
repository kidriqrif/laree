/**
 * The Overview roster, as plain data: one entry per athlete, the team status counts, the
 * "needs attention" list and the sort order. Everything is read through selectors; nothing
 * here computes a metric of its own.
 */
import { ATHLETES } from '../../../app/people.ts'
import {
  selectAthleteDay,
  selectCheckInSkipped,
  selectEvaluation,
  selectFitnessSeries,
  selectHasCheckedIn,
  selectOpenFlagCount,
  selectOpenFlags,
  selectPlannedWorkout,
  selectRosterRows,
  selectWeek,
} from '../../../data/selectors.ts'
import type { AthleteDay } from '../../../data/selectors.ts'
import type { LareeData } from '../../../data/store.ts'
import type { FlagRecord, Severity } from '../../../domain/flags.ts'
import { band, displayPct, roundHalfAway } from '../../../domain/metrics/compliance.ts'
import { weekOfDay } from '../../../domain/time.ts'
import type { AthleteId, ComplianceBand, DayOffset, PhaseKind, PlannedWorkout, Race } from '../../../domain/types.ts'

/** Ramp above this, in Fitness points a week, gets the caution glyph (IA C1). */
export const RAMP_CAUTION = 8

/** Weekly Fitness points drawn in the trend sparkline. */
export const TREND_WEEKS = 8

/** Key sessions missed this many days back still count as needing attention. */
export const MISSED_WINDOW_DAYS = 7

export const PHASE_LABEL: Record<PhaseKind, string> = {
  base: 'Base',
  build: 'Build',
  peak: 'Peak',
  taper: 'Taper',
  race: 'Race week',
  recovery: 'Recovery',
}

export const SEVERITY_LABEL: Record<Severity, string> = { act: 'Act', watch: 'Watch', info: 'Info' }
const SEVERITY_RANK: Record<Severity, number> = { info: 0, watch: 1, act: 2 }

export interface RosterEntry {
  id: AthleteId
  name: string
  /** Roster order, for ties. */
  index: number
  /** True when this athlete's data could not be read. The other fields are then empty. */
  error: boolean
  race: Race | undefined
  daysToRace: number | null
  phase: PhaseKind | null
  /** This week so far, rounded to one decimal place, or null when nothing is due. */
  compliance: number | null
  /** The whole percentage shown, rounded away from 100. */
  complianceShown: number | null
  complianceBand: ComplianceBand | null
  day: AthleteDay | null
  checkedInToday: boolean
  skippedToday: boolean
  lastCheckInDay: DayOffset | null
  daysSinceCheckIn: number | null
  fitness: number | null
  fatigue: number | null
  form: number | null
  ramp: number | null
  /** Fitness at the same weekday over the last weeks, oldest first. */
  trend: (number | null)[]
  /** Open flags, most serious first. */
  flags: FlagRecord[]
}

function emptyEntry(id: AthleteId, name: string, index: number): RosterEntry {
  return {
    id,
    name,
    index,
    error: true,
    race: undefined,
    daysToRace: null,
    phase: null,
    compliance: null,
    complianceShown: null,
    complianceBand: null,
    day: null,
    checkedInToday: false,
    skippedToday: false,
    lastCheckInDay: null,
    daysSinceCheckIn: null,
    fitness: null,
    fatigue: null,
    form: null,
    ramp: null,
    trend: [],
    flags: [],
  }
}

/**
 * One entry per athlete. If one athlete's data cannot be read, that entry says so and the
 * others still build (IA C1, states).
 */
export function rosterEntries(data: LareeData, today: DayOffset): RosterEntry[] {
  let rows: ReturnType<typeof selectRosterRows> = []
  try {
    rows = selectRosterRows(data, today)
  } catch {
    rows = []
  }
  return ATHLETES.map((athlete, index): RosterEntry => {
    try {
      const row = rows.find((r) => r.athleteId === athlete.id)
      if (!row) return emptyEntry(athlete.id, athlete.name, index)
      const series = selectFitnessSeries(data, athlete.id, today)
      const byDay = new Map(series.map((p) => [p.day, p.fitness]))
      const trend: (number | null)[] = []
      for (let w = TREND_WEEKS - 1; w >= 0; w--) trend.push(byDay.get(today - 7 * w) ?? null)
      const pct = row.compliance === null ? null : roundHalfAway(row.compliance, 1)
      return {
        id: athlete.id,
        name: athlete.name,
        index,
        error: false,
        race: row.nextRace,
        daysToRace: row.nextRace ? row.nextRace.day - today : null,
        phase: selectWeek(data, athlete.id, weekOfDay(today), today).phase?.kind ?? null,
        compliance: pct,
        complianceShown: pct === null ? null : displayPct(pct),
        complianceBand: pct === null ? null : band(pct),
        day: selectAthleteDay(data, athlete.id, today, today),
        checkedInToday: selectHasCheckedIn(data, athlete.id, today),
        skippedToday: selectCheckInSkipped(data, athlete.id, today),
        lastCheckInDay: row.lastCheckInDay,
        daysSinceCheckIn: row.daysSinceCheckIn,
        fitness: byDay.has(today) ? row.fitness : null,
        fatigue: byDay.has(today) ? row.fatigue : null,
        form: byDay.has(today) ? row.form : null,
        ramp: byDay.has(today) ? row.ramp : null,
        trend,
        flags: selectOpenFlags(data, athlete.id),
      }
    } catch {
      return emptyEntry(athlete.id, athlete.name, index)
    }
  })
}

// ---------------------------------------------------------------- status line

export interface TeamStatus {
  openFlags: number
  missingCheckIns: number
  sessionsToday: number
}

/** The morning answer: open flags, check-ins missing today and sessions planned today. */
export function teamStatus(data: LareeData, today: DayOffset): TeamStatus {
  let missingCheckIns = 0
  let sessionsToday = 0
  for (const a of ATHLETES) {
    if (!selectHasCheckedIn(data, a.id, today)) missingCheckIns += 1
    sessionsToday += selectAthleteDay(data, a.id, today, today).planned.length
  }
  return { openFlags: selectOpenFlagCount(data), missingCheckIns, sessionsToday }
}

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`

/** The status line as three plain-English phrases. */
export function statusPhrases(s: TeamStatus): { flags: string; checkIns: string; sessions: string } {
  return {
    flags: s.openFlags === 0 ? 'No open flags' : plural(s.openFlags, 'open flag', 'open flags'),
    checkIns:
      s.missingCheckIns === 0 ? 'No check-ins missing' : plural(s.missingCheckIns, 'check-in missing', 'check-ins missing'),
    sessions: s.sessionsToday === 0 ? 'No sessions today' : plural(s.sessionsToday, 'session today', 'sessions today'),
  }
}

// ---------------------------------------------------------------- needs attention

export type AttentionItem =
  | { kind: 'flag'; athleteId: AthleteId; name: string; flag: FlagRecord }
  | { kind: 'missed'; athleteId: AthleteId; name: string; workout: PlannedWorkout }

/** Open flags (most serious first), then key sessions missed in the last 7 days (latest first). */
export function attentionItems(data: LareeData, entries: readonly RosterEntry[], today: DayOffset): AttentionItem[] {
  const flags: AttentionItem[] = entries
    .flatMap((e) => e.flags.map((flag) => ({ kind: 'flag' as const, athleteId: e.id, name: e.name, flag })))
    .toSorted((a, b) =>
      a.kind === 'flag' && b.kind === 'flag'
        ? SEVERITY_RANK[b.flag.severity] - SEVERITY_RANK[a.flag.severity] || b.flag.openedDay - a.flag.openedDay
        : 0,
    )
  const missed: AttentionItem[] = []
  for (const e of entries) {
    if (e.error) continue
    let planned
    try {
      planned = selectEvaluation(data, e.id, today).planned
    } catch {
      continue
    }
    for (const ev of planned) {
      if (ev.status !== 'missed') continue
      const workout = selectPlannedWorkout(data, ev.plannedId)
      if (!workout?.keySession || workout.day < today - MISSED_WINDOW_DAYS || workout.day > today) continue
      missed.push({ kind: 'missed', athleteId: e.id, name: e.name, workout })
    }
  }
  missed.sort((a, b) => (a.kind === 'missed' && b.kind === 'missed' ? b.workout.day - a.workout.day : 0))
  return [...flags, ...missed]
}

// ---------------------------------------------------------------- sorting

export type SortColumn =
  | 'athlete'
  | 'race'
  | 'days'
  | 'phase'
  | 'week'
  | 'checkin'
  | 'fitness'
  | 'fatigue'
  | 'form'
  | 'ramp'
  | 'flags'

export type SortDirection = 'ascending' | 'descending'

export interface RosterSort {
  column: SortColumn
  direction: SortDirection
}

type Value = string | number | null

/** The value each sortable column sorts by. Cells may show more, never something else. */
export const SORT_VALUE: Record<SortColumn, (e: RosterEntry) => Value> = {
  athlete: (e) => e.name,
  race: (e) => e.race?.day ?? null,
  days: (e) => e.daysToRace,
  phase: (e) => (e.phase ? PHASE_LABEL[e.phase] : null),
  week: (e) => e.compliance,
  checkin: (e) => e.daysSinceCheckIn,
  fitness: (e) => e.fitness,
  fatigue: (e) => e.fatigue,
  form: (e) => e.form,
  ramp: (e) => e.ramp,
  // Count first, then the most serious flag, so two flags outrank one.
  flags: (e) => (e.error ? null : e.flags.length * 10 + (e.flags[0] ? SEVERITY_RANK[e.flags[0].severity] : 0)),
}

const COLUMNS = new Set<string>(Object.keys(SORT_VALUE))

/** "Who needs me today?": most flags first. */
export const DEFAULT_SORT: RosterSort = { column: 'flags', direction: 'descending' }

/** The saved preference key (IA 9.2: roster sort lives in app state). */
export const SORT_PREF = 'rosterSort'

export function parseSort(raw: unknown): RosterSort {
  if (typeof raw !== 'string') return DEFAULT_SORT
  const [column = '', direction = 'ascending'] = raw.split(':')
  if (!COLUMNS.has(column) || (direction !== 'ascending' && direction !== 'descending')) return DEFAULT_SORT
  return { column: column as SortColumn, direction }
}

export const formatSort = (s: RosterSort): string => `${s.column}:${s.direction}`

/** Same rule as the results-sheet table: empty values last when ascending, numbers by size. */
function compare(a: Value, b: Value): number {
  if (a == null && b == null) return 0
  if (a == null) return 1
  if (b == null) return -1
  if (typeof a === 'number' && typeof b === 'number') return a - b
  return String(a).localeCompare(String(b), 'en-GB', { numeric: true, sensitivity: 'base' })
}

/** Missing check-in first, then roster order: the tie-break under any sort. */
function byNeed(a: RosterEntry, b: RosterEntry): number {
  return Number(a.checkedInToday) - Number(b.checkedInToday) || a.index - b.index
}

export function sortEntries(entries: readonly RosterEntry[], sort: RosterSort): RosterEntry[] {
  const value = SORT_VALUE[sort.column]
  const dir = sort.direction === 'descending' ? -1 : 1
  return entries.toSorted(byNeed).toSorted((x, y) => dir * compare(value(x), value(y)))
}
