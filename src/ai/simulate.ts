/**
 * Simulated AI (docs/spec/ai.md 7): fixed sentence templates over the facts object. Pure and
 * deterministic: no randomness, no clock, no store reads. The shapes match the MVP schemas, so the
 * panels do not change when a real model arrives. Nothing here writes a flag.
 */
import type { PlanChange } from '../data/store.ts'
import type { PlannedWorkout, WorkoutTemplate } from '../domain/types.ts'
import { WEEKDAYS } from './facts.ts'
import type { CheckInFacts, FactsSession, RecapFacts, SuggestFacts } from './facts.ts'
import { AI_LABEL, MODEL_PLAN, MODEL_SUMMARY } from './types.ts'
import type { AiCheckInOutput, AiRecapOutput, AiSuggestOutput, SuggestedChange } from './types.ts'

/** "7 h 20", "2 h", "45 min". */
export function fmtDuration(seconds: number): string {
  const mins = Math.round(seconds / 60)
  const h = Math.floor(mins / 60)
  const m = mins % 60
  if (h === 0) return `${m} min`
  return m === 0 ? `${h} h` : `${h} h ${m}`
}

const signed = (n: number): string => (n >= 0 ? `+${Math.round(n)}` : `−${Math.abs(Math.round(n))}`)
const r1 = (n: number): string => (Math.round(n * 10) / 10).toFixed(1)
/** One decimal with a sign and a true minus, for Ramp. */
const signed1 = (n: number): string => {
  const v = Math.round(n * 10) / 10
  return v >= 0 ? `+${v.toFixed(1)}` : `−${Math.abs(v).toFixed(1)}`
}
const plural =(n: number, one: string, many: string): string => (n === 1 ? one : many)

// ------------------------------------------------------------------ weekly recap

export function simulateRecap(f: RecapFacts): AiRecapOutput {
  const base = { feature: 'recap' as const, label: AI_LABEL, model: MODEL_SUMMARY, athleteId: f.athleteId } as const
  if (f.plannedCount < 2 && f.activityCount < 2) {
    return { ...base, status: 'declined', message: 'Not enough training logged for a recap this week.' }
  }
  const c = f.compliance
  const headline =
    f.downWeek && (c === null || c >= 70)
      ? 'A clean recovery week.'
      : c === null
        ? 'A week of free training.'
        : c >= 90
          ? 'A week that went to plan.'
          : c >= 70
            ? 'A solid week with a few gaps.'
            : 'A lighter week than planned.'
  const lines: string[] = []
  lines.push(
    `You did ${f.doneCount} of ${f.plannedCount} planned ${plural(f.plannedCount, 'session', 'sessions')}: ${fmtDuration(f.doneDurationS)} against ${fmtDuration(f.plannedDurationS)}, and Load ${Math.round(f.doneLoad)} against ${Math.round(f.plannedLoad)}.`,
  )
  lines.push(
    f.formEnd > 5
      ? `Fitness ended the week at ${Math.round(f.fitnessEnd)} and Form at ${signed(f.formEnd)}, so you start the next block fresh.`
      : f.formEnd < -15
        ? `Fitness ended the week at ${Math.round(f.fitnessEnd)} and Form at ${signed(f.formEnd)}. Watch your recovery this week.`
        : `Fitness ended the week at ${Math.round(f.fitnessEnd)} and Form at ${signed(f.formEnd)}.`,
  )
  const keys = f.nextKeySessions
  if (keys.length > 0) {
    const named = keys.slice(0, 3).map((k) => `${k.weekday}'s ${k.title}`)
    // "A", "A and B", "A, B and C"; with more than three, the first three are named as examples.
    const list = named.length > 1 ? `${named.slice(0, -1).join(', ')} and ${named[named.length - 1]}` : named[0]
    lines.push(
      `Next week has ${keys.length} key ${plural(keys.length, 'session', 'sessions')}${keys.length > 3 ? ', including' : ':'} ${list}.`,
    )
  } else {
    lines.push('Next week has no key sessions marked.')
  }
  if (f.race) {
    lines.push(
      f.race.weeksTo === 0
        ? `${f.race.name} is this week.`
        : `${f.race.name} is in ${f.race.weeksTo} ${plural(f.race.weeksTo, 'week', 'weeks')}.`,
    )
  }
  const cites = [
    `${f.doneCount} of ${f.plannedCount} sessions`,
    `${fmtDuration(f.doneDurationS)} of ${fmtDuration(f.plannedDurationS)}`,
    `Load ${Math.round(f.doneLoad)} of ${Math.round(f.plannedLoad)}`,
    `Fitness ${Math.round(f.fitnessEnd)}`,
    `Form ${signed(f.formEnd)}`,
  ]
  return { ...base, status: 'ok', headline, lines, cites, text: [headline, ...lines].join(' ') }
}

