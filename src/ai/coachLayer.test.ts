import { afterEach, describe, expect, it } from 'vitest'
import { aiStateFor, coachLayerOffReason, coachLayerOn, isAiActiveFor, setCoachLayer } from './consent.ts'

const settings = { coach: { aiConsent: false }, a1: { aiConsent: true }, a2: { aiConsent: true } }

afterEach(() => setCoachLayer(null))

describe('the second AI layer', () => {
  it("is Coach's own switch in the demo", () => {
    expect(coachLayerOn(settings, 'a1')).toBe(false)
    expect(coachLayerOffReason('a1')).toBeNull()
    expect(aiStateFor({ ...settings, coach: { aiConsent: true } }, 'a1')).toBe('active')
  })

  it('follows the account tier in the live app, per athlete', () => {
    setCoachLayer({ on: (id) => id === 'a1', offReason: () => 'AI is part of the premium plan.' })
    expect(isAiActiveFor(settings, 'a1')).toBe(true)
    expect(isAiActiveFor(settings, 'a2')).toBe(false)
    expect(aiStateFor(settings, 'a2')).toBe('athlete-only')
    expect(coachLayerOffReason('a2')).toBe('AI is part of the premium plan.')
    expect(coachLayerOffReason('a1')).toBeNull()
  })

  it('still needs the athlete to agree', () => {
    setCoachLayer({ on: () => true, offReason: () => '' })
    expect(isAiActiveFor({ ...settings, a1: { aiConsent: false } }, 'a1')).toBe(false)
  })
})
