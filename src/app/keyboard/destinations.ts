import type { Race, WorkoutTemplate } from '../../domain/types.ts'
import { ATHLETES, type AthleteId } from '../people.ts'

export type DestinationGroup = 'Athletes' | 'Sections' | 'Library' | 'Races'

/** The order Jump to lists its groups in. */
export const DESTINATION_GROUPS: readonly DestinationGroup[] = ['Athletes', 'Sections', 'Library', 'Races']

export interface Destination {
  id: string
  label: string
  /** Group heading in Jump to. */
  group: DestinationGroup
  to: string
  /** Extra words that also match. */
  keywords?: string
}

export interface GlobalKey {
  keys: string
  description: string
  to: (athleteId: AthleteId) => string
}

/** The global "g then ..." keys. Calendar, Season and Analytics follow the athlete in context. */
export const GLOBAL_KEYS: readonly GlobalKey[] = [
  { keys: 'g o', description: 'Go to Overview', to: () => '/coach/overview' },
  {
    keys: 'g c',
    description: 'Go to Calendar',
    to: (id) => `/coach/calendar/${id}`,
  },
  {
    keys: 'g s',
    description: 'Go to Season',
    to: (id) => `/coach/season/${id}`,
  },
  { keys: 'g l', description: 'Go to Library', to: () => '/coach/library' },
  {
    keys: 'g a',
    description: 'Go to Analytics',
    to: (id) => `/coach/analytics/${id}`,
  },
  { keys: 'g i', description: 'Go to Check-ins', to: () => '/coach/check-ins' },
  { keys: 'g t', description: 'Go to Settings', to: () => '/coach/settings' },
  ...ATHLETES.map((a, i) => ({
    keys: `g ${i + 1}`,
    description: `Open ${a.name}`,
    to: () => `/coach/athlete/${a.id}`,
  })),
]

/** What Jump to finds besides screens and athletes: library workouts and races. */
export interface DestinationItems {
  templates?: readonly Pick<WorkoutTemplate, 'id' | 'name' | 'sport' | 'description'>[]
  races?: readonly Pick<Race, 'id' | 'athleteId' | 'name' | 'priority' | 'sport'>[]
}

export function buildDestinations(athleteId: AthleteId, items: DestinationItems = {}): Destination[] {
  const athletes: Destination[] = ATHLETES.map((a) => ({
    id: `athlete-${a.id}`,
    label: a.name,
    group: 'Athletes',
    to: `/coach/athlete/${a.id}`,
    keywords: a.focus,
  }))
  const sections: Destination[] = [
    { id: 'overview', label: 'Overview', to: '/coach/overview' },
    { id: 'calendar', label: 'Calendar', to: `/coach/calendar/${athleteId}` },
    {
      id: 'season',
      label: 'Season',
      to: `/coach/season/${athleteId}`,
      keywords: 'races plan',
    },
    {
      id: 'library',
      label: 'Library',
      to: '/coach/library',
      keywords: 'workouts',
    },
    {
      id: 'analytics',
      label: 'Analytics',
      to: `/coach/analytics/${athleteId}`,
      keywords: 'load fitness fatigue form',
    },
    {
      id: 'check-ins',
      label: 'Check-ins',
      to: '/coach/check-ins',
      keywords: 'flags inbox',
    },
    { id: 'settings', label: 'Settings', to: '/coach/settings' },
  ].map((s) => ({ ...s, group: 'Sections' as const }))
  const library: Destination[] = (items.templates ?? []).map((t) => ({
    id: `workout-${t.id}`,
    label: t.name,
    group: 'Library',
    to: `/coach/library/${t.id}`,
    keywords: `${t.sport} workout ${t.description}`,
  }))
  const races: Destination[] = (items.races ?? []).map((r) => {
    const who = ATHLETES.find((a) => a.id === r.athleteId)?.name ?? r.athleteId
    return {
      id: `race-${r.id}`,
      label: `${r.name} (${who}, ${r.priority} race)`,
      group: 'Races' as const,
      to: `/coach/season/${r.athleteId}`,
      keywords: `race ${r.sport} ${who}`,
    }
  })
  return [...athletes, ...sections, ...library, ...races]
}

export function filterDestinations(all: readonly Destination[], query: string): Destination[] {
  const q = query.trim().toLowerCase()
  if (!q) return [...all]
  return all.filter((d) => `${d.label} ${d.keywords ?? ''}`.toLowerCase().includes(q))
}
