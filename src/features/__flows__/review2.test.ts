/** Store-level checks for behaviour fixed after the second code review. No rendered page is needed. */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildCheckInFacts, buildSuggestFacts, flagsOpenOn } from '../../ai/facts.ts'
import type { CheckInFacts, FactsSession, SuggestFacts } from '../../ai/facts.ts'
import { CHECKIN_MAX_LINES, planVersionOf, simulateCheckIn, simulateSuggestion, toPlanChanges } from '../../ai/simulate.ts'
import { useViewer } from '../../app/viewer.ts'
import { readAiWithdrawn, STORE_KEY } from '../../data/persist.ts'
import { currentDay } from '../../data/selectors.ts'
import { useLaree } from '../../data/store.ts'
import { lifecycleOf, undoFlagAction } from '../../domain/flags.ts'
import { setNow } from '../../domain/time.ts'
import { undoIfLatest, undoStepOf } from '../coach/calendar/sessionModel.ts'
import { flagActionUndo } from '../coach/check-ins/model.ts'

const WED_10AM_KL = Date.UTC(2026, 10, 11, 2)
const state = () => useLaree.getState()
const data = () => state().data
const flagOf = (athleteId: 'amir' | 'danial' | 'irfan', id: string) => {
  const f = data().flagsState[athleteId].flags.find((x) => x.id === id)
  if (!f) throw new Error(`no flag ${id}`)
  return f
}
const openIds = (athleteId: 'amir' | 'danial' | 'irfan') =>
  data()
    .flagsState[athleteId].flags.filter((f) => f.status === 'open')
    .map((f) => f.id)

beforeEach(() => {
  localStorage.clear()
  setNow(WED_10AM_KL)
  state().reset()
  useViewer.setState({ role: 'coach', athleteId: 'amir', coachAthleteId: 'amir', chosen: true })
})

describe('check-in summary', () => {
  const facts = (flags: CheckInFacts['flags']): CheckInFacts => ({
    athleteId: 'irfan',
    checkInsLast7: 6,
    baselineRestingHr: 50,
    baselineHrvMs: 70,
    recent: [
      { weekday: 'Monday', sleepHours: 6.5, soreness: 2, mood: 4, restingHr: 52, hrvMs: 66 },
      { weekday: 'Tuesday', sleepHours: 5.5, soreness: 4, mood: 3, restingHr: 55, hrvMs: 61 },
      { weekday: 'Wednesday', sleepHours: 7, soreness: 3, mood: 3, restingHr: 53, hrvMs: 64 },
    ],
    flags,
    missedKeySessions: 1,
  })
  const metrics = ['Sleep 6.5 h, 5.5 h, 7.0 h', 'Resting HR 53 bpm', 'HRV 64 ms', 'Soreness ranged 2 to 4', '6 check-ins in 7 days', '1 key session missed']

  it('keeps every metric line however many flags are open', () => {
    for (const n of [0, 1, 2, 5]) {
      const flags = Array.from({ length: n }, (_, i) => ({ ruleId: `r${i}`, text: `Rule ${i}, value ${i}` }))
      const out = simulateCheckIn(facts(flags))
      if (out.status !== 'ok') throw new Error('expected a summary')
      expect(out.lines.length).toBeLessThanOrEqual(CHECKIN_MAX_LINES)
      for (const m of metrics) expect(out.text).toContain(m)
      // Flags take one line of their own.
      expect(out.lines.filter((l) => /open flag/i.test(l))).toHaveLength(n === 0 ? 0 : 1)
    }
  })

  it('names two flags and counts the rest', () => {
    const one = simulateCheckIn(facts([{ ruleId: 'a', text: 'Form is deep, Form -31' }]))
    expect(one.status === 'ok' && one.lines[0]).toBe('Open flag: Form is deep, Form -31.')
    const many = simulateCheckIn(
      facts([
        { ruleId: 'a', text: 'A' },
        { ruleId: 'b', text: 'B' },
        { ruleId: 'c', text: 'C' },
        { ruleId: 'd', text: 'D' },
      ]),
    )
    expect(many.status === 'ok' && many.lines[0]).toBe('4 open flags: A; B; and 2 more.')
  })

  it('reads the flags open on the day asked for, not ones raised or closed around it', () => {
    const today = currentDay()
    // Seeded: this flag opened on day 112 and was acknowledged on day 113.
    const f = flagOf('amir', 'amir:sleep-short:112')
    expect(f.acknowledgedDay).toBe(113)
    const ids = (day: number) => flagsOpenOn(data(), 'amir', day).map((x) => x.id)
    expect(ids(111)).not.toContain(f.id)
    expect(ids(112)).toContain(f.id)
    expect(ids(113)).not.toContain(f.id)
    // Today's list is the open-flag list.
    expect(flagsOpenOn(data(), 'irfan', today).map((x) => x.id).toSorted()).toEqual(openIds('irfan').toSorted())
    // A flag resolved later was still open before that.
    const first = openIds('irfan')[0]!
    state().resolveFlag(first, 'irfan', 'Rested', today)
    expect(flagsOpenOn(data(), 'irfan', today).map((x) => x.id)).not.toContain(first)
    expect(flagsOpenOn(data(), 'irfan', today - 1).map((x) => x.id)).toContain(first)
  })

  it('quotes the values at opening for a day before the latest reading', () => {
    const today = currentDay()
    let historical = 0
    for (const rec of data().flagsState.irfan.flags) {
      for (const day of [rec.openedDay, today]) {
        const row = buildCheckInFacts(data(), 'irfan', day).flags.find((x) => x.ruleId === rec.ruleId)
        if (!flagsOpenOn(data(), 'irfan', day).some((x) => x.id === rec.id)) continue
        const later = rec.lastTrueDay > day
        expect(row?.text.endsWith(' when it opened')).toBe(later)
        if (later) historical++
      }
    }
    expect(historical).toBeGreaterThan(0)
  })
})

