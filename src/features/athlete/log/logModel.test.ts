import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { LareeData } from '../../../data/store.ts'
import { isoToEpochDay, setFixedStart, setNow, setTimeZone } from '../../../domain/time.ts'
import type { Activity } from '../../../domain/types.ts'
import type { ParsedActivity } from '../../../io/import/types.ts'
import { activityInstant, buildQuickActivity, importIssue } from './logModel.ts'

// Day 0 is Monday 27 July 2026, as in the live app; 1 December 2026 is day 127.
const DEC_1 = 127

function saved(fields: Partial<Activity>): Activity {
  return {
    id: 'saved',
    athleteId: 'me',
    day: DEC_1,
    startMinute: 0,
    sport: 'run',
    title: 'Run',
    source: 'file',
    summary: { durationS: 3600, movingTimeS: 3600 },
    load: { value: 50, method: 'rpe' },
    ...fields,
  } as Activity
}

const file = (startUtc: string) => ({ startUtc }) as ParsedActivity
const dataWith = (...activities: Activity[]) => ({ activities }) as unknown as LareeData

beforeEach(() => {
  setFixedStart(isoToEpochDay('2026-07-27'))
  setNow(new Date('2026-12-05T12:00:00Z'))
})
afterEach(() => {
  setTimeZone(null)
  setFixedStart(null)
  setNow(null)
})

describe('an imported file already saved', () => {
  it('is found from another zone when the saved session is Kuala Lumpur time', () => {
    // 12:00 UTC is 20:00 in Kuala Lumpur, saved before days followed the device.
    const kl = saved({ startMinute: 20 * 60 })
    setTimeZone('America/New_York')
    expect(importIssue(file('2026-12-01T12:00:00Z'), 'run', dataWith(kl), 'me', 140)?.kind).toBe('duplicate')
  })

  it('is found when the saved session was recorded in a third zone', () => {
    const london = saved({ startMinute: 12 * 60, utcOffsetMin: 0 })
    setTimeZone('America/New_York')
    expect(importIssue(file('2026-12-01T12:00:30Z'), 'run', dataWith(london), 'me', 140)?.kind).toBe('duplicate')
  })

  it('is not matched with a session at another time', () => {
    const london = saved({ startMinute: 12 * 60, utcOffsetMin: 0 })
    setTimeZone('America/New_York')
    expect(importIssue(file('2026-12-01T13:00:00Z'), 'run', dataWith(london), 'me', 140)).toBeNull()
  })
})

describe('a logged session', () => {
  const quick: Parameters<typeof buildQuickActivity>[0] = {
    id: 'q',
    athleteId: 'me',
    day: DEC_1,
    startMinute: 7 * 60,
    title: 'Easy run',
    note: '',
    sport: 'run',
    durationS: 2400,
    rpe: 4,
    thresholds: {},
  }

  it('notes the zone’s offset outside Kuala Lumpur, so its instant is known later', () => {
    setTimeZone('America/New_York')
    const a = buildQuickActivity(quick)
    expect(a.utcOffsetMin).toBe(-300)
    expect(new Date(activityInstant(a)).toISOString()).toBe('2026-12-01T12:00:00.000Z')
  })

  it('leaves Kuala Lumpur sessions as they were', () => {
    expect(buildQuickActivity(quick).utcOffsetMin).toBeUndefined()
  })
})
