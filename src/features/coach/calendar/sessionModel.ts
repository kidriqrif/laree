/** Pure helpers for the calendar: step summaries, edit patches and new sessions. */
import { fmtMinutesWords } from '../../../charts/index.ts'
import { useLaree } from '../../../data/store.ts'
import { workoutTotals } from '../../../domain/steps.ts'
import type { AthleteId, DayOffset, PlainStep, PlannedWorkout, Sport, Step } from '../../../domain/types.ts'

export const SPORT_OPTIONS: ReadonlyArray<{ id: Sport; label: string }> = [
  { id: 'swim', label: 'Swim' },
  { id: 'bike', label: 'Bike' },
  { id: 'run', label: 'Run' },
  { id: 'strength', label: 'Strength' },
  { id: 'other', label: 'Other' },
]

export const sportLabel = (sport: Sport): string => SPORT_OPTIONS.find((o) => o.id === sport)?.label ?? 'Other'

const KIND_LABEL: Record<PlainStep['kind'], string> = {
  warmup: 'Warm-up',
  steady: 'Steady',
  interval: 'Interval',
  recovery: 'Recovery',
  cooldown: 'Cool-down',
}

function plainText(step: PlainStep): string {
  const amount =
    step.durationS !== undefined
      ? fmtMinutesWords(step.durationS / 60)
      : step.distanceM !== undefined
        ? `${Math.round(step.distanceM) / 1000} km`
        : ''
  const base = `${KIND_LABEL[step.kind]} ${amount}`.trim()
  return step.note ? `${base} (${step.note})` : base
}

/** Steps as one plain sentence, for the editor and the chips. Empty for a free session. */
export function summariseSteps(steps: readonly Step[]): string {
  return steps
    .map((s) => (s.kind === 'repeat' ? `${s.repeat} x (${s.steps.map(plainText).join(', ')})` : plainText(s)))
    .join('; ')
}

export interface EditorValues {
  title: string
  sport: Sport
  durationS: number
  stepsSummary: string
  note: string
  keySession: boolean
}

export function valuesOf(w: PlannedWorkout): EditorValues {
  return {
    title: w.title,
    sport: w.sport,
    durationS: w.plannedDurationS,
    stepsSummary: summariseSteps(w.steps),
    note: w.coachNote ?? '',
    keySession: w.keySession,
  }
}

export interface EditorErrors {
  title?: string
  duration?: string
}

export function validate(v: EditorValues): EditorErrors {
  const errors: EditorErrors = {}
  if (v.title.trim() === '') errors.title = 'Give the session a title.'
  if (!(v.durationS > 0)) errors.duration = 'Duration must be more than zero.'
  return errors
}

export function isDirty(a: EditorValues, b: EditorValues): boolean {
  return (
    a.title !== b.title ||
    a.sport !== b.sport ||
    a.durationS !== b.durationS ||
    a.stepsSummary !== b.stepsSummary ||
    a.note !== b.note ||
    a.keySession !== b.keySession
  )
}

/**
 * The store patch for an edit. Steps are kept as they are unless the summary text changed; then
 * they become one steady step carrying the text. A free session gets its load from the default
 * rule; a session with steps has its load scaled with the duration.
 */
export function buildPatch(w: PlannedWorkout, v: EditorValues): Partial<Omit<PlannedWorkout, 'id' | 'athleteId'>> {
  const original = valuesOf(w)
  const patch: Partial<Omit<PlannedWorkout, 'id' | 'athleteId'>> = {
    title: v.title.trim(),
    sport: v.sport,
    plannedDurationS: v.durationS,
    keySession: v.keySession,
  }
  const note = v.note.trim()
  patch.coachNote = note === '' ? undefined : note
  const summary = v.stepsSummary.trim()
  let steps: Step[] = w.steps
  if (v.stepsSummary !== original.stepsSummary) {
    steps =
      summary === ''
        ? []
        : [{ id: `${w.id}-s1`, kind: 'steady', durationS: v.durationS, note: summary }]
    patch.steps = steps
  }
  if (v.durationS !== w.plannedDurationS || v.sport !== w.sport || steps !== w.steps) {
    if (steps.length === 0) {
      patch.plannedLoad = workoutTotals([], v.sport, {}, { plannedDurationS: v.durationS }).load
    } else if (w.plannedDurationS > 0) {
      patch.plannedLoad = Math.round((w.plannedLoad * v.durationS) / w.plannedDurationS)
    }
    if (w.plannedDistanceM !== undefined && w.plannedDurationS > 0) {
      patch.plannedDistanceM = Math.round((w.plannedDistanceM * v.durationS) / w.plannedDurationS)
    }
  }
  return patch
}

/** A fresh free session: a run of one hour, with an id no other session uses. */
export function newSession(
  existing: readonly PlannedWorkout[],
  athleteId: AthleteId,
  day: DayOffset,
): PlannedWorkout {
  const same = existing.filter((p) => p.athleteId === athleteId && p.day === day)
  let n = same.length + 1
  let id = `pw-${athleteId}-${day}-${n}`
  while (existing.some((p) => p.id === id)) id = `pw-${athleteId}-${day}-${++n}`
  const durationS = 3600
  return {
    id,
    athleteId,
    day,
    order: same.reduce((m, p) => Math.max(m, p.order + 1), 0),
    sport: 'run',
    title: 'New run',
    steps: [],
    plannedDurationS: durationS,
    plannedLoad: workoutTotals([], 'run', {}, { plannedDurationS: durationS }).load,
    keySession: false,
  }
}

/** Undo the step a call just made, but only if nothing newer sits on top of it. */
export function undoIfLatest(length: number): void {
  if (useLaree.getState().undoStack.length === length) useLaree.getState().undo()
}