describe('suggest next week', () => {
  const session = (id: string, weekday: string, durationS: number, key: boolean, load = 50): FactsSession => ({
    id,
    weekday,
    sport: 'bike',
    title: id.toUpperCase(),
    durationS,
    load,
    key,
  })
  const tired = (nextWeek: FactsSession[]): SuggestFacts => ({
    athleteId: 'irfan', historyDays: 60, firstDay: 119, nextWeek, form: -33, ramp: 5,
    phase: 'build', downWeek: false, flagRuleIds: ['form-deep'], raceWeekdays: [], race: null,
    sports: ['bike'], templates: [],
  })
  const run = (f: SuggestFacts) => {
    const out = simulateSuggestion(f)
    if (out.status !== 'ok') throw new Error('expected a suggestion')
    return out
  }

  it('shortens an easy session before a key one, even when the key one is longer', () => {
    const out = run(tired([session('key', 'Tuesday', 7200, true), session('easy', 'Friday', 3600, false), session('spin', 'Saturday', 2400, false, 20)]))
    expect(out.changes.map((c) => c.id)).toEqual(['edit-easy', 'remove-spin'])
    expect(out.reason).toContain('keeps the key sessions')
  })

  it('never "shortens" a session to a longer time', () => {
    // 25 minutes is under the 30 minute floor: it must not grow to 30.
    const out = run(tired([session('short', 'Tuesday', 1500, true), session('half', 'Friday', 1800, false)]))
    expect(out.changes.filter((c) => c.type === 'edit')).toEqual([])
    expect(out.week.durationAfterS).toBeLessThanOrEqual(out.week.durationBeforeS)
  })

  it('says so when only a key session can be trimmed, or nothing can', () => {
    const keyOnly = run(tired([session('key', 'Tuesday', 5400, true)]))
    expect(keyOnly.changes.map((c) => c.id)).toEqual(['edit-key'])
    expect(keyOnly.reason).toContain("Tuesday's key session is trimmed")
    expect(keyOnly.reason).not.toContain('eases the rest')
    const none = run(tired([session('short', 'Tuesday', 1500, true)]))
    expect(none.changes).toEqual([])
    expect(none.reason).toContain('the plan stands')
  })

  it('fingerprints every field a suggestion reads', () => {
    const base = [session('a', 'Tuesday', 3600, false)]
    const v = planVersionOf(base)
    expect(planVersionOf([session('a', 'Tuesday', 3600, false)])).toBe(v)
    expect(planVersionOf([{ ...base[0]!, load: 51 }])).not.toBe(v)
    expect(planVersionOf([{ ...base[0]!, key: true }])).not.toBe(v)
    expect(planVersionOf([{ ...base[0]!, title: 'Other' }])).not.toBe(v)
    expect(planVersionOf([{ ...base[0]!, sport: 'run' }])).not.toBe(v)
    expect(planVersionOf([{ ...base[0]!, weekday: 'Friday' }])).not.toBe(v)
  })

  it('adds a library workout with its steps, copied from the library and never sent in the facts', () => {
    const noted = 'Ask about the knee before this one.'
    // Every library workout gets a step with a free-text note, whatever phase it suits.
    useLaree.setState((s) => ({
      data: {
        ...s.data,
        templates: s.data.templates.map((t) => ({ ...t, steps: t.steps.map((st, i) => (i === 0 ? { ...st, note: noted } : st)) })),
      },
    }))
    const real = buildSuggestFacts(data(), 'irfan', currentDay())
    expect(real.templates.length).toBeGreaterThan(0)
    expect(JSON.stringify(real)).not.toContain(noted)
    expect(JSON.stringify(real)).not.toMatch(/"steps"|"note"/)
    const facts = { ...tired([session('a', 'Tuesday', 3600, false)]), form: 10, ramp: 1, flagRuleIds: [], sports: real.templates.map((t) => t.sport), templates: real.templates.map((t) => ({ ...t, load: 40 })) }
    const out = run(facts)
    const [change] = toPlanChanges(out.changes.filter((c) => c.type === 'add'), data().templates)
    if (!change || change.kind !== 'add') throw new Error('expected an added session')
    const tpl = data().templates.find((t) => t.id === change.workout.sourceTemplateId)
    expect(tpl?.steps.length).toBeGreaterThan(0)
    expect(change.workout.steps).toEqual(tpl?.steps)
    // A copy, so editing the planned session never edits the library.
    expect(change.workout.steps).not.toBe(tpl?.steps)
    expect(change.workout.plannedDistanceM).toBe(tpl?.estimatedDistanceM)
  })

  it('adds the session again when an earlier one with the same id was moved away', () => {
    const real = buildSuggestFacts(data(), 'irfan', currentDay())
    const facts = { ...tired([session('a', 'Tuesday', 3600, false)]), form: 10, ramp: 1, flagRuleIds: [], sports: real.templates.map((t) => t.sport), templates: real.templates.map((t) => ({ ...t, load: 40 })) }
    const adds = run(facts).changes.filter((c) => c.type === 'add')
    const [first] = toPlanChanges(adds, data().templates, data().planned)
    if (!first || first.kind !== 'add') throw new Error('expected an added session')
    state().applyPlanChanges([first], 'Suggested changes')
    // The coach drags it to another day: the id stays, the suggested day is free again.
    state().applyPlanChanges([{ kind: 'move', id: first.workout.id, day: first.workout.day + 1 }], 'Moved')
    const [again] = toPlanChanges(adds, data().templates, data().planned)
    if (!again || again.kind !== 'add') throw new Error('expected an added session')
    expect(again.workout.id).not.toBe(first.workout.id)
    expect(again.workout.day).toBe(first.workout.day)
    const step = undoStepOf(() => state().applyPlanChanges([again], 'Suggested changes'))
    expect(step?.added).toEqual([again.workout.id])
    expect(data().planned.filter((p) => p.sourceTemplateId === first.workout.sourceTemplateId && p.id.startsWith(first.workout.id))).toHaveLength(2)
  })

  it('does not promise a session it could not add', () => {
    const out = run({ ...tired([session('a', 'Tuesday', 3600, false)]), form: 10, ramp: 1, flagRuleIds: [] })
    expect(out.changes).toEqual([])
    expect(out.reason).toContain('The plan stands')
    expect(out.reason).not.toMatch(/room for one more easy session\.$/)
  })
})

