/** Pure helpers for the workout builder: new steps, reordering, checks and the template to save. */
import { REFERENCE_THRESHOLDS } from '../../../data/seed/templates.ts'
import { workoutTotals } from '../../../domain/steps.ts'
import type {
  PhaseKind,
  PlainStep,
  RepeatStep,
  Sport,
  Step,
  StepTarget,
  StepTargetKind,
  WorkoutTemplate,
} from '../../../domain/types.ts'

export type PlainKind = PlainStep['kind']

export const PLAIN_KINDS: readonly PlainKind[] = ['warmup', 'steady', 'interval', 'recovery', 'cooldown']

export const KIND_NAMES: Record<PlainKind | 'repeat', string> = {
  warmup: 'Warm-up',
  steady: 'Steady',
  interval: 'Interval',
  recovery: 'Recovery',
  cooldown: 'Cool-down',
  repeat: 'Repeat block',
}

export const TARGET_KINDS: readonly { id: StepTargetKind; label: string }[] = [
  { id: 'pctFtp', label: '% of FTP' },
  { id: 'pctThresholdPace', label: '% of threshold pace' },
  { id: 'pctLthr', label: '% of threshold heart rate' },
  { id: 'pctCss', label: '% of swim threshold' },
  { id: 'rpe', label: 'Effort (RPE 1 to 10)' },
]

export const PHASES: readonly PhaseKind[] = ['base', 'build', 'peak', 'taper', 'race', 'recovery']

/** The target type a sport usually uses. */
export function defaultTargetKind(sport: Sport): StepTargetKind {
  switch (sport) {
    case 'bike':
      return 'pctFtp'
    case 'run':
      return 'pctThresholdPace'
    case 'swim':
      return 'pctCss'
    default:
      return 'rpe'
  }
}

const PCT: Record<PlainKind, [number, number]> = {
  warmup: [50, 75],
  steady: [65, 75],
  interval: [95, 100],
  recovery: [50, 60],
  cooldown: [45, 65],
}
const PCT_RUN: Record<PlainKind, [number, number]> = {
  warmup: [65, 75],
  steady: [75, 85],
  interval: [95, 102],
  recovery: [60, 70],
  cooldown: [60, 70],
}
const PCT_SWIM: Record<PlainKind, [number, number]> = {
  warmup: [80, 85],
  steady: [90, 95],
  interval: [100, 105],
  recovery: [75, 80],
  cooldown: [75, 80],
}
const PCT_HR: Record<PlainKind, [number, number]> = {
  warmup: [70, 80],
  steady: [80, 88],
  interval: [95, 100],
  recovery: [65, 75],
  cooldown: [65, 75],
}
const RPE: Record<PlainKind, [number, number]> = {
  warmup: [3, 3],
  steady: [4, 5],
  interval: [7, 8],
  recovery: [2, 2],
  cooldown: [2, 2],
}

/** A sensible range for a step kind and target type. */
export function defaultTarget(kind: PlainKind, targetKind: StepTargetKind): StepTarget {
  const table =
    targetKind === 'rpe'
      ? RPE
      : targetKind === 'pctThresholdPace'
        ? PCT_RUN
        : targetKind === 'pctCss'
          ? PCT_SWIM
          : targetKind === 'pctLthr'
            ? PCT_HR
            : PCT
  const [low, high] = table[kind]
  return { kind: targetKind, low, high }
}

const MIN = 60
const TIME_S: Record<PlainKind, number> = {
  warmup: 10 * MIN,
  steady: 20 * MIN,
  interval: 5 * MIN,
  recovery: 2 * MIN,
  cooldown: 10 * MIN,
}
const SWIM_M: Record<PlainKind, number> = { warmup: 200, steady: 400, interval: 100, recovery: 50, cooldown: 100 }

/** The next unused step id, such as "s7". */
export function nextStepId(steps: readonly Step[]): string {
  let max = 0
  const see = (id: string) => {
    const m = /^s(\d+)/.exec(id)
    if (m?.[1]) max = Math.max(max, Number(m[1]))
  }
  for (const s of steps) {
    see(s.id)
    if (s.kind === 'repeat') s.steps.forEach((c) => see(c.id))
  }
  return `s${max + 1}`
}

