/**
 * The pure part of the log sheet: which sessions it offers, and how each way in builds an Activity.
 * Nothing here reads the clock (the caller passes today and now) or touches the store.
 */
import { thresholdsOn } from '../../../data/seed/people.ts'
import { selectEvaluation } from '../../../data/selectors.ts'
import type { LareeData } from '../../../data/store.ts'
import { DEFAULT_INTENSITY, sessionLoad } from '../../../domain/metrics/load.ts'
import type { LoadInput, LoadThresholds } from '../../../domain/metrics/load.ts'
import { streamDigest } from '../../../domain/metrics/streamDigest.ts'
import { dateToDay, dayToDate, KL_OFFSET_MS } from '../../../domain/time.ts'
import type { Activity, ActivitySummary, AthleteId, DayOffset, LoadResult, PlannedWorkout, Sport } from '../../../domain/types.ts'
import type { ParsedActivity } from '../../../io/import/types.ts'

export const NOT_PLANNED = 'none'
const DAY_MS = 86_400_000
export const LOG_BACK_DAYS = 7

export const SPORT_NAMES: Record<Sport, string> = {
  swim: 'Swim',
  bike: 'Bike',
  run: 'Run',
  strength: 'Strength',
  other: 'Other',
}

export const SPORTS: Sport[] = ['swim', 'bike', 'run', 'strength', 'other']

export const EFFORT_NAMES = [
  'Very easy',
  'Easy',
  'Light',
  'Moderate',
  'Steady',
  'Somewhat hard',
  'Hard',
  'Very hard',
  'Near maximum',
  'All out',
] as const

const METHOD_NAMES: Record<LoadResult['method'], string> = {
  power: 'power',
  pace: 'pace',
  swim: 'swim pace',
  heartRate: 'heart rate',
  effort: 'effort',
  duration: 'duration only',
}

/** "Load 62, from pace, medium confidence". */
export function loadLine(load: LoadResult): string {
  return `Load ${Math.round(load.load)}, from ${METHOD_NAMES[load.method]}, ${load.confidence} confidence`
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "Tue 10 Nov". */
export function dayText(day: DayOffset): string {
  const d = dayToDate(day)
  return `${WEEKDAYS[d.getUTCDay()] ?? ''} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()] ?? ''}`
}

/** "3 Mar 2026". */
export function dayTextYear(day: DayOffset): string {
  const d = dayToDate(day)
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()] ?? ''} ${d.getUTCFullYear()}`
}

export function dayLabel(day: DayOffset, today: DayOffset): string {
  if (day === today) return 'Today'
  if (day === today - 1) return 'Yesterday'
  return dayText(day)
}

export function clockText(minute: number): string {
  const m = ((Math.round(minute) % 1440) + 1440) % 1440
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

export function durationText(s: number): string {
  const total = Math.round(s)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  if (h > 0) return `${h} h ${String(m).padStart(2, '0')} min`
  return `${m} min`
}

export function distanceText(m: number): string {
  return `${(m / 1000).toFixed(m < 10_000 ? 2 : 1)} km`
}

/** Pace as m:ss per km (foot) or per 100 m (swim). */
export function paceText(sport: Sport, speedMps: number): string | null {
  if (!(speedMps > 0)) return null
  const perUnit = sport === 'swim' ? 100 / speedMps : 1000 / speedMps
  const s = Math.round(perUnit)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')} /${sport === 'swim' ? '100 m' : 'km'}`
}

export interface MatchOption {
  workout: PlannedWorkout
  /** Already matched by a logged session. */
  logged: boolean
}

/**
 * Sessions the sheet offers: today's, and unlogged ones from the last 7 days. Today first, then newest.
 * `alsoId` is the session the athlete opened the sheet from ("Log it"): it stays on offer when it is
 * older than that, so the log lands on the session they chose and not on a stand-in.
 */
export function matchOptions(data: LareeData, athleteId: AthleteId, today: DayOffset, alsoId?: string): MatchOption[] {
  const ev = selectEvaluation(data, athleteId, today)
  const loggedIds = new Set(ev.planned.filter((e) => e.activityId !== undefined).map((e) => e.plannedId))
  return data.planned
    .filter((w) => w.athleteId === athleteId && w.day <= today && (w.day >= today - LOG_BACK_DAYS || w.id === alsoId))
    .filter((w) => w.day === today || !loggedIds.has(w.id))
    .toSorted((a, b) => (a.day === today ? 0 : 1) - (b.day === today ? 0 : 1) || b.day - a.day || a.order - b.order)
    .map((workout) => ({ workout, logged: loggedIds.has(workout.id) }))
}