describe('undo toasts', () => {
  it('gives no undo step for an action that changed nothing', () => {
    const w = data().planned.find((p) => p.athleteId === 'amir' && p.day > currentDay())
    if (!w) throw new Error('the seed has no future session for Amir')
    const moved = undoStepOf(() => state().moveWorkout(w.id, w.day + 1))
    expect(moved).toBeDefined()
    // With an older step on the stack, a no-op must not hand that step back.
    expect(undoStepOf(() => state().applyPlanChanges([], 'Nothing'))).toBeUndefined()
    expect(undoStepOf(() => {})).toBeUndefined()
    // A save with no edits and a move to where the session already sits change nothing either.
    const now = data().planned.find((p) => p.id === w.id)!
    expect(undoStepOf(() => state().applyPlanChanges([{ kind: 'update', id: w.id, patch: { title: now.title, steps: structuredClone(now.steps) } }], 'Edited'))).toBeUndefined()
    expect(undoStepOf(() => state().applyPlanChanges([{ kind: 'move', id: w.id, day: now.day, order: now.order }], 'Moved'))).toBeUndefined()
    expect(state().undoStack.at(-1)).toBe(moved)
    // A real edit is still a step.
    const edited = undoStepOf(() => state().applyPlanChanges([{ kind: 'update', id: w.id, patch: { title: 'Renamed' } }], 'Edited'))
    expect(edited).toBeDefined()
    undoIfLatest(edited)
    undoIfLatest(moved)
    expect(data().planned.find((p) => p.id === w.id)?.day).toBe(w.day)
  })
})