export function newPlainStep(kind: PlainKind, sport: Sport, id: string): PlainStep {
  const step: PlainStep = { id, kind, target: defaultTarget(kind, defaultTargetKind(sport)) }
  if (sport === 'swim') step.distanceM = SWIM_M[kind]
  else step.durationS = TIME_S[kind]
  return step
}

/** A repeat block starts as 4 times (interval, recovery). */
export function newRepeat(sport: Sport, steps: readonly Step[]): RepeatStep {
  const base = Number(nextStepId(steps).slice(1))
  return {
    id: `s${base}`,
    kind: 'repeat',
    repeat: 4,
    steps: [newPlainStep('interval', sport, `s${base}a`), newPlainStep('recovery', sport, `s${base}b`)],
  }
}

/** A new workout: a warm-up, one steady step and a cool-down. */
export function startingSteps(sport: Sport): Step[] {
  return [newPlainStep('warmup', sport, 's1'), newPlainStep('steady', sport, 's2'), newPlainStep('cooldown', sport, 's3')]
}

/** Moves the item at `from` to position `to` (clamped). Returns the same array if nothing moves. */
export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
  const end = Math.max(0, Math.min(list.length - 1, to))
  if (from === end || from < 0 || from >= list.length) return list.slice()
  const next = list.slice()
  const [item] = next.splice(from, 1)
  if (item !== undefined) next.splice(end, 0, item)
  return next
}

/** Swaps a step's target for the sport's own type when the sport changes family. */
export function retargetForSport(steps: readonly Step[], sport: Sport): Step[] {
  const want = defaultTargetKind(sport)
  const fix = (s: PlainStep): PlainStep => {
    const next = { ...s }
    if (s.target && s.target.kind !== want) next.target = defaultTarget(s.kind, want)
    if (sport === 'swim' && next.distanceM === undefined && next.durationS !== undefined) {
      next.distanceM = SWIM_M[s.kind]
      delete next.durationS
    }
    return next
  }
  return steps.map((s) => (s.kind === 'repeat' ? { ...s, steps: s.steps.map(fix) } : fix(s)))
}

export interface DraftMeta {
  name: string
  sport: Sport
  description: string
  phase: PhaseKind | ''
  type: string
}

/** Messages by step id, plus "name" for the workout name. */
export type DraftErrors = Record<string, string>

function plainError(s: PlainStep): string | undefined {
  if ((s.durationS ?? 0) <= 0 && (s.distanceM ?? 0) <= 0) return 'Set a duration above zero.'
  if (s.target && s.target.low > s.target.high) return 'The low end of the target is above the high end.'
  return undefined
}

export function validate(meta: DraftMeta, steps: readonly Step[]): DraftErrors {
  const out: DraftErrors = {}
  if (!meta.name.trim()) out.name = 'Give the workout a name.'
  if (steps.length === 0) out.steps = 'Add at least one step.'
  for (const s of steps) {
    if (s.kind === 'repeat') {
      if (s.steps.length === 0) out[s.id] = 'A repeat block needs at least one step.'
      else if (s.repeat < 1) out[s.id] = 'Repeat at least once.'
      for (const c of s.steps) {
        const e = plainError(c)
        if (e) out[c.id] = e
      }
    } else {
      const e = plainError(s)
      if (e) out[s.id] = e
    }
  }
  return out
}

/** The template for the current draft. Totals use the library's reference thresholds. */
export function toTemplate(id: string, meta: DraftMeta, steps: Step[]): WorkoutTemplate {
  const totals = workoutTotals(steps, meta.sport, REFERENCE_THRESHOLDS)
  const tags: WorkoutTemplate['tags'] = {}
  if (meta.phase) tags.phase = meta.phase
  if (meta.type.trim()) tags.type = meta.type.trim()
  const t: WorkoutTemplate = {
    id,
    name: meta.name.trim() || 'Untitled workout',
    sport: meta.sport,
    description: meta.description,
    tags,
    steps,
    estimatedDurationS: Math.round(totals.durationS),
    estimatedLoad: Math.round(totals.load * 10) / 10,
  }
  if (totals.distanceM !== undefined) t.estimatedDistanceM = Math.round(totals.distanceM)
  return t
}

export function metaOf(t: WorkoutTemplate): DraftMeta {
  return {
    name: t.name,
    sport: t.sport,
    description: t.description,
    phase: t.tags.phase ?? '',
    type: t.tags.type ?? '',
  }
}