/** The pre-matched session if it is on offer, else today's first unlogged session, else "Not planned". */
export function defaultMatch(options: readonly MatchOption[], prematched: string | undefined, today: DayOffset): string {
  if (prematched && options.some((o) => o.workout.id === prematched)) return prematched
  const todays = options.filter((o) => o.workout.day === today)
  return (todays.find((o) => !o.logged) ?? todays[0])?.workout.id ?? NOT_PLANNED
}

export function matchLabel(o: MatchOption, today: DayOffset): string {
  return `${dayLabel(o.workout.day, today)} · ${SPORT_NAMES[o.workout.sport]} · ${o.workout.title}${o.logged ? ' (logged)' : ''}`
}

/** The log the chosen session already has, if any. */
export function existingFor(data: LareeData, athleteId: AthleteId, workoutId: string | undefined, today: DayOffset): Activity | undefined {
  if (!workoutId) return undefined
  const e = selectEvaluation(data, athleteId, today).planned.find((p) => p.plannedId === workoutId)
  return e?.activityId ? data.activities.find((a) => a.id === e.activityId) : undefined
}

export function thresholdsFor(data: LareeData, athleteId: AthleteId, day: DayOffset): LoadThresholds {
  return thresholdsOn(athleteId, day, data.thresholds)
}

/** A new, unused id for a log: stable for the same day and the same count. */
export function newActivityId(data: LareeData, athleteId: AthleteId, kind: 'q' | 'i' | 's', day: DayOffset): string {
  const prefix = `${athleteId}-${kind}-${day}-`
  const taken = new Set(data.activities.map((a) => a.id))
  let n = data.activities.filter((a) => a.id.startsWith(prefix)).length
  while (taken.has(`${prefix}${n}`)) n++
  return `${prefix}${n}`
}

/** Start time for a log with no time of its own: the plan's, or 07:00, kept before "now" on today. */
export function defaultStartMinute(workout: PlannedWorkout | undefined, day: DayOffset, today: DayOffset, nowMin: number, durationS: number): number {
  if (workout?.startMinute !== undefined) return workout.startMinute
  const wanted = 7 * 60
  if (day !== today) return wanted
  return Math.max(0, Math.min(wanted, nowMin - Math.ceil(durationS / 60) - 5))
}

// ------------------------------------------------------------------ quick log

export interface QuickInput {
  sport: Sport
  durationS: number
  /** Metres, when given. */
  distanceM?: number
  rpe: number
  thresholds: LoadThresholds
}

/** Load as the quick log would save it. Used live in the sheet and again on save, so they always agree. */
export function quickLoad(q: QuickInput): { load: LoadResult; summary: ActivitySummary } {
  const summary: ActivitySummary = { durationS: Math.round(q.durationS), movingTimeS: Math.round(q.durationS) }
  const input: LoadInput = { sport: q.sport, timerS: Math.round(q.durationS), thresholds: q.thresholds, rpe: q.rpe }
  if (q.distanceM !== undefined && q.distanceM > 0) {
    summary.distanceM = Math.round(q.distanceM)
    summary.avgSpeedMps = Math.round((q.distanceM / q.durationS) * 1000) / 1000
    input.summary = { distanceM: summary.distanceM }
  }
  return { load: sessionLoad(input), summary }
}

export interface QuickBuild extends QuickInput {
  id: string
  athleteId: AthleteId
  day: DayOffset
  startMinute: number
  title: string
  note: string
  matchedWorkoutId?: string
}

export function buildQuickActivity(b: QuickBuild): Activity {
  const { load, summary } = quickLoad(b)
  const a: Activity = {
    id: b.id,
    athleteId: b.athleteId,
    day: b.day,
    startMinute: b.startMinute,
    sport: b.sport,
    title: b.title,
    source: 'manual',
    summary,
    load,
    rpe: b.rpe,
  }
  const note = b.note.trim()
  if (note) a.notes = note
  if (b.matchedWorkoutId) a.matchedWorkoutId = b.matchedWorkoutId
  return a
}

// ------------------------------------------------------------------ simulated sync