describe('flag undo', () => {
  const pair = () => {
    const [a, b] = openIds('irfan')
    if (!a || !b) throw new Error('the seed has fewer than two open flags for Irfan')
    return [a, b] as const
  }
  const ack = (id: string) => flagActionUndo('irfan', id, () => state().acknowledgeFlag(id, 'irfan'))
  const row = (id: string) => data().flags.find((f) => f.id === id)

  it('undoes only its own flag', () => {
    const [a, b] = pair()
    const undoA = ack(a)
    ack(b)
    undoA?.()
    expect(flagOf('irfan', a).status).toBe('open')
    expect(flagOf('irfan', a).acknowledgedDay).toBeUndefined()
    expect(flagOf('irfan', b).status).toBe('acknowledged')
    expect(row(a)?.state).toBe('open')
    expect(row(b)?.state).toBe('acknowledged')
  })

  it('leaves a flag alone when it has changed since', () => {
    const [a] = pair()
    const undoAck = ack(a)
    state().resolveFlag(a, 'irfan', 'Spoke to him, easy week.')
    undoAck?.()
    const f = flagOf('irfan', a)
    expect(f.status).toBe('resolved')
    expect(f.resolution).toBe('coach')
    expect(f.notes.at(-1)?.text).toBe('Spoke to him, easy week.')
    expect(row(a)?.state).toBe('resolved')
  })

  it('puts back a resolved flag and the quiet mark it set', () => {
    const [a] = pair()
    const ruleId = flagOf('irfan', a).ruleId
    const wasQuiet = data().flagsState.irfan.quiet[ruleId] === true
    const before = flagOf('irfan', a)
    const undo = flagActionUndo('irfan', a, () => state().resolveFlag(a, 'irfan', 'Rested'))
    expect(flagOf('irfan', a).status).toBe('resolved')
    // The seeded rule is still true, so resolving it sets the quiet mark.
    expect(before.clearDays).toBe(0)
    expect(wasQuiet).toBe(false)
    expect(data().flagsState.irfan.quiet[ruleId]).toBe(true)
    undo?.()
    expect(lifecycleOf(flagOf('irfan', a))).toEqual(lifecycleOf(before))
    expect(data().flagsState.irfan.quiet[ruleId] === true).toBe(wasQuiet)
    // The rule values measured by the rules are not part of the undo.
    expect(flagOf('irfan', a).valuesLatest).toEqual(before.valuesLatest)
  })

  it('leaves a quiet mark it did not set, and never undoes a resolve beside a newer flag of the rule', () => {
    const [a] = pair()
    const s0 = data().flagsState.irfan
    const target = s0.flags.find((f) => f.id === a)!
    const before = lifecycleOf(target)
    state().resolveFlag(a, 'irfan', 'Rested')
    const s1 = data().flagsState.irfan
    const after = lifecycleOf(flagOf('irfan', a))
    // unquiet false: the mark stays.
    expect(undoFlagAction(s1, a, before, after, false)?.quiet[target.ruleId]).toBe(true)
    expect(undoFlagAction(s1, a, before, after, true)?.quiet[target.ruleId]).toBeUndefined()
    // The rule has opened a newer flag since: active, or already resolved by the coach.
    for (const status of ['open', 'resolved'] as const) {
      const newer = { ...target, id: `${a}:newer`, openedDay: target.openedDay + 3, status }
      const s2 = { ...s1, flags: [...s1.flags, newer] }
      expect(undoFlagAction(s2, a, before, after, true)).toBeNull()
    }
  })

  it('gives no undo for an action that changed nothing', () => {
    // Already acknowledged in the seed.
    expect(flagActionUndo('amir', 'amir:sleep-short:112', () => state().acknowledgeFlag('amir:sleep-short:112', 'amir'))).toBeUndefined()
    expect(flagActionUndo('irfan', 'no-such-flag', () => {})).toBeUndefined()
  })

  it('refuses a stale undo in the domain function', () => {
    const [a] = pair()
    const s0 = data().flagsState.irfan
    const before = lifecycleOf(flagOf('irfan', a))
    state().acknowledgeFlag(a, 'irfan')
    const s1 = data().flagsState.irfan
    const after = lifecycleOf(flagOf('irfan', a))
    expect(undoFlagAction(s1, 'no-such-flag', before, after, false)).toBeNull()
    // The flag is not as the action left it.
    expect(undoFlagAction(s0, a, before, after, false)).toBeNull()
    const undone = undoFlagAction(s1, a, before, after, false)
    expect(undone?.flags.find((f) => f.id === a)?.status).toBe('open')
    // Every other record is the same object: nothing else was touched.
    const others = s1.flags.filter((f) => f.id !== a)
    expect(others.length).toBeGreaterThan(0)
    expect(undone?.flags.filter((f) => f.id !== a)).toEqual(others)
    expect(others.every((f) => undone?.flags.includes(f))).toBe(true)
  })
})

