import { beforeEach, describe, expect, it } from 'vitest'
import { today } from '../domain/time.ts'
import {
  aiActiveFor,
  selectAnalytics,
  selectAthleteDay,
  selectFitnessSeries,
  selectProgress,
  selectRosterRows,
  selectWeek,
  thresholdOn,
} from './selectors.ts'
import { useLaree } from './store.ts'

beforeEach(() => {
  localStorage.clear()
  useLaree.getState().reset()
})

const data = () => useLaree.getState().data

describe('selectors', () => {
  it('returns the same object until the data changes', () => {
    const t = today()
    const a = selectAthleteDay(data(), 'amir', t, t)
    expect(selectAthleteDay(data(), 'amir', t, t)).toBe(a)
    expect(selectWeek(data(), 'amir', 17, t)).toBe(selectWeek(data(), 'amir', 17, t))
    expect(selectRosterRows(data(), t)).toBe(selectRosterRows(data(), t))
    useLaree.getState().setPref('x', 1)
    expect(selectAthleteDay(useLaree.getState().data, 'amir', t, t)).not.toBe(a)
  })

  it('builds the week with seven days and totals', () => {
    const t = today()
    const w = selectWeek(data(), 'amir', 16, t)
    expect(w.days).toHaveLength(7)
    expect(w.plannedLoad).toBeGreaterThan(0)
    expect(w.doneLoad).toBeGreaterThan(0)
    expect(w.compliance).not.toBeNull()
    expect(w.phase).toBeDefined()
  })

  it('moving a workout changes the day and week views', () => {
    const t = today()
    const w = data().planned.find((p) => p.athleteId === 'amir' && p.day > t)!
    useLaree.getState().moveWorkout(w.id, w.day + 1)
    expect(selectAthleteDay(data(), 'amir', w.day + 1, t).planned.some((p) => p.workout.id === w.id)).toBe(true)
    expect(selectAthleteDay(data(), 'amir', w.day, t).planned.some((p) => p.workout.id === w.id)).toBe(false)
  })

  it('gives roster rows, progress and analytics', () => {
    const t = today()
    const rows = selectRosterRows(data(), t)
    expect(rows.map((r) => r.athleteId)).toEqual(['amir', 'danial', 'irfan'])
    expect(rows.every((r) => r.fitness > 0)).toBe(true)
    expect(rows.some((r) => r.openFlags > 0)).toBe(true)
    const p = selectProgress(data(), 'amir', t)
    expect(p.streak.current).toBeGreaterThanOrEqual(0)
    expect(p.badges.length).toBeGreaterThan(0)
    const an = selectAnalytics(data(), 'amir', 29, t)
    expect(an.weekly).toHaveLength(29)
    expect(an.fitness.length).toBe(selectFitnessSeries(data(), 'amir', t).length)
    expect(an.fitness.some((f) => f.projected)).toBe(true)
  })

  it('reads thresholds with history and the two consent layers', () => {
    expect(thresholdOn(data(), 'amir', 'ftp', 0)).toBe(245)
    expect(thresholdOn(data(), 'amir', 'ftp', 70)).toBe(255)
    useLaree.getState().setAiConsent('amir', true)
    expect(aiActiveFor(data().settings, 'amir')).toBe(false)
    useLaree.getState().setAiConsent('coach', true)
    expect(aiActiveFor(data().settings, 'amir')).toBe(true)
  })
})