function hash(text: string): number {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

export interface SyncBuild {
  id: string
  athleteId: AthleteId
  day: DayOffset
  startMinute: number
  sport: Sport
  workout?: PlannedWorkout
  thresholds: LoadThresholds
}

/** What a watch might have recorded for the plan: close to it, a little over or under, the same every time. */
export function buildSyncedActivity(b: SyncBuild): Activity {
  const key = b.workout?.id ?? `${b.athleteId}:${b.day}:${b.sport}`
  const wobble = 0.97 + (hash(key) % 700) / 10_000
  const durationS = Math.max(600, Math.round(((b.workout?.plannedDurationS ?? 45 * 60) * wobble) / 60) * 60)
  const th = b.thresholds
  const i = Math.round(DEFAULT_INTENSITY[b.sport] * wobble * 100) / 100
  const rest = th.restingHr ?? 50
  const lthr = th.lthr ?? 165
  const avgHr = Math.round(rest + (lthr - rest) * (b.sport === 'strength' ? 0.42 : Math.min(0.97, 0.18 + 0.8 * i)))
  const summary: ActivitySummary = {
    durationS,
    movingTimeS: Math.round(durationS * (b.sport === 'bike' ? 0.985 : 0.995)),
    avgHr,
    maxHr: Math.round(avgHr + (b.sport === 'strength' ? 20 : 12 + 16 * i)),
  }
  const input: LoadInput = { sport: b.sport, timerS: durationS, thresholds: th }
  if (b.sport === 'bike') {
    const wp = Math.round(i * (th.ftp ?? 250))
    summary.weightedPowerW = wp
    summary.avgPowerW = Math.round(wp * 0.93)
    summary.intensity = i
    summary.avgSpeedMps = Math.round((6.6 + 3.6 * i) * 100) / 100
    summary.distanceM = Math.round(summary.avgSpeedMps * durationS)
    summary.cadence = 86 + (hash(`${key}c`) % 6)
    input.summary = { weightedPowerW: wp }
  } else if (b.sport === 'run') {
    const v = Math.round(i * (1000 / (th.thresholdPaceSPerKm ?? 265)) * 1000) / 1000
    summary.avgSpeedMps = v
    summary.distanceM = Math.round(v * durationS)
    summary.intensity = i
    summary.cadence = 170 + (hash(`${key}c`) % 6)
    input.summary = { distanceM: summary.distanceM }
  } else if (b.sport === 'swim') {
    const v = Math.round(i * (100 / (th.cssSPer100m ?? 108)) * 1000) / 1000
    summary.avgSpeedMps = v
    summary.distanceM = Math.round((v * durationS) / 25) * 25
    summary.intensity = i
    input.summary = { distanceM: summary.distanceM }
  } else {
    input.rpe = 6
  }
  const load = sessionLoad(input)
  const a: Activity = {
    id: b.id,
    athleteId: b.athleteId,
    day: b.day,
    startMinute: b.startMinute,
    sport: b.sport,
    title: b.workout?.title ?? `${SPORT_NAMES[b.sport]} session`,
    source: 'simulatedDevice',
    summary,
    load,
  }
  if (b.sport === 'strength' || b.sport === 'other') a.rpe = 6
  if (b.workout) a.matchedWorkoutId = b.workout.id
  return a
}

// ------------------------------------------------------------------ imported file

export function startOf(p: ParsedActivity): { day: DayOffset; startMinute: number } {
  const ms = Date.parse(p.startUtc)
  const local = ms + KL_OFFSET_MS
  return { day: dateToDay(new Date(ms)), startMinute: Math.floor((((local % DAY_MS) + DAY_MS) % DAY_MS) / 60_000) }
}

const finiteOrNull = (n: number | null | undefined): number | undefined =>
  n !== null && n !== undefined && Number.isFinite(n) ? n : undefined

export interface ImportBuild {
  id: string
  athleteId: AthleteId
  parsed: ParsedActivity
  sport: Sport
  /** 1 to 10, optional. */
  rpe?: number
  thresholds: LoadThresholds
  title: string
  matchedWorkoutId?: string
  /** A quick log this file replaces: its effort and note are kept. */
  replaces?: Activity
}

export function importLoad(p: ParsedActivity, sport: Sport, thresholds: LoadThresholds, rpe?: number): LoadResult {
  const input: LoadInput = { sport, timerS: p.timerSeconds, thresholds }
  if (rpe !== undefined) input.rpe = rpe
  if (p.setting === 'treadmill') input.treadmill = true
  if (p.setting === 'openWater') input.openWater = true
  const summary: NonNullable<LoadInput['summary']> = {}
  if (p.summaryWeightedPowerW !== null) summary.weightedPowerW = p.summaryWeightedPowerW
  if (p.distanceM !== null) summary.distanceM = p.distanceM
  input.summary = summary
  const s = p.streams
  if (s) {
    input.streams = {
      ...(s.power ? { powerW: Array.from(s.power) } : {}),
      ...(s.hr ? { hrBpm: Array.from(s.hr) } : {}),
      ...(s.distance ? { distanceM: Array.from(s.distance) } : {}),
      ...(s.altitude ? { altitudeM: Array.from(s.altitude) } : {}),
    }
  }
  return sessionLoad(input)
}

export function buildImportedActivity(b: ImportBuild): Activity {
  const p = b.parsed
  const rpe = b.rpe ?? b.replaces?.rpe
  const load = importLoad(p, b.sport, b.thresholds, rpe)
  const summary: ActivitySummary = { durationS: Math.round(p.timerSeconds), movingTimeS: Math.round(p.summary.movingSeconds) }
  const set = <K extends keyof ActivitySummary>(k: K, v: ActivitySummary[K] | undefined) => {
    if (v !== undefined) summary[k] = v
  }
  set('distanceM', finiteOrNull(p.distanceM))
  set('elevationGainM', finiteOrNull(p.ascentM))
  set('avgHr', finiteOrNull(p.summary.avgHr))
  set('maxHr', finiteOrNull(p.summary.maxHr))
  set('avgPowerW', finiteOrNull(p.summary.avgPowerW))
  set('weightedPowerW', finiteOrNull(load.weightedPowerW ?? p.summaryWeightedPowerW))
  set('intensity', finiteOrNull(load.intensity))
  set('avgSpeedMps', finiteOrNull(p.summary.avgSpeedMps))
  set('cadence', finiteOrNull(p.summary.avgCadence))
  const { day, startMinute } = startOf(p)
  const a: Activity = {
    id: b.id,
    athleteId: b.athleteId,
    day,
    startMinute,
    sport: b.sport,
    title: b.title,
    source: 'file',
    summary,
    load,
  }
  if (rpe !== undefined) a.rpe = rpe
  if (b.replaces?.notes) a.notes = b.replaces.notes
  if (b.matchedWorkoutId) a.matchedWorkoutId = b.matchedWorkoutId
  // The per-second stream is not stored, so keep what Analytics needs from it: zones and best efforts.
  // Always set, even when empty: it also marks the activity as an import, so a seeded stream is never shown for it.
  const s = p.streams
  a.streamDigest = streamDigest(
    b.sport,
    s ? { powerW: s.power, hrBpm: s.hr, speedMps: s.speed, distanceM: s.distance } : {},
    b.thresholds,
  )
  return a
}

export type ImportIssue =
  | { kind: 'future'; text: string }
  | { kind: 'too-old'; text: string }
  | { kind: 'duplicate'; text: string; activityId: string }

/** Whether a parsed session can be placed, per io.md 12.1: not in the future, not before the runtime start, not already saved. */
export function importIssue(
  p: ParsedActivity,
  sport: Sport,
  data: LareeData,
  athleteId: AthleteId,
  today: DayOffset,
  ignoreId?: string,
): ImportIssue | null {
  const { day, startMinute } = startOf(p)
  if (day > today) {
    return {
      kind: 'future',
      text: `This session starts on ${dayText(day)}, which hasn't happened yet. Check the date and time zone on your device.`,
    }
  }
  if (day < 0) {
    return {
      kind: 'too-old',
      text: `This session is from ${dayTextYear(day)}. The prototype keeps 16 weeks, from ${dayTextYear(0)}, so it can't place it.`,
    }
  }
  const dup = data.activities.find(
    (a) => a.athleteId === athleteId && a.id !== ignoreId && a.sport === sport && a.day === day && Math.abs(a.startMinute - startMinute) <= 1,
  )
  if (dup) {
    return {
      kind: 'duplicate',
      activityId: dup.id,
      text: `You already have this session: ${SPORT_NAMES[dup.sport]}, ${dayText(dup.day)}, ${clockText(dup.startMinute)}.`,
    }
  }
  return null
}

export function importTitle(workout: PlannedWorkout | undefined, sport: Sport, matched: boolean): string {
  return matched && workout ? workout.title : `${SPORT_NAMES[sport]} session`
}
