import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useViewer } from '../app/viewer.ts'
import type { Activity } from '../domain/types.ts'
import { resetStorageStatus, STORE_KEY } from './persist.ts'
import { freshData, useLaree } from './store.ts'

beforeEach(() => {
  localStorage.clear()
  resetStorageStatus()
  useLaree.getState().reset()
})

const workout = () => useLaree.getState().data.planned.find((w) => w.athleteId === 'amir')!

describe('actions', () => {
  it('moves a workout and undoes the move', () => {
    const w = workout()
    useLaree.getState().moveWorkout(w.id, w.day + 1)
    expect(useLaree.getState().data.planned.find((p) => p.id === w.id)?.day).toBe(w.day + 1)
    useLaree.getState().undoMove()
    const back = useLaree.getState().data.planned.find((p) => p.id === w.id)
    expect(back?.day).toBe(w.day)
    expect(back?.order).toBe(w.order)
    expect(useLaree.getState().undoStack).toHaveLength(0)
  })

  it('edits a workout, saves a template and a check-in', () => {
    const w = workout()
    useLaree.getState().editPlanned(w.id, { title: 'Easy spin' })
    expect(useLaree.getState().data.planned.find((p) => p.id === w.id)?.title).toBe('Easy spin')
    const t = useLaree.getState().data.templates[0]!
    useLaree.getState().saveTemplate({ ...t, name: 'Renamed' })
    expect(useLaree.getState().data.templates.find((x) => x.id === t.id)?.name).toBe('Renamed')
    const ci = { id: 'ci-x', athleteId: 'amir' as const, day: 100, sleepHours: 7, soreness: 2, mood: 4 }
    useLaree.getState().saveCheckIn(ci)
    useLaree.getState().saveCheckIn({ ...ci, id: 'ci-y', mood: 5 })
    expect(useLaree.getState().data.checkIns.filter((c) => c.day === 100 && c.athleteId === 'amir')).toHaveLength(1)
  })

  it('logs an activity', () => {
    const a = useLaree.getState().data.activities[0]!
    const copy: Activity = { ...a, id: 'new-act' }
    useLaree.getState().logActivity(copy)
    expect(useLaree.getState().data.activities.some((x) => x.id === 'new-act')).toBe(true)
  })

  it('acknowledges and resolves a flag', () => {
    const rec = Object.values(useLaree.getState().data.flagsState)
      .flatMap((s) => s.flags)
      .find((f) => f.status === 'open')
    expect(rec).toBeDefined()
    const id = rec!.athleteId as 'amir'
    useLaree.getState().acknowledgeFlag(rec!.id, id)
    expect(useLaree.getState().data.flags.find((f) => f.id === rec!.id)?.state).toBe('acknowledged')
    useLaree.getState().resolveFlag(rec!.id, id, 'Talked it through.')
    const f = useLaree.getState().data.flags.find((x) => x.id === rec!.id)
    expect(f?.state).toBe('resolved')
    expect(f?.resolutionNote).toBe('Talked it through.')
  })

  it('sends kudos, keeps threshold history, sets consent per layer', () => {
    const before = useLaree.getState().data.kudos.length
    useLaree.getState().sendKudos({ athleteId: 'danial', message: ' Nice ' })
    expect(useLaree.getState().data.kudos).toHaveLength(before + 1)
    expect(useLaree.getState().data.kudos.at(-1)?.message).toBe('Nice')

    const n = useLaree.getState().data.thresholds.filter((t) => t.athleteId === 'amir' && t.kind === 'ftp').length
    useLaree.getState().changeThreshold('amir', 'ftp', 260, 90)
    const rows = useLaree.getState().data.thresholds.filter((t) => t.athleteId === 'amir' && t.kind === 'ftp')
    expect(rows).toHaveLength(n + 1)
    expect(rows.some((r) => r.value === 245)).toBe(true)

    useViewer.getState().viewAs('coach')
    useLaree.getState().setAiConsent('coach', true)
    expect(useLaree.getState().data.settings.coach.aiConsent).toBe(true)
    expect(useLaree.getState().data.settings.amir.aiConsent).toBe(false)
    useLaree.getState().setSettings('amir', { theme: 'dark' })
    expect(useLaree.getState().data.settings.amir.theme).toBe('dark')
  })
})

