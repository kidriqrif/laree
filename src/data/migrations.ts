/**
 * Saved-data migrations. `migrate` turns a payload saved by an older version into the current
 * shape, or returns null when it cannot be understood (the app then offers a reset).
 */
import type { AthleteId, PersonId, Settings, Threshold } from '../domain/types.ts'

/** Version of the saved shape. Bump it and add a step below when the shape changes. */
export const STORE_VERSION = 2

const OWNERS: readonly PersonId[] = ['coach', 'amir', 'danial', 'irfan']

export function defaultSettings(owner: PersonId): Settings {
  const s: Settings = { owner, units: 'metric', theme: 'system', aiConsent: false }
  // On unless the coach turns them off in Settings (IA section 10, WCAG 2.1.4).
  if (owner === 'coach') s.singleKeyShortcuts = true
  return s
}

export function defaultSettingsMap(): Record<PersonId, Settings> {
  return Object.fromEntries(OWNERS.map((o) => [o, defaultSettings(o)])) as Record<PersonId, Settings>
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/**
 * v0 (before the first release candidate): one flat object with a single global settings object
 * (`aiConsent` was one boolean) and thresholds without history fields.
 * v1: `{ anchor, data }` with per-person settings and thresholds that carry effectiveFromDay and source.
 * v2: `data.skippedCheckIns` ("Not today" days) and `data.activityNotes` (coach notes on activities).
 *     The coach's single-key shortcuts are turned on: v1 stored them off before any screen could change them.
 */
function v0ToV1(old: Record<string, unknown>): Record<string, unknown> {
  const { settings: oldSettings, anchorEpochDay, thresholds, ...rest } = old
  const g = isRecord(oldSettings) ? oldSettings : {}
  const settings = defaultSettingsMap()
  for (const owner of OWNERS) {
    const s = settings[owner]
    if (g['theme'] === 'light' || g['theme'] === 'dark' || g['theme'] === 'system') s.theme = g['theme']
    if (typeof g['aiConsent'] === 'boolean') s.aiConsent = g['aiConsent']
  }
  const list: Threshold[] = Array.isArray(thresholds)
    ? thresholds.filter(isRecord).map((t) => ({
        athleteId: t['athleteId'] as AthleteId,
        kind: t['kind'] as Threshold['kind'],
        value: Number(t['value']),
        effectiveFromDay: typeof t['effectiveFromDay'] === 'number' ? t['effectiveFromDay'] : 0,
        source: (t['source'] as Threshold['source'] | undefined) ?? 'seed',
      }))
    : []
  return {
    anchor: typeof anchorEpochDay === 'number' ? anchorEpochDay : 0,
    data: { ...rest, thresholds: list, settings, drafts: {}, prefs: {} },
  }
}

/** v1 to v2: two new collections, empty, and the coach's single-key shortcuts on. */
function v1ToV2(old: Record<string, unknown>): Record<string, unknown> {
  const data = isRecord(old['data']) ? old['data'] : {}
  // A payload without a settings map is left for the store to fill with defaults.
  const settings = isRecord(data['settings']) ? data['settings'] : null
  const coach = settings && isRecord(settings['coach']) ? settings['coach'] : defaultSettings('coach')
  return {
    ...old,
    data: {
      ...data,
      ...(settings ? { settings: { ...settings, coach: { ...coach, singleKeyShortcuts: true } } } : {}),
      skippedCheckIns: Array.isArray(data['skippedCheckIns']) ? data['skippedCheckIns'] : [],
      activityNotes: isRecord(data['activityNotes']) ? data['activityNotes'] : {},
    },
  }
}

/** Run every step from `version` up to the current one. Returns null for unusable input. */
export function migrate(persisted: unknown, version: number): Record<string, unknown> | null {
  if (!isRecord(persisted)) return null
  if (version > STORE_VERSION) return null
  let state: Record<string, unknown> = persisted
  if (version < 1) state = v0ToV1(state)
  if (version < 2) state = v1ToV2(state)
  return state
}
