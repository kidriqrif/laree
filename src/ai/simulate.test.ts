import { beforeEach, describe, expect, it } from 'vitest'
import { currentDay } from '../data/selectors.ts'
import { useLaree } from '../data/store.ts'
import { weekOfDay } from '../domain/time.ts'
import { buildCheckInFacts, buildRecapFacts, buildSuggestFacts } from './facts.ts'
import { simulateCheckIn, simulateRecap, simulateSuggestion, toPlanChanges } from './simulate.ts'
import type { SuggestFacts } from './facts.ts'

beforeEach(() => {
  localStorage.clear()
  useLaree.getState().reset()
})

const data = () => useLaree.getState().data

describe('simulate', () => {
  it('writes the same recap for the same data and a different one when the data changes', () => {
    const today = currentDay()
    const wk = weekOfDay(today) - 1
    const a = simulateRecap(buildRecapFacts(data(), 'amir', wk, today))
    const b = simulateRecap(buildRecapFacts(data(), 'amir', wk, today))
    expect(a).toEqual(b)
    expect(a.status).toBe('ok')
    if (a.status !== 'ok') return
    expect(a.label).toBe('Simulated AI - prototype')
    expect(a.model).toBe('claude-haiku-5-5')
    expect(a.cites.length).toBeGreaterThan(0)
    const facts = buildRecapFacts(data(), 'amir', wk, today)
    const c = simulateRecap({ ...facts, doneCount: facts.doneCount + 1, doneLoad: facts.doneLoad + 40 })
    expect(c.status === 'ok' && c.text).not.toBe(a.text)
  })

  it('declines a recap with almost nothing logged', () => {
    const facts = buildRecapFacts(data(), 'amir', weekOfDay(currentDay()) - 1, currentDay())
    const out = simulateRecap({ ...facts, plannedCount: 0, activityCount: 1 })
    expect(out.status).toBe('declined')
    expect('message' in out && out.message).toBe('Not enough training logged for a recap this week.')
  })

  it('writes a check-in summary of at most four lines, and changes with the data', () => {
    const today = currentDay()
    const facts = buildCheckInFacts(data(), 'amir', today)
    const a = simulateCheckIn(facts)
    expect(simulateCheckIn(facts)).toEqual(a)
    if (a.status !== 'ok') throw new Error('expected a summary')
    expect(a.model).toBe('claude-haiku-5-5')
    expect(a.label).toBe('Simulated AI - prototype')
    expect(a.lines.length).toBeLessThanOrEqual(4)
    const last = facts.recent[facts.recent.length - 1]
    if (!last) throw new Error('seed has check-ins')
    const changed = simulateCheckIn({ ...facts, recent: [...facts.recent.slice(0, -1), { ...last, sleepHours: 3.3 }] })
    expect(changed.status === 'ok' && changed.text).not.toBe(a.text)
  })

  it('declines a check-in summary with fewer than 3 check-ins', () => {
    const facts = buildCheckInFacts(data(), 'amir', currentDay())
    const out = simulateCheckIn({ ...facts, checkInsLast7: 2 })
    expect(out.status).toBe('declined')
    expect('message' in out && out.message).toContain('Only 2 check-ins')
  })

  it('suggests a change set with the plan model, deterministic, as store changes', () => {
    const today = currentDay()
    const facts = buildSuggestFacts(data(), 'irfan', today)
    const a = simulateSuggestion(facts)
    expect(simulateSuggestion(facts)).toEqual(a)
    if (a.status !== 'ok') throw new Error('expected a suggestion')
    expect(a.model).toBe('claude-sonnet-5-5')
    expect(a.label).toBe('Simulated AI - prototype')
    expect(a.changes.length).toBeLessThanOrEqual(5)
    expect(toPlanChanges(a.changes)).toHaveLength(a.changes.length)
  })

  it('eases a fatigued week, never touches a race day and never adds a sport not trained', () => {
    const sessions = [
      { id: 'a', weekday: 'Tuesday', sport: 'bike', title: 'Hills', durationS: 5400, load: 90, key: true },
      { id: 'b', weekday: 'Friday', sport: 'bike', title: 'Spin', durationS: 3600, load: 40, key: false },
      { id: 'c', weekday: 'Sunday', sport: 'bike', title: 'Race', durationS: 14400, load: 300, key: true },
    ] as const
    const facts: SuggestFacts = {
      athleteId: 'irfan', historyDays: 60, firstDay: 70, nextWeek: [...sessions], form: -33, ramp: 5,
      phase: 'build', downWeek: false, flagRuleIds: ['form-deep'], raceWeekdays: ['Sunday'], race: null,
      sports: ['bike'], templates: [],
    }
    const out = simulateSuggestion(facts)
    if (out.status !== 'ok') throw new Error('expected ok')
    expect(out.changes.length).toBeGreaterThan(0)
    expect(out.changes.some((c) => c.workoutId === 'c')).toBe(false)
    expect(out.week.loadAfter).toBeLessThan(out.week.loadBefore)
    const calm = simulateSuggestion({ ...facts, form: 3, flagRuleIds: [] })
    expect(calm.status === 'ok' && calm.changes).toEqual([])
  })

  it('declines with thin history or no plan', () => {
    const facts = buildSuggestFacts(data(), 'irfan', currentDay())
    expect(simulateSuggestion({ ...facts, historyDays: 10 }).status).toBe('declined')
    expect(simulateSuggestion({ ...facts, nextWeek: [] }).status).toBe('declined')
  })

  it('facts hold no profile details, notes or real dates', () => {
    const today = currentDay()
    const all = JSON.stringify([
      buildRecapFacts(data(), 'amir', weekOfDay(today) - 1, today),
      buildCheckInFacts(data(), 'amir', today),
      buildSuggestFacts(data(), 'amir', today),
    ])
    expect(all).not.toMatch(/"notes?"|"email"|\d{4}-\d{2}-\d{2}/)
    expect(all).not.toMatch(/Amir|Danial|Irfan/)
  })
})