describe('persistence', () => {
  it('saves under laree:v1 with a version', () => {
    useLaree.getState().setPref('rosterSort', 'name')
    const saved = JSON.parse(localStorage.getItem(STORE_KEY)!)
    expect(saved.version).toBe(2)
    expect(saved.state.data.prefs.rosterSort).toBe('name')
    expect(saved.state.anchor).toBe(useLaree.getState().anchor)
  })

  it('rehydrates a saved copy', async () => {
    useLaree.getState().setPref('rosterSort', 'name')
    useLaree.getState().setAiConsent('amir', true)
    const raw = localStorage.getItem(STORE_KEY)!
    useLaree.setState({ data: freshData() })
    localStorage.setItem(STORE_KEY, raw)
    await useLaree.persist.rehydrate()
    expect(useLaree.getState().data.prefs['rosterSort']).toBe('name')
    expect(useLaree.getState().data.settings.amir.aiConsent).toBe(true)
  })

  it('migrates a v0 payload from storage', async () => {
    const fresh = freshData()
    const { settings: _s, drafts: _d, prefs: _p, ...rest } = fresh
    localStorage.setItem(
      STORE_KEY,
      JSON.stringify({
        version: 0,
        state: {
          ...rest,
          anchorEpochDay: useLaree.getState().anchor,
          settings: { theme: 'dark', aiConsent: true },
          thresholds: fresh.thresholds.map(({ athleteId, kind, value }) => ({ athleteId, kind, value })),
        },
      }),
    )
    await useLaree.persist.rehydrate()
    expect(useLaree.getState().unreadable).toBe(false)
    expect(useLaree.getState().data.settings.coach.theme).toBe('dark')
    expect(useLaree.getState().data.thresholds[0]?.source).toBe('seed')
  })

  it('flags unreadable saved data', async () => {
    localStorage.setItem(STORE_KEY, JSON.stringify({ version: 1, state: { data: { planned: 3 }, anchor: 1 } }))
    await useLaree.persist.rehydrate()
    expect(useLaree.getState().unreadable).toBe(true)
  })

  it('starts fresh when the saved copy is from another week', async () => {
    useLaree.getState().setPref('rosterSort', 'name')
    const saved = JSON.parse(localStorage.getItem(STORE_KEY)!)
    saved.state.anchor -= 7
    localStorage.setItem(STORE_KEY, JSON.stringify(saved))
    useLaree.setState({ data: freshData() })
    await useLaree.persist.rehydrate()
    expect(useLaree.getState().data.prefs['rosterSort']).toBeUndefined()
  })

  it('keeps working in memory and raises the flag when storage throws', () => {
    const real = localStorage
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      removeItem: () => {},
      setItem: () => {
        throw new DOMException('full', 'QuotaExceededError')
      },
    })
    try {
      useLaree.getState().setPref('a', 1)
      expect(useLaree.getState().storageFailed).toBe(true)
      expect(useLaree.getState().data.prefs['a']).toBe(1)
    } finally {
      vi.stubGlobal('localStorage', real)
    }
    useLaree.getState().setPref('b', 2)
    expect(useLaree.getState().storageFailed).toBe(false)
  })
})

describe('reset', () => {
  it('restores the seed exactly and sends the viewer to the role picker', () => {
    const w = workout()
    useLaree.getState().moveWorkout(w.id, w.day + 2)
    useLaree.getState().sendKudos({ athleteId: 'amir' })
    useLaree.getState().setAiConsent('coach', true)
    useViewer.getState().viewAs('danial')
    useLaree.getState().reset()
    expect(useLaree.getState().data).toEqual(freshData())
    expect(useLaree.getState().undoStack).toEqual([])
    expect(useViewer.getState().chosen).toBe(false)
  })
})

/** A stand-in for browser storage that reads fine and, when asked, refuses every write. */
function stubStore(seed: Record<string, string>, full: boolean) {
  const map = new Map(Object.entries(seed))
  return {
    getItem: (k: string) => map.get(k) ?? null,
    removeItem: (k: string) => {
      map.delete(k)
    },
    setItem: (k: string, v: string) => {
      if (full) throw new DOMException('full', 'QuotaExceededError')
      map.set(k, v)
    },
  }
}

