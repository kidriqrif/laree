import { describe, expect, it } from 'vitest'
import { aiStateOf, athleteStatusLine, canTurnOff, canTurnOn, coachRowLabel, isAiActive } from './consent.ts'

describe('consent truth table', () => {
  const rows: Array<[boolean, boolean, string]> = [
    [false, false, 'off'],
    [true, false, 'athlete-only'],
    [false, true, 'waiting-for-athlete'],
    [true, true, 'active'],
  ]
  it.each(rows)('athlete %s, coach %s gives %s', (a, c, state) => {
    expect(aiStateOf(a, c)).toBe(state)
    expect(isAiActive(a, c)).toBe(state === 'active')
  })

  it('says the right thing in Me and in the coach table', () => {
    expect(athleteStatusLine('athlete-only')).toBe("On for you. Coach hasn't turned AI on yet.")
    expect(athleteStatusLine('waiting-for-athlete')).toContain('Coach has turned AI on')
    expect(coachRowLabel('waiting-for-athlete')).toBe('Waiting for the athlete')
    expect(coachRowLabel('active')).toBe('Active')
  })

  it('lets only the owner turn AI on, never Coach for an athlete', () => {
    const coach = { role: 'coach', athleteId: 'amir' } as const
    const amir = { role: 'athlete', athleteId: 'amir' } as const
    expect(canTurnOn('amir', coach)).toBe(false)
    expect(canTurnOn('amir', amir)).toBe(true)
    expect(canTurnOn('danial', amir)).toBe(false)
    expect(canTurnOn('coach', coach)).toBe(true)
    expect(canTurnOn('coach', amir)).toBe(false)
  })

  it('lets Coach withdraw an athlete but an athlete cannot withdraw Coach', () => {
    const coach = { role: 'coach', athleteId: 'amir' } as const
    const amir = { role: 'athlete', athleteId: 'amir' } as const
    expect(canTurnOff('amir', coach)).toBe(true)
    expect(canTurnOff('coach', amir)).toBe(false)
  })
})