describe('withdrawing AI consent while saving fails', () => {
  /** A stand-in for localStorage that refuses writes to the keys `fails` picks. */
  const fakeStorage = (fails: (key: string) => boolean) => {
    const kept = new Map<string, string>()
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k !== null) kept.set(k, localStorage.getItem(k) ?? '')
    }
    return {
      kept,
      getItem: (k: string) => kept.get(k) ?? null,
      removeItem: (k: string) => void kept.delete(k),
      setItem: (k: string, v: string) => {
        if (fails(k)) throw new DOMException('full', 'QuotaExceededError')
        kept.set(k, v)
      },
    }
  }

  it('says so when the choice could not be saved at all', () => {
    expect(state().setAiConsent('coach', true)).toBe(true)
    const real = localStorage
    vi.stubGlobal('localStorage', fakeStorage(() => true))
    try {
      expect(state().setAiConsent('coach', false)).toBe(true)
      expect(data().settings.coach.aiConsent).toBe(false)
      expect(state().aiWithdrawalUnsaved).toBe(true)
    } finally {
      vi.stubGlobal('localStorage', real)
    }
    // A later change that saves clears the warning.
    expect(state().setAiConsent('coach', false)).toBe(true)
    expect(state().aiWithdrawalUnsaved).toBe(false)
  })

  it('keeps consent off after a reload when only the main save failed', async () => {
    expect(state().setAiConsent('coach', true)).toBe(true)
    expect(JSON.parse(localStorage.getItem(STORE_KEY) ?? '{}').state.data.settings.coach.aiConsent).toBe(true)
    const real = localStorage
    let failing = true
    const fake = fakeStorage((k) => failing && k === STORE_KEY)
    vi.stubGlobal('localStorage', fake)
    try {
      expect(state().setAiConsent('coach', false)).toBe(true)
      expect(state().aiWithdrawalUnsaved).toBe(false)
      expect(readAiWithdrawn()).toEqual(['coach'])
      // The saved copy still says "on"; loading it must not bring consent back.
      expect(JSON.parse(fake.kept.get(STORE_KEY) ?? '{}').state.data.settings.coach.aiConsent).toBe(true)
      await useLaree.persist.rehydrate()
      expect(data().settings.coach.aiConsent).toBe(false)
      // Agreeing again, once saving works, clears the note.
      failing = false
      expect(state().setAiConsent('coach', true)).toBe(true)
      expect(readAiWithdrawn()).toEqual([])
      await useLaree.persist.rehydrate()
      expect(data().settings.coach.aiConsent).toBe(true)
    } finally {
      vi.stubGlobal('localStorage', real)
    }
  })

  it('reset clears the note once the fresh data is saved, and keeps it while saving fails', async () => {
    expect(state().setAiConsent('coach', true)).toBe(true)
    const real = localStorage
    let failing = true
    vi.stubGlobal('localStorage', fakeStorage((k) => failing && k === STORE_KEY))
    try {
      expect(state().setAiConsent('coach', false)).toBe(true)
      expect(readAiWithdrawn()).toEqual(['coach'])
      // The reset is not saved either, so the old copy (consent on) is what a reload reads.
      state().reset()
      expect(readAiWithdrawn()).toEqual(['coach'])
      await useLaree.persist.rehydrate()
      expect(data().settings.coach.aiConsent).toBe(false)
      // Once a reset saves, nothing of the old choice is left.
      failing = false
      state().reset()
      expect(readAiWithdrawn()).toEqual([])
      expect(state().aiWithdrawalUnsaved).toBe(false)
    } finally {
      vi.stubGlobal('localStorage', real)
    }
  })
})
