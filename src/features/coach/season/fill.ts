/**
 * Fill from library: rule-based proposals, one workout per training day, matched on the phase
 * tag, the sport and the week's target load. Pure; the dialog holds the proposal as state.
 * Down weeks come out lighter because their weekly target is already lower (domain/plan.ts).
 */
import type { PlanChange } from '../../../data/store.ts'
import { weekRange } from '../../../domain/time.ts'
import type {
  DayOffset,
  Phase,
  PhaseKind,
  PlannedWorkout,
  Race,
  Sport,
  WeeklyTarget,
  WorkoutTemplate,
} from '../../../domain/types.ts'

export const PHASE_LABEL: Record<PhaseKind, string> = {
  base: 'Base',
  build: 'Build',
  peak: 'Peak',
  taper: 'Taper',
  race: 'Race week',
  recovery: 'Recovery',
}

export const SPORT_NOUN: Record<Sport, string> = {
  swim: 'swim',
  bike: 'bike',
  run: 'run',
  strength: 'strength',
  other: 'other',
}

export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const

/** One training day in the weekly pattern. `long` days carry more of the week's load. */
interface PatternDay {
  sport: Sport
  long?: boolean
}

type Pattern = readonly (PatternDay | null)[]

const PATTERNS: Record<'triathlon' | 'run' | 'bike', Pattern> = {
  triathlon: [
    null,
    { sport: 'swim' },
    { sport: 'bike' },
    { sport: 'run' },
    { sport: 'swim' },
    { sport: 'bike', long: true },
    { sport: 'run', long: true },
  ],
  run: [
    null,
    { sport: 'run' },
    { sport: 'strength' },
    { sport: 'run' },
    null,
    { sport: 'run' },
    { sport: 'run', long: true },
  ],
  bike: [
    null,
    { sport: 'bike' },
    { sport: 'bike' },
    { sport: 'strength' },
    null,
    { sport: 'bike' },
    { sport: 'bike', long: true },
  ],
}

const LONG_WEIGHT = 1.5
/** A template already used in this fill costs this share of the slot's target, so sessions vary. */
const REPEAT_PENALTY = 0.15

export function patternFor(planned: readonly PlannedWorkout[], athleteId: string): Pattern {
  const count = (s: Sport) => planned.filter((p) => p.athleteId === athleteId && p.sport === s).length
  if (count('swim') > 0 && count('bike') > 0 && count('run') > 0) return PATTERNS.triathlon
  return count('bike') > count('run') ? PATTERNS.bike : PATTERNS.run
}

export type CellKind = 'slot' | 'rest' | 'past' | 'race' | 'planned' | 'nophase'

export interface FillCell {
  key: string
  week: number
  day: DayOffset
  weekday: number
  kind: CellKind
  sport?: Sport
  long?: boolean
  /** Share of the week's target this slot aims at. */
  targetLoad: number
  /** The proposed library workout. Null leaves the slot empty. */
  templateId: string | null
  /** Why a slot is empty, or what an existing day holds. */
  note?: string
}

export interface FillWeek {
  week: number
  phaseKind: PhaseKind | null
  target: WeeklyTarget | undefined
  /** Load already planned on days this fill leaves alone. */
  keptLoad: number
  cells: FillCell[]
}

export interface FillInput {
  athleteId: string
  weeks: readonly number[]
  phases: readonly Phase[]
  templates: readonly WorkoutTemplate[]
  planned: readonly PlannedWorkout[]
  races: readonly Race[]
  today: DayOffset
}

/** Race week keeps taper-tagged sessions; everything else uses its own tag. */
function tagFor(kind: PhaseKind): PhaseKind {
  return kind === 'race' ? 'taper' : kind
}

export function candidatesFor(templates: readonly WorkoutTemplate[], sport: Sport, kind: PhaseKind): WorkoutTemplate[] {
  const tag = tagFor(kind)
  return templates
    .filter((t) => t.sport === sport && (t.tags.phase === tag || (sport === 'strength' && !t.tags.phase)))
    .toSorted((a, b) => a.estimatedLoad - b.estimatedLoad || a.id.localeCompare(b.id))
}

export function emptyNote(kind: PhaseKind, sport: Sport): string {
  return `No library workout tagged for ${PHASE_LABEL[kind]} ${SPORT_NOUN[sport]} sessions.`
}

function phaseOf(phases: readonly Phase[], week: number): Phase | undefined {
  return phases.find((p) => week >= p.firstWeek && week <= p.lastWeek)
}