// ------------------------------------------------------------------ check-in summary

/** The spec's limit for a check-in summary (docs/spec/ai.md 6.2). */
export const CHECKIN_MAX_LINES = 4

/** Every open flag on one line: the first two by rule text, the rest as a count. */
function flagLine(flags: CheckInFacts['flags']): string {
  const named = flags.slice(0, 2).map((x) => x.text)
  const more = flags.length - named.length
  const label = flags.length === 1 ? 'Open flag' : `${flags.length} open flags`
  return `${label}: ${named.join('; ')}${more > 0 ? `; and ${more} more` : ''}.`
}

export function simulateCheckIn(f: CheckInFacts): AiCheckInOutput {
  const base = { feature: 'checkin' as const, label: AI_LABEL, model: MODEL_SUMMARY, athleteId: f.athleteId } as const
  if (f.checkInsLast7 < 3) {
    return {
      ...base,
      status: 'declined',
      message: `Only ${f.checkInsLast7} ${plural(f.checkInsLast7, 'check-in', 'check-ins')} in the last 7 days. A summary needs 3.`,
    }
  }
  const last = f.recent.slice(-3)
  const lines: string[] = []
  const sleeps = last.map((c) => `${r1(c.sleepHours)} h`)
  lines.push(`Sleep ${sleeps.join(', ')} over the last ${last.length} check-ins.`)
  const lastHr = f.recent.toReversed().find((c) => c.restingHr !== undefined)
  const lastHrv = f.recent.toReversed().find((c) => c.hrvMs !== undefined)
  const bits: string[] = []
  if (lastHr?.restingHr !== undefined) bits.push(`Resting HR ${lastHr.restingHr} bpm (baseline ${f.baselineRestingHr})`)
  if (lastHrv?.hrvMs !== undefined) bits.push(`HRV ${lastHrv.hrvMs} ms (baseline ${f.baselineHrvMs})`)
  if (bits.length > 0) lines.push(`${bits.join('. ')}.`)
  if (f.recent.length > 0) {
    // The spread over the period, lowest to highest, not first day against last.
    const span = (xs: number[]): string => {
      const lo = Math.min(...xs)
      const hi = Math.max(...xs)
      return lo === hi ? `${lo}` : `${lo} to ${hi}`
    }
    lines.push(
      `Soreness ranged ${span(f.recent.map((c) => c.soreness))} and mood ${span(f.recent.map((c) => c.mood))} over ${f.recent.length} check-ins.`,
    )
  }
  const tail: string[] = []
  tail.push(`${f.checkInsLast7} check-ins in 7 days.`)
  tail.push(f.missedKeySessions === 0 ? 'No key session missed.' : `${f.missedKeySessions} key ${plural(f.missedKeySessions, 'session', 'sessions')} missed.`)
  lines.push(tail.join(' '))
  // Flags take one line, however many are open, so no metric line is pushed out by them.
  const out = f.flags.length > 0 ? [flagLine(f.flags), ...lines] : lines
  // Over the limit, the last two lines share one: nothing is dropped.
  while (out.length > CHECKIN_MAX_LINES) {
    const b = out.pop() ?? ''
    const a = out.pop() ?? ''
    out.push(`${a} ${b}`)
  }
  const cites = [`${f.checkInsLast7} check-ins`, ...last.map((c) => `${r1(c.sleepHours)} h sleep`)]
  return { ...base, status: 'ok', headline: 'Last 14 days', lines: out, cites, text: out.join(' ') }
}

// ------------------------------------------------------------------ suggest next week

const REDUCE_RULE = /form|ramp|load|fatigue/i

function sumOf(sessions: readonly FactsSession[]): { d: number; l: number } {
  return { d: sessions.reduce((s, x) => s + x.durationS, 0), l: sessions.reduce((s, x) => s + x.load, 0) }
}

