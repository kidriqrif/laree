import { beforeEach, describe, expect, it } from 'vitest'
import { useViewer } from '../app/viewer.ts'
import { currentWeek, today, weekRange } from '../domain/time.ts'
import type { AthleteId, Badge } from '../domain/types.ts'
import { resetStorageStatus } from './persist.ts'
import {
  selectActivityCoachNote,
  selectAiState,
  selectCheckInSkipped,
  selectFlagRecords,
  selectHasCheckedIn,
  selectOpenFlagCount,
  selectOpenFlags,
  selectRaces,
  selectUnseenBadges,
  selectUnseenKudos,
} from './selectors.ts'
import { freshData, useLaree } from './store.ts'

beforeEach(() => {
  localStorage.clear()
  resetStorageStatus()
  useLaree.getState().reset()
})

const st = () => useLaree.getState()
const data = () => st().data

function listAgreesWithRecords() {
  for (const id of ['amir', 'danial', 'irfan'] as const) {
    for (const rec of data().flagsState[id].flags) {
      const row = data().flags.find((f) => f.id === rec.id)
      expect(row?.state).toBe(rec.status)
    }
  }
  const ids = data().flags.map((f) => f.id)
  expect(new Set(ids).size).toBe(ids.length)
}

describe('plan changes and undo', () => {
  const week = weekRange(currentWeek()).firstDay
  const mineIn = (id: AthleteId) => data().planned.filter((w) => w.athleteId === id && w.day >= week && w.day < week + 7)

  it('undoes a whole batch in one step', () => {
    const [a, b] = mineIn('amir')
    expect(a && b).toBeTruthy()
    const before = structuredClone(data().planned)
    const newW = { ...a!, id: 'pw-new', title: 'Extra' }
    const added = st().applyPlanChanges(
      [
        { kind: 'add', workout: newW },
        { kind: 'update', id: a!.id, patch: { title: 'Renamed' } },
        { kind: 'move', id: b!.id, day: b!.day + 1 },
        { kind: 'delete', id: a!.id },
      ],
      'Applied changes',
    )
    expect(added).toEqual(['pw-new'])
    expect(st().undoStack).toHaveLength(1)
    expect(data().planned.some((w) => w.id === 'pw-new')).toBe(true)
    expect(data().planned.some((w) => w.id === a!.id)).toBe(false)
    st().undo()
    expect(st().undoStack).toHaveLength(0)
    const sortById = (l: typeof before) => l.toSorted((x, y) => x.id.localeCompare(y.id))
    expect(sortById(data().planned)).toEqual(sortById(before))
  })

  it('adds a workout from a template and undoes it', () => {
    const t = data().templates[0]!
    const n = data().planned.length
    const id = st().addPlannedFromTemplate(t.id, 'danial', week + 2, { keySession: true, coachNote: 'Easy.' })
    const w = data().planned.find((p) => p.id === id)!
    expect(w).toMatchObject({ athleteId: 'danial', day: week + 2, title: t.name, sourceTemplateId: t.id, keySession: true, coachNote: 'Easy.' })
    expect(w.plannedLoad).toBe(t.estimatedLoad)
    expect(data().planned).toHaveLength(n + 1)
    expect(st().undoStack[0]?.label).toBe(`Added ${t.name}`)
    st().undo()
    expect(data().planned).toHaveLength(n)
    expect(st().addPlannedFromTemplate('nope', 'danial', week)).toBeUndefined()
  })

  it('deletes a planned workout and undoes it', () => {
    const w = mineIn('irfan')[0]!
    st().deletePlanned(w.id)
    expect(data().planned.some((p) => p.id === w.id)).toBe(false)
    st().undoMove()
    expect(data().planned.find((p) => p.id === w.id)).toEqual(w)
  })

  it('ignores changes that touch nothing', () => {
    expect(st().applyPlanChanges([{ kind: 'delete', id: 'missing' }], 'x')).toEqual([])
    expect(st().undoStack).toHaveLength(0)
  })
})

const quiet = () =>
  (['irfan', 'danial', 'amir'] as const).find(
    (id) => !data().flagsState[id].flags.some((f) => f.ruleId === 'sleep-short' && f.status !== 'resolved'),
  )!

