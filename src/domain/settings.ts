/** Per-person settings defaults. Pure: no runtime state. */
import type { PersonId, Settings } from './types.ts'

export function defaultSettings(owner: PersonId): Settings {
  const s: Settings = { owner, units: 'metric', theme: 'system', aiConsent: false }
  // On unless the coach turns them off in Settings (IA section 10, WCAG 2.1.4).
  if (owner === 'coach') s.singleKeyShortcuts = true
  return s
}

/** One person's settings, or the defaults for someone with none saved yet. */
export function settingsOf(all: Readonly<Record<string, Settings>>, owner: PersonId): Settings {
  return all[owner] ?? defaultSettings(owner)
}