/**
 * A fingerprint of next week's plan, for the stale-plan check. It holds every session field a
 * suggestion reads, so a change to any of them (day, sport, title, time, Load, key flag) makes the
 * saved change set stale.
 */
export function planVersionOf(sessions: readonly FactsSession[]): string {
  return JSON.stringify(sessions.map((s) => [s.id, s.weekday, s.sport, s.title, s.durationS, s.load, s.key]))
}

/** The shortest a session is cut to. A session at or under this is never "shortened". */
const MIN_SESSION_S = 1800

/** Three quarters of the time, to the nearest 5 minutes, and never under the floor. */
const shortened = (durationS: number): number => Math.max(MIN_SESSION_S, Math.round((durationS * 0.75) / 300) * 300)

export function simulateSuggestion(f: SuggestFacts): AiSuggestOutput {
  const base = { feature: 'suggest' as const, label: AI_LABEL, model: MODEL_PLAN, athleteId: f.athleteId } as const
  if (f.historyDays < 21) {
    return { ...base, status: 'declined', message: 'Under 21 days of history. A suggestion needs more training logged.' }
  }
  if (f.nextWeek.length === 0) {
    return { ...base, status: 'declined', message: 'There is no plan for next week to adjust.' }
  }
  const raceDays = new Set(f.raceWeekdays)
  const open = f.nextWeek.filter((s) => !raceDays.has(s.weekday))
  const reduce = f.form < -20 || f.ramp > 6 || f.flagRuleIds.some((r) => REDUCE_RULE.test(r))
  const changes: SuggestedChange[] = []
  const reasons: string[] = []

  if (reduce) {
    reasons.push(
      f.flagRuleIds.length > 0
        ? `Form is ${signed(f.form)} and ${f.flagRuleIds.length} ${plural(f.flagRuleIds.length, 'flag is', 'flags are')} open.`
        : `Form is ${signed(f.form)} and Ramp is ${signed1(f.ramp)} a week.`,
    )
    // Only a session that really gets shorter is a candidate, and an easy one goes before a key one.
    const cuttable = open
      .filter((s) => shortened(s.durationS) < s.durationS)
      .toSorted((a, b) => b.durationS - a.durationS || a.id.localeCompare(b.id))
    const longest = cuttable.find((s) => !s.key) ?? cuttable[0]
    if (longest) {
      const newDur = shortened(longest.durationS)
      const newLoad = Math.round(longest.load * (newDur / longest.durationS))
      changes.push({
        id: `edit-${longest.id}`,
        type: 'edit',
        summary: `Shorten ${longest.weekday}'s ${longest.title}: ${fmtDuration(longest.durationS)} to ${fmtDuration(newDur)}.`,
        loadBefore: Math.round(longest.load),
        loadAfter: newLoad,
        change: { kind: 'update', id: longest.id, patch: { plannedDurationS: newDur, plannedLoad: newLoad } },
        workoutId: longest.id,
      })
    }
    const easy = open
      .filter((s) => !s.key && s.id !== longest?.id)
      .toSorted((a, b) => a.load - b.load || a.id.localeCompare(b.id))[0]
    if (easy) {
      changes.push({
        id: `remove-${easy.id}`,
        type: 'remove',
        summary: `Remove ${easy.weekday}'s ${easy.title}, ${fmtDuration(easy.durationS)}.`,
        loadBefore: Math.round(easy.load),
        loadAfter: 0,
        change: { kind: 'delete', id: easy.id },
        workoutId: easy.id,
      })
    }
    // The reason says what the change set does, not what it set out to do.
    reasons.push(
      changes.length === 0
        ? 'No session next week is long enough to shorten or free to remove, so the plan stands.'
        : longest?.key
          ? `No easy session is long enough to shorten, so ${longest.weekday}'s key session is trimmed instead of dropped.`
          : 'This keeps the key sessions and eases the rest, so Form recovers before the next block.',
    )
  } else if (f.form > 5 && f.ramp < 4 && !f.downWeek) {
    const usedDays = new Set(f.nextWeek.map((s) => s.weekday))
    const freeDay = WEEKDAYS.findIndex((d) => !usedDays.has(d) && !raceDays.has(d) && d !== 'Sunday')
    const tpl = f.templates
      .filter((t) => f.sports.includes(t.sport) && t.load <= 80)
      .toSorted((a, b) => a.load - b.load || a.id.localeCompare(b.id))[0]
    if (freeDay >= 0 && tpl) {
      const workout: PlannedWorkout = {
        id: `ai-${f.athleteId}-${f.firstDay + freeDay}-${tpl.id}`,
        athleteId: f.athleteId,
        day: f.firstDay + freeDay,
        order: 1,
        sport: tpl.sport,
        title: tpl.title,
        // Filled from the library when the change is applied (toPlanChanges): steps are not in the facts.
        steps: [],
        plannedDurationS: tpl.durationS,
        plannedLoad: tpl.load,
        keySession: false,
        sourceTemplateId: tpl.id,
      }
      changes.push({
        id: `add-${tpl.id}-${freeDay}`,
        type: 'add',
        summary: `Add ${WEEKDAYS[freeDay]}'s ${tpl.title}, ${fmtDuration(tpl.durationS)}, from the library.`,
        loadBefore: 0,
        loadAfter: Math.round(tpl.load),
        change: { kind: 'add', workout },
        workoutId: undefined,
      })
    }
    // The reason says what the change set does: with nothing to add, it says why.
    reasons.push(
      changes.length > 0
        ? `Form is ${signed(f.form)} and Ramp is ${signed1(f.ramp)} a week, so there is room for one more easy session.`
        : `Form is ${signed(f.form)} and Ramp is ${signed1(f.ramp)} a week, so there is room for more, but no free day or easy library workout fits. The plan stands.`,
    )
  } else {
    reasons.push(
      f.downWeek
        ? 'Next week is a down week, so the plan stands.'
        : `Form is ${signed(f.form)} and Ramp is ${signed1(f.ramp)} a week, inside the limits, so the plan stands.`,
    )
  }
  if (f.race) {
    reasons.push(`${f.race.name} is in ${f.race.weeksTo} ${plural(f.race.weeksTo, 'week', 'weeks')}.`)
  }

  const before = sumOf(f.nextWeek)
  const dDur = changes.reduce((s, c) => {
    if (c.change.kind === 'update') {
      const w = f.nextWeek.find((x) => x.id === c.workoutId)
      return s + ((c.change.patch.plannedDurationS ?? 0) - (w?.durationS ?? 0))
    }
    if (c.change.kind === 'delete') return s - (f.nextWeek.find((x) => x.id === c.workoutId)?.durationS ?? 0)
    if (c.change.kind === 'add') return s + c.change.workout.plannedDurationS
    return s
  }, 0)
  const dLoad = changes.reduce((s, c) => s + (c.loadAfter - c.loadBefore), 0)
  return {
    ...base,
    status: 'ok',
    reason: reasons.join(' '),
    changes: changes.slice(0, 5),
    week: {
      durationBeforeS: before.d,
      durationAfterS: before.d + dDur,
      loadBefore: Math.round(before.l),
      loadAfter: Math.round(before.l + dLoad),
    },
    firstDay: f.firstDay,
    planVersion: planVersionOf(f.nextWeek),
  }
}

