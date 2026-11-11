/**
 * Simulated AI (docs/spec/ai.md 7): fixed sentence templates over the facts object. Pure and
 * deterministic: no randomness, no clock, no store reads. The shapes match the MVP schemas, so the
 * panels do not change when a real model arrives. Nothing here writes a flag.
 */
import type { PlanChange } from '../data/store.ts'
import type { PlannedWorkout } from '../domain/types.ts'
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
const flagLines = f.flags.slice(0, 2).map((x) => `Open flag: ${x.text}.`)
  const out = [...flagLines, ...lines].slice(0, 4)
  const cites = [`${f.checkInsLast7} check-ins`, ...last.map((c) => `${r1(c.sleepHours)} h sleep`)]
  return { ...base, status: 'ok', headline: 'Last 14 days', lines: out, cites, text: out.join(' ') }
}

// ------------------------------------------------------------------ suggest next week

const REDUCE_RULE = /form|ramp|load|fatigue/i

function sumOf(sessions: readonly FactsSession[]): { d: number; l: number } {
  return { d: sessions.reduce((s, x) => s + x.durationS, 0), l: sessions.reduce((s, x) => s + x.load, 0) }
}

/** A fingerprint of next week's plan, for the stale-plan check. */
export function planVersionOf(sessions: readonly FactsSession[]): string {
  return sessions.map((s) => `${s.id}:${s.durationS}:${s.weekday}`).join('|')
}

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
    const longest = open.toSorted((a, b) => b.durationS - a.durationS || a.id.localeCompare(b.id))[0]
    if (longest) {
      const newDur = Math.max(1800, Math.round((longest.durationS * 0.75) / 300) * 300)
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
    reasons.push('Keep the key sessions and ease the rest, so Form recovers before the next block.')
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
    reasons.push(`Form is ${signed(f.form)} and Ramp is ${signed1(f.ramp)} a week, so there is room for one more easy session.`)
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

/** The plan changes for the accepted suggestions, ready for the store's `applyPlanChanges`. */
export function toPlanChanges(accepted: readonly SuggestedChange[]): PlanChange[] {
  return accepted.map((c) => c.change)
}