describe('check-ins and flags', () => {
  it('saving two short nights opens a flag the coach can see', () => {
    const id = quiet()
    const t = today()
    const base = { athleteId: id, soreness: 2, mood: 4, sleepHours: 4.5 }
    st().saveCheckIn({ id: 'ci-a', day: t - 1, ...base })
    st().saveCheckIn({ id: 'ci-b', day: t, ...base })
    const open = selectOpenFlags(data(), id)
    const rec = open.find((f) => f.ruleId === 'sleep-short')!
    expect(rec).toBeDefined()
    expect(rec.severity).toBeTruthy()
    const row = data().flags.find((f) => f.id === rec.id)!
    expect(row.state).toBe('open')
    expect(row.citedCheckInIds).toContain('ci-b')
    expect(selectOpenFlagCount(data(), id)).toBeGreaterThan(0)
    // Running the rules again the same day changes nothing.
    const snapshot = structuredClone(data().flagsState[id])
    st().refreshFlags(id)
    expect(data().flagsState[id]).toEqual(snapshot)
    listAgreesWithRecords()
  })

  it('a hand-resolved flag keeps its note and the list follows', () => {
    const id = quiet()
    const t = today()
    const base = { athleteId: id, soreness: 2, mood: 4, sleepHours: 4.5 }
    st().saveCheckIn({ id: 'ci-a', day: t - 1, ...base })
    st().saveCheckIn({ id: 'ci-b', day: t, ...base })
    const rec = selectOpenFlags(data(), id).find((f) => f.ruleId === 'sleep-short')!
    st().acknowledgeFlag(rec.id, id)
    st().resolveFlag(rec.id, id, 'Spoke to them.')
    expect(selectFlagRecords(data(), id, 'resolved').some((f) => f.id === rec.id)).toBe(true)
    expect(data().flags.find((f) => f.id === rec.id)?.resolutionNote).toBe('Spoke to them.')
    // Resolved while still true: it stays quiet instead of reopening.
    st().saveCheckIn({ id: 'ci-b', day: t, ...base })
    expect(selectOpenFlags(data(), id).some((f) => f.ruleId === 'sleep-short')).toBe(false)
    listAgreesWithRecords()
  })

  it('logging an activity re-runs the rules without breaking the lists', () => {
    const a = data().activities[0]!
    st().logActivity({ ...a, id: 'extra-act' })
    expect(data().activities.some((x) => x.id === 'extra-act')).toBe(true)
    listAgreesWithRecords()
  })

  it('Not today is recorded as no check-in', () => {
    const t = today()
    useLaree.setState((s) => ({ data: { ...s.data, checkIns: s.data.checkIns.filter((c) => !(c.athleteId === 'amir' && c.day === t)) } }))
    st().saveCheckIn({ id: 'x', athleteId: 'danial', day: t, sleepHours: 7, soreness: 2, mood: 4 })
    st().skipCheckIn('amir', t)
    st().skipCheckIn('amir', t)
    expect(selectCheckInSkipped(data(), 'amir', t)).toBe(true)
    expect(selectHasCheckedIn(data(), 'amir', t)).toBe(false)
    expect(data().skippedCheckIns.filter((s) => s.athleteId === 'amir')).toHaveLength(1)
    st().saveCheckIn({ id: 'y', athleteId: 'amir', day: t, sleepHours: 7, soreness: 2, mood: 4 })
    expect(selectCheckInSkipped(data(), 'amir', t)).toBe(false)
    expect(selectHasCheckedIn(data(), 'amir', t)).toBe(true)
    // Skipping a day that already has a check-in records nothing.
    st().skipCheckIn('danial', t)
    expect(selectCheckInSkipped(data(), 'danial', t)).toBe(false)
  })

  it('counts open flags per athlete and for the team', () => {
    const total = (['amir', 'danial', 'irfan'] as const).reduce((n, id) => n + selectOpenFlagCount(data(), id), 0)
    expect(selectOpenFlagCount(data())).toBe(total)
  })
})

