/** Pure helpers for the calendar: step summaries, edit patches and new sessions. */
import { fmtMinutesWords } from '../../../charts/index.ts'
import { useLaree } from '../../../data/store.ts'
import type { UndoEntry } from '../../../data/store.ts'
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

/** The undo step a call just made. Keep it, then hand it to `undoIfLatest`. */
export function latestUndo(): UndoEntry | undefined {
  return useLaree.getState().undoStack.at(-1)
}

/**
 * Run a plan action and return the undo step it pushed. An action that changes nothing pushes no
 * step, and then this returns undefined instead of an older step that belongs to something else.
 */
export function undoStepOf(run: () => void): UndoEntry | undefined {
  const before = latestUndo()
  run()
  const after = latestUndo()
  return after === before ? undefined : after
}

/** Undo that step, but only while it is still the newest one. Compared by identity, not by depth. */
export function undoIfLatest(entry: UndoEntry | undefined): void {
  if (entry && useLaree.getState().undoStack.at(-1) === entry) useLaree.getState().undo()
}
