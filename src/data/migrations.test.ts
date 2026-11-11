import { describe, expect, it } from 'vitest'
import { migrate, STORE_VERSION } from './migrations.ts'

describe('migrate', () => {
  it('migrates a fabricated v0 payload to the current version', () => {
    const v0 = {
      anchorEpochDay: 19000,
      planned: [],
      activities: [],
      settings: { theme: 'dark', aiConsent: true },
      thresholds: [{ athleteId: 'amir', kind: 'ftp', value: 245 }],
    }
    const out = migrate(v0, 0) as { anchor: number; data: Record<string, any> }
    expect(STORE_VERSION).toBe(2)
    expect(out.anchor).toBe(19000)
    expect(out.data['thresholds']).toEqual([
      { athleteId: 'amir', kind: 'ftp', value: 245, effectiveFromDay: 0, source: 'seed' },
    ])
    expect(out.data['settings'].coach.theme).toBe('dark')
    expect(out.data['settings'].irfan.aiConsent).toBe(true)
    expect(out.data['settings'].coach.owner).toBe('coach')
    expect(out.data['drafts']).toEqual({})
    expect(out.data['planned']).toEqual([])
    expect(out.data['skippedCheckIns']).toEqual([])
    expect(out.data['activityNotes']).toEqual({})
  })

  it('migrates a v1 payload by adding the new collections and keeping the rest', () => {
    const v1 = { anchor: 5, data: { planned: [1], checkIns: [], activityNotes: { a: 'x' } } }
    const out = migrate(v1, 1) as { anchor: number; data: Record<string, unknown> }
    expect(out.anchor).toBe(5)
    expect(out.data['planned']).toEqual([1])
    expect(out.data['skippedCheckIns']).toEqual([])
    expect(out.data['activityNotes']).toEqual({ a: 'x' })
  })

  it("turns the coach's single-key shortcuts on, which v1 stored as off", () => {
    const settings = {
      coach: { owner: 'coach', units: 'metric', theme: 'dark', aiConsent: false, singleKeyShortcuts: false },
      amir: { owner: 'amir', units: 'metric', theme: 'system', aiConsent: true },
    }
    const out = migrate({ anchor: 5, data: { settings } }, 1) as { data: Record<string, any> }
    expect(out.data['settings'].coach).toEqual({ ...settings.coach, singleKeyShortcuts: true })
    expect(out.data['settings'].amir).toEqual(settings.amir)
    // v0 payloads pass through the same step.
    const v0 = migrate({ anchorEpochDay: 1, settings: {}, thresholds: [] }, 0) as { data: Record<string, any> }
    expect(v0.data['settings'].coach.singleKeyShortcuts).toBe(true)
    // A payload with no settings map is left for the store to fill.
    expect((migrate({ anchor: 5, data: {} }, 1) as { data: Record<string, unknown> }).data['settings']).toBeUndefined()
  })

  it('rejects unusable input and newer versions', () => {
    expect(migrate('nope', 0)).toBeNull()
    expect(migrate(null, 0)).toBeNull()
    expect(migrate({}, STORE_VERSION + 1)).toBeNull()
  })
})