describe('AI withdrawal that could not be saved', () => {
  const consent = (id: 'amir' | 'danial' | 'coach') => useLaree.getState().data.settings[id].aiConsent
  const asAthlete = () => useViewer.setState({ role: 'athlete', athleteId: 'amir' })
  const asCoach = () => useViewer.setState({ role: 'coach' })

  afterEach(() => {
    vi.unstubAllGlobals()
    sessionStorage.clear()
  })

  it('keeps the warning up when a later coach turn-on succeeds in the same session', () => {
    asAthlete()
    useLaree.getState().setAiConsent('amir', true)
    vi.stubGlobal('localStorage', stubStore({}, true))
    vi.stubGlobal('sessionStorage', stubStore({}, true))
    asCoach()
    useLaree.getState().setAiConsent('amir', false)
    expect(useLaree.getState().aiWithdrawalUnsaved).toBe(true)
    useLaree.getState().setAiConsent('coach', true)
    expect(useLaree.getState().aiWithdrawalUnsaved).toBe(true)
    expect(useLaree.getState().aiUnsavedOwners).toEqual(['amir'])
  })

  it('keeps the warning up when another owner withdraws and that note saves', () => {
    asAthlete()
    useLaree.getState().setAiConsent('amir', true)
    useLaree.getState().setAiConsent('danial', true)
    vi.stubGlobal('localStorage', stubStore({}, true))
    vi.stubGlobal('sessionStorage', stubStore({}, true))
    asCoach()
    useLaree.getState().setAiConsent('amir', false)
    expect(useLaree.getState().aiWithdrawalUnsaved).toBe(true)
    vi.stubGlobal('sessionStorage', stubStore({}, false))
    useLaree.getState().setAiConsent('danial', false)
    expect(useLaree.getState().aiWithdrawalUnsaved).toBe(true)
  })

  it('clears the warning once the main save works again', () => {
    asAthlete()
    useLaree.getState().setAiConsent('amir', true)
    vi.stubGlobal('localStorage', stubStore({}, true))
    vi.stubGlobal('sessionStorage', stubStore({}, true))
    useLaree.getState().setAiConsent('amir', false)
    expect(useLaree.getState().aiWithdrawalUnsaved).toBe(true)
    vi.unstubAllGlobals()
    useLaree.getState().setAiConsent('amir', false)
    expect(useLaree.getState().aiWithdrawalUnsaved).toBe(false)
  })

  it('stays off after a reload when only the session note could be saved, and still warns', async () => {
    asAthlete()
    useLaree.getState().setAiConsent('amir', true)
    const raw = localStorage.getItem(STORE_KEY)!
    vi.stubGlobal('localStorage', stubStore({ [STORE_KEY]: raw }, true))
    useLaree.getState().setAiConsent('amir', false)
    // The session note ends with the browser, so the warning stays for that owner.
    expect(useLaree.getState().aiUnsavedOwners).toEqual(['amir'])
    expect(sessionStorage.getItem('laree:ai-withdrawn')).toContain('amir')
    // A fresh load starts with no warning; loading must bring it back from the session note.
    useLaree.setState({ aiUnsavedOwners: [], aiWithdrawalUnsaved: false })
    await useLaree.persist.rehydrate()
    expect(consent('amir')).toBe(false)
    expect(useLaree.getState().aiUnsavedOwners).toEqual(['amir'])
    expect(useLaree.getState().aiWithdrawalUnsaved).toBe(true)
  })

  it('does not warn after a reload when the withdrawal note lasts in localStorage', async () => {
    asAthlete()
    useLaree.getState().setAiConsent('amir', true)
    const saved = localStorage.getItem(STORE_KEY)!
    // The main save still says on, but a lasting note says off.
    vi.stubGlobal('localStorage', stubStore({ [STORE_KEY]: saved, 'laree:ai-withdrawn': JSON.stringify(['amir']) }, false))
    useLaree.setState({ aiUnsavedOwners: [], aiWithdrawalUnsaved: false })
    await useLaree.persist.rehydrate()
    expect(consent('amir')).toBe(false)
    expect(useLaree.getState().aiWithdrawalUnsaved).toBe(false)
  })
})