describe('badges and kudos', () => {
  it('shows a new badge once', () => {
    expect(selectUnseenBadges(data(), 'amir')).toEqual([])
    const b: Badge = { id: 'amir:test', athleteId: 'amir', key: 'first-ride', earnedDay: today() }
    useLaree.setState((s) => ({ data: { ...s.data, badges: [...s.data.badges, b] } }))
    expect(selectUnseenBadges(data(), 'amir')).toEqual([b])
    expect(selectUnseenBadges(data(), 'amir')).toBe(selectUnseenBadges(data(), 'amir'))
    st().markBadgesSeen('amir', ['amir:test'])
    expect(selectUnseenBadges(data(), 'amir')).toEqual([])
  })

  it('sends kudos, marks them seen, and never loses a badge', () => {
    const before = data().badges.length
    st().sendKudos({ athleteId: 'irfan', message: 'Strong ride.' })
    expect(selectUnseenKudos(data(), 'irfan').length).toBeGreaterThan(0)
    expect(data().badges.length).toBeGreaterThanOrEqual(before)
    st().markKudosSeen('irfan')
    expect(selectUnseenKudos(data(), 'irfan')).toEqual([])
  })

  it('keeps a coach note on an activity', () => {
    const id = data().activities[0]!.id
    st().setActivityCoachNote(id, '  Nice and even.  ')
    expect(selectActivityCoachNote(data(), id)).toBe('Nice and even.')
    st().setActivityCoachNote(id, ' ')
    expect(selectActivityCoachNote(data(), id)).toBeUndefined()
  })
})

describe('races and phases', () => {
  it('adds, updates and deletes a race', () => {
    const id = st().addRace({ athleteId: 'amir', name: 'Local 10k', day: today() + 60, sport: 'run', distancesKm: [10], priority: 'C' })
    expect(selectRaces(data(), 'amir').some((r) => r.id === id)).toBe(true)
    st().updateRace(id, { name: 'Club 10k', priority: 'B' })
    expect(data().races.find((r) => r.id === id)).toMatchObject({ name: 'Club 10k', priority: 'B' })
    const other = st().addRace({ athleteId: 'amir', name: 'Another', day: today() + 70, sport: 'run', distancesKm: [5], priority: 'C' })
    expect(other).not.toBe(id)
    st().deleteRace(id)
    expect(data().races.some((r) => r.id === id)).toBe(false)
  })

  it('derives phases from an A race only', () => {
    const a = data().races.find((r) => r.athleteId === 'danial' && r.priority === 'A')!
    st().setPhases('danial', [])
    expect(data().phases.some((p) => p.athleteId === 'danial')).toBe(false)
    const derived = st().derivePhasesFromRace(a.id)
    expect(derived.length).toBeGreaterThan(0)
    expect(data().phases.filter((p) => p.athleteId === 'danial')).toHaveLength(derived.length)
    expect(data().phases.some((p) => p.athleteId === 'amir')).toBe(true)
    const b = st().addRace({ athleteId: 'danial', name: 'Tune-up', day: a.day - 30, sport: 'run', distancesKm: [10], priority: 'B' })
    expect(st().derivePhasesFromRace(b)).toEqual([])
    expect(data().phases.filter((p) => p.athleteId === 'danial')).toHaveLength(derived.length)
  })
})

describe('AI consent', () => {
  it('the coach can never turn AI on for an athlete', () => {
    useViewer.getState().viewAs('coach')
    expect(st().setAiConsent('coach', true)).toBe(true)
    expect(st().setAiConsent('amir', true)).toBe(false)
    expect(data().settings.amir.aiConsent).toBe(false)
    expect(selectAiState(data(), 'amir')).toBe('waiting-for-athlete')
  })

  it('an athlete turns on only their own layer', () => {
    useViewer.getState().viewAs('amir')
    expect(st().setAiConsent('amir', true)).toBe(true)
    expect(st().setAiConsent('coach', true)).toBe(false)
    expect(st().setAiConsent('danial', true)).toBe(false)
    expect(selectAiState(data(), 'amir')).toBe('athlete-only')
    useViewer.getState().viewAs('coach')
    st().setAiConsent('coach', true)
    expect(selectAiState(data(), 'amir')).toBe('active')
  })

  it('either person can turn it off; others cannot', () => {
    useViewer.getState().viewAs('amir')
    st().setAiConsent('amir', true)
    useViewer.getState().viewAs('danial')
    expect(st().setAiConsent('amir', false)).toBe(false)
    useViewer.getState().viewAs('coach')
    expect(st().setAiConsent('amir', false)).toBe(true)
    expect(selectAiState(data(), 'amir')).toBe('off')
  })
})

describe('reset', () => {
  it('restores the seed after new actions', () => {
    st().skipCheckIn('amir')
    st().setActivityCoachNote('a', 'b')
    st().addRace({ athleteId: 'amir', name: 'x', day: 1, sport: 'run', distancesKm: [5], priority: 'C' })
    st().reset()
    expect(data()).toEqual(freshData())
  })
})
