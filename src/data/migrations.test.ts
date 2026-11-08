import { describe, expect, it } from 'vitest'
import { migrate, STORE_VERSION } from './migrations.ts'

describe('migrate', () => {
  it('migrates a fabricated v0 payload to v1', () => {
    const v0 = {
      anchorEpochDay: 19000,
      planned: [],
      activities: [],
      settings: { theme: 'dark', aiConsent: true },
      thresholds: [{ athleteId: 'amir', kind: 'ftp', value: 245 }],
    }
    const out = migrate(v0, 0) as { anchor: number; data: Record<string, any> }
    expect(STORE_VERSION).toBe(1)
    expect(out.anchor).toBe(19000)
    expect(out.data['thresholds']).toEqual([
      { athleteId: 'amir', kind: 'ftp', value: 245, effectiveFromDay: 0, source: 'seed' },
    ])
    expect(out.data['settings'].coach.theme).toBe('dark')
    expect(out.data['settings'].irfan.aiConsent).toBe(true)
    expect(out.data['settings'].coach.owner).toBe('coach')
    expect(out.data['drafts']).toEqual({})
    expect(out.data['planned']).toEqual([])
  })

  it('rejects unusable input and newer versions', () => {
    expect(migrate('nope', 0)).toBeNull()
    expect(migrate(null, 0)).toBeNull()
    expect(migrate({}, STORE_VERSION + 1)).toBeNull()
  })
})
