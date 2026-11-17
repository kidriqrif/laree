import { afterEach, describe, expect, it } from 'vitest'
import { coachLayerOffReason, setCoachLayer } from '../ai/consent.ts'
import { applyAccount, coachRoom, FREE_COACH_ATHLETES } from './account.ts'
import type { Account, Profile } from './account.ts'

const person = (id: string, role: Profile['role'], plan: Profile['plan']): Profile => ({
  id,
  role,
  plan,
  display_name: id,
  focus: '',
  sports: [],
  weight_kg: null,
  baselines: null,
  onboarded_at: '2026-11-17T00:00:00Z',
})

function coachWith(plan: Profile['plan'], athletes: number): Account {
  const me = person('coach', 'coach', plan)
  const list = Array.from({ length: athletes }, (_, i) => person(`a${i}`, 'athlete', 'free'))
  return {
    uid: me.id,
    email: 'coach@example.test',
    profile: me,
    athletes: list,
    coach: null,
    links: list.map((a) => ({ coach_id: me.id, athlete_id: a.id, ai_access: true })),
  }
}

function athleteOf(coachPlan: Profile['plan']): Account {
  const me = person('a0', 'athlete', 'free')
  return {
    uid: me.id,
    email: 'a0@example.test',
    profile: me,
    athletes: [me],
    coach: person('coach', 'coach', coachPlan),
    links: [{ coach_id: 'coach', athlete_id: me.id, ai_access: true }],
  }
}

afterEach(() => setCoachLayer(null))

describe('a coach’s room for athletes', () => {
  it('is FREE_COACH_ATHLETES on the free plan', () => {
    expect(coachRoom(coachWith('free', 2))).toEqual({ premium: false, used: 2, limit: FREE_COACH_ATHLETES, full: false })
    expect(coachRoom(coachWith('free', FREE_COACH_ATHLETES)).full).toBe(true)
  })

  it('has no limit on premium', () => {
    expect(coachRoom(coachWith('premium', 12))).toEqual({ premium: true, used: 12, limit: null, full: false })
  })
})

describe('AI through a coach', () => {
  it('needs a premium coach, even when the coach has switched it on', () => {
    applyAccount(coachWith('free', 1))
    expect(coachLayerOffReason('a0')).toBe('AI for your athletes comes with the premium plan.')
    applyAccount(coachWith('premium', 1))
    expect(coachLayerOffReason('a0')).toBeNull()
  })

  it('is off for an athlete whose coach is on the free plan', () => {
    applyAccount(athleteOf('free'))
    expect(coachLayerOffReason('a0')).toBe("Your coach's plan doesn't include AI.")
    applyAccount(athleteOf('premium'))
    expect(coachLayerOffReason('a0')).toBeNull()
  })
})
