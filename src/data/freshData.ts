/**
 * The demo's starting data. Its own module, so a live build, which never starts from the seed,
 * does not carry the seed generator in its first load.
 */
import { defaultSettingsMap } from './migrations.ts'
import { generateSeed } from './seed/index.ts'
import type { LareeData } from './store.ts'

/** A fresh copy of the seed data, dated to the current week. */
export function freshData(): LareeData {
  const s = generateSeed()
  const copy = structuredClone({
    thresholds: s.thresholds,
    races: s.races,
    phases: s.phases,
    templates: s.templates,
    planned: s.planned,
    activities: s.activities,
    checkIns: s.checkIns,
    flags: s.flags,
    flagsState: s.flagsState,
    kudos: s.kudos,
    badges: s.badges,
    badgeSeen: s.badgeSeen,
    excuses: s.excuses,
  })
  return { ...copy, skippedCheckIns: [], activityNotes: {}, settings: defaultSettingsMap(), drafts: {}, prefs: {} }
}