/**
 * The plan changes for the accepted suggestions, ready for the store's `applyPlanChanges`.
 * An added session takes its steps and distance from `library`, as adding it from the library
 * would: the suggestion only names the template, it never carries the steps.
 *
 * A suggested id is built from the day and the template, so the same suggestion gives the same
 * id. If a session in `planned` already holds it (an earlier suggestion, accepted and then
 * moved to another day), the new session gets a fresh id instead of being dropped as a repeat.
 */
export function toPlanChanges(
  accepted: readonly SuggestedChange[],
  library: readonly WorkoutTemplate[] = [],
  planned: readonly PlannedWorkout[] = [],
): PlanChange[] {
  const taken = new Set(planned.map((p) => p.id))
  return accepted.map((c) => {
    const change = c.change
    if (change.kind !== 'add') return change
    const workout: PlannedWorkout = { ...change.workout }
    for (let n = 2; taken.has(workout.id); n++) workout.id = `${change.workout.id}-${n}`
    taken.add(workout.id)
    const tpl = library.find((t) => t.id === workout.sourceTemplateId)
    if (tpl) {
      workout.steps = structuredClone(tpl.steps)
      if (tpl.estimatedDistanceM !== undefined) workout.plannedDistanceM = tpl.estimatedDistanceM
    }
    return { kind: 'add', workout }
  })
}