export function proposeFill(input: FillInput): FillWeek[] {
  const { athleteId, phases, templates, planned, races, today } = input
  const mine = planned.filter((p) => p.athleteId === athleteId)
  const pattern = patternFor(planned, athleteId)
  const used = new Map<string, number>()
  const out: FillWeek[] = []

  for (const week of [...input.weeks].sort((a, b) => a - b)) {
    const phase = phaseOf(phases, week)
    const target = phase?.weeklyTargets.find((t) => t.week === week)
    const { firstDay } = weekRange(week)
    const weights = pattern.reduce((s, p) => s + (p ? (p.long ? LONG_WEIGHT : 1) : 0), 0)
    let keptLoad = 0
    const cells: FillCell[] = []

    for (let weekday = 0; weekday < 7; weekday++) {
      const day = firstDay + weekday
      const slot = pattern[weekday] ?? null
      const base = { key: `${week}-${weekday}`, week, day, weekday, targetLoad: 0, templateId: null }
      const dayPlans = mine.filter((p) => p.day === day)
      const dayLoad = dayPlans.reduce((s, p) => s + p.plannedLoad, 0)

      if (!phase || !target) {
        cells.push({ ...base, kind: 'nophase', note: 'No phase covers this week.' })
        keptLoad += dayLoad
        continue
      }
      const slotTarget = slot ? Math.round((target.loadTarget * (slot.long ? LONG_WEIGHT : 1)) / weights) : 0
      const race = races.find((r) => r.athleteId === athleteId && r.day === day)

      if (!slot) {
        cells.push({ ...base, kind: 'rest', note: dayPlans.map((p) => p.title).join(', ') || 'Rest' })
        keptLoad += dayLoad
        continue
      }
      const common = { ...base, sport: slot.sport, long: slot.long ?? false, targetLoad: slotTarget }
      if (race) {
        cells.push({ ...common, kind: 'race', note: race.name })
        keptLoad += dayLoad
        continue
      }
      if (day < today) {
        cells.push({ ...common, kind: 'past', note: dayPlans.map((p) => p.title).join(', ') || 'Past' })
        keptLoad += dayLoad
        continue
      }
      const have = dayPlans.filter((p) => p.sport === slot.sport)
      if (have.length > 0) {
        cells.push({ ...common, kind: 'planned', note: have.map((p) => p.title).join(', ') })
        keptLoad += dayLoad
        continue
      }
      keptLoad += dayLoad
      const options = candidatesFor(templates, slot.sport, phase.kind)
      let best: WorkoutTemplate | undefined
      let bestScore = Infinity
      for (const t of options) {
        const score = Math.abs(t.estimatedLoad - slotTarget) + (used.get(t.id) ?? 0) * REPEAT_PENALTY * slotTarget
        if (score < bestScore) {
          best = t
          bestScore = score
        }
      }
      if (!best) {
        cells.push({ ...common, kind: 'slot', note: emptyNote(phase.kind, slot.sport) })
        continue
      }
      used.set(best.id, (used.get(best.id) ?? 0) + 1)
      cells.push({ ...common, kind: 'slot', templateId: best.id })
    }
    out.push({ week, phaseKind: phase?.kind ?? null, target, keptLoad, cells })
  }
  return out
}

/** Load the week would carry if applied: kept sessions plus the chosen proposals. */
export function weekTotal(week: FillWeek, templates: readonly WorkoutTemplate[]): number {
  const byId = new Map(templates.map((t) => [t.id, t]))
  return (
    week.keptLoad +
    week.cells.reduce((s, c) => s + (c.kind === 'slot' && c.templateId ? (byId.get(c.templateId)?.estimatedLoad ?? 0) : 0), 0)
  )
}

/** Plan changes for the chosen proposals: copies of the templates, one undo step. */
export function toChanges(
  athleteId: PlannedWorkout['athleteId'],
  weeks: readonly FillWeek[],
  templates: readonly WorkoutTemplate[],
  planned: readonly PlannedWorkout[],
): PlanChange[] {
  const taken = new Set(planned.map((p) => p.id))
  const perDay = new Map<DayOffset, number>()
  const byId = new Map(templates.map((t) => [t.id, t]))
  const changes: PlanChange[] = []
  for (const w of weeks) {
    for (const c of w.cells) {
      if (c.kind !== 'slot' || !c.templateId) continue
      const t = byId.get(c.templateId)
      if (!t) continue
      let n = 1
      let id = `pw-${athleteId}-${c.day}-${n}`
      while (taken.has(id)) id = `pw-${athleteId}-${c.day}-${++n}`
      taken.add(id)
      const order = perDay.get(c.day) ?? planned.filter((p) => p.athleteId === athleteId && p.day === c.day).length
      perDay.set(c.day, order + 1)
      const workout: PlannedWorkout = {
        id,
        athleteId,
        day: c.day,
        order,
        sport: t.sport,
        title: t.name,
        steps: structuredClone(t.steps),
        plannedDurationS: t.estimatedDurationS,
        plannedLoad: t.estimatedLoad,
        keySession: c.long ?? false,
        sourceTemplateId: t.id,
      }
      if (t.estimatedDistanceM !== undefined) workout.plannedDistanceM = t.estimatedDistanceM
      changes.push({ kind: 'add', workout })
    }
  }
  return changes
}
