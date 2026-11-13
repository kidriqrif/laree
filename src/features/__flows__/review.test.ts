/** Store-level checks for behaviour fixed after code review: none of these needs a rendered page. */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { seededStream } from '../../data/seed/onDemand.ts'
import { thresholdsOn } from '../../data/seed/people.ts'
import { currentDay } from '../../data/selectors.ts'
import { useLaree } from '../../data/store.ts'
import { setNow } from '../../domain/time.ts'
import type { Activity } from '../../domain/types.ts'
import { parseImportFile } from '../../io/import/index.ts'
import { buildImportedActivity, LOG_BACK_DAYS, matchOptions } from '../athlete/log/logModel.ts'
import { durationLabel } from '../athlete/workout/targets.ts'
import { digestOf } from '../coach/analytics/digest.ts'
import { latestUndo, newSession, undoIfLatest } from '../coach/calendar/sessionModel.ts'
import { deleteTemplate, duplicateTemplate, restoreTemplate } from '../coach/library/templateOps.ts'

const WED_10AM_KL = Date.UTC(2026, 10, 11, 2)
const ME = 'amir'
const state = () => useLaree.getState()

beforeEach(() => {
  localStorage.clear()
  setNow(WED_10AM_KL)
  state().reset()
})

describe('workout durations', () => {
  it('never prints 60 minutes after the hour', () => {
    expect(durationLabel(7170)).toBe('2 h 00 min')
    expect(durationLabel(3600)).toBe('1 h 00 min')
    expect(durationLabel(3599)).toBe('59 min 59 s')
  })
})

describe('log sheet choices', () => {
  it('keeps the session opened with "Log it" on offer when it is older than the window', () => {
    const today = currentDay()
    const old = { ...newSession(state().data.planned, ME, today - LOG_BACK_DAYS - 3), title: 'Late log' }
    useLaree.setState((s) => ({ data: { ...s.data, planned: [...s.data.planned, old] } }))
    const ids = (alsoId?: string) => matchOptions(state().data, ME, today, alsoId).map((o) => o.workout.id)
    expect(ids()).not.toContain(old.id)
    expect(ids(old.id)).toContain(old.id)
    // Another athlete's session never appears, whatever id is asked for.
    const theirs = state().data.planned.find((w) => w.athleteId !== ME)
    expect(ids(theirs?.id)).not.toContain(theirs?.id)
  })
})

describe('analytics digest', () => {
  const seededRide = (): Activity => {
    const a = state().data.activities.find((x) => x.athleteId === ME && x.sport === 'bike' && x.source !== 'manual')
    if (!a) throw new Error('the seed has no ride for Amir')
    return a
  }

  it('reuses a digest for the same activity and rebuilds it when the log is replaced under the same id', () => {
    const a = seededRide()
    const th = thresholdsOn(ME, a.day, state().data.thresholds)
    const first = digestOf(a, th)
    expect(first.zones).not.toBeNull()
    // The store relinks activities into new objects; the digest must survive that.
    expect(digestOf({ ...a }, th)).toBe(first)
    const replaced: Activity = { ...a, source: 'manual', day: a.day - 1, summary: { ...a.summary, durationS: 600 } }
    const second = digestOf(replaced, th)
    expect(second).toMatchObject({ day: a.day - 1, durationS: 600, zones: null, power: null })
  })

  it('uses the file digest, not the seeded stream, when an import takes a seeded activity id', () => {
    const a = seededRide()
    const th = thresholdsOn(ME, a.day, state().data.thresholds)
    expect(seededStream(a)).not.toBeNull()
    const imported: Activity = { ...a, streamDigest: { zones: [5, 4, 3, 2, 1], power: null, run: null } }
    expect(seededStream(imported)).toBeNull()
    expect(digestOf(imported, th)).toMatchObject({ zones: [5, 4, 3, 2, 1], power: null })
  })

  it('carries zones and best efforts for an imported file', async () => {
    const bytes = new Uint8Array(readFileSync(resolve(process.cwd(), 'src/io/import/__fixtures__/ride.fit')))
    const result = await parseImportFile(bytes, 'ride.fit')
    if (!result.ok) throw new Error(result.error.code)
    const parsed = result.activities[0]
    if (!parsed) throw new Error('no activity in the fixture')
    const thresholds = { ftp: 250, lthr: 165 }
    const a = buildImportedActivity({ id: 'amir-i-test-0', athleteId: ME, parsed, sport: 'bike', thresholds, title: 'Ride' })
    expect(a.streamDigest?.zones?.reduce((x, y) => x + y, 0)).toBeGreaterThan(0)
    expect(a.streamDigest?.power?.[5]).toBeGreaterThan(190)
    const d = digestOf(a, thresholds)
    expect(d.zones).toEqual(a.streamDigest?.zones)
    expect(d.power).toEqual(a.streamDigest?.power)
    // A different file saved under the same id gets its own digest, not the cached one.
    const other: Activity = { ...a, streamDigest: { zones: [1, 2, 3, 4, 5], power: null, run: null } }
    expect(digestOf(other, thresholds).zones).toEqual([1, 2, 3, 4, 5])
  })
})

describe('undo', () => {
  it('a toast undoes only its own step, not a newer one at the same depth', () => {
    const day = currentDay() + 2
    const a = newSession(state().data.planned, ME, day)
    state().applyPlanChanges([{ kind: 'add', workout: a }], 'Added A')
    const stepA = latestUndo()
    state().undo()
    const b = { ...newSession(state().data.planned, ME, day), title: 'B' }
    state().applyPlanChanges([{ kind: 'add', workout: b }], 'Added B')
    expect(state().undoStack).toHaveLength(1)
    undoIfLatest(stepA)
    expect(state().data.planned.some((w) => w.id === b.id)).toBe(true)
    undoIfLatest(latestUndo())
    expect(state().data.planned.some((w) => w.id === b.id)).toBe(false)
  })
})

describe('library undo', () => {
  it('restores a deleted workout under a fresh id when its id has been reused', () => {
    const [one, two] = state().data.templates
    if (!one || !two) throw new Error('the seed has too few templates')
    const before = state().data.templates.length
    const firstCopy = duplicateTemplate(one.id) as string
    const gone = deleteTemplate(firstCopy)
    if (!gone) throw new Error('nothing was deleted')
    const secondCopy = duplicateTemplate(two.id)
    expect(secondCopy).toBe(firstCopy)
    restoreTemplate(gone)
    const names = state().data.templates.map((t) => t.name)
    expect(state().data.templates).toHaveLength(before + 2)
    expect(names).toContain(`${one.name} (copy)`)
    expect(names).toContain(`${two.name} (copy)`)
    expect(new Set(state().data.templates.map((t) => t.id)).size).toBe(before + 2)
  })

  it('restores under the same id when nothing took it', () => {
    const [one] = state().data.templates
    if (!one) throw new Error('the seed has no templates')
    const gone = deleteTemplate(one.id)
    if (!gone) throw new Error('nothing was deleted')
    restoreTemplate(gone)
    expect(state().data.templates.some((t) => t.id === one.id)).toBe(true)
  })
})
