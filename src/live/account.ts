/**
 * The signed-in account: who they are, who they coach or who coaches them, and what that means
 * for the roster, the viewer and the sync. Kept on the device too, so the app opens offline.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { create } from 'zustand'
import { setCoachLayer } from '../ai/consent.ts'
import { setRoster } from '../app/people.ts'
import type { Athlete, Person } from '../app/people.ts'
import { useViewer } from '../app/viewer.ts'
import { useLaree } from '../data/store.ts'
import type { Sport } from '../domain/types.ts'
import type { SyncContext } from './sync/docs.ts'

export interface Profile {
  id: string
  role: 'coach' | 'athlete'
  plan: 'free' | 'premium'
  display_name: string
  focus: string
  sports: string[]
  weight_kg: number | null
  baselines: { restingHr?: number; hrvMs?: number } | null
  onboarded_at: string | null
}

export interface Link {
  coach_id: string
  athlete_id: string
  ai_access: boolean
}

export interface Account {
  uid: string
  email: string
  profile: Profile
  /** A coach's athletes, or an athlete's own profile alone. */
  athletes: Profile[]
  /** An athlete's coach, when they have one. */
  coach: Profile | null
  links: Link[]
}

export interface Invitation {
  id: string
  role: 'coach' | 'athlete'
  coach_name: string
  expires_at: string
}

type Status = 'loading' | 'signed-out' | 'ready' | 'error'

interface AccountState {
  status: Status
  account: Account | null
  invitations: Invitation[]
  error: string | null
}

export const useAccount = create<AccountState>(() => ({ status: 'loading', account: null, invitations: [], error: null }))

/** The version of the consent wording. A new wording gets a new version and asks again. */
export const CONSENT_VERSION = '2026-11'

const CACHE_KEY = 'laree:live:account'
const PROFILE_COLUMNS = 'id, role, plan, display_name, focus, sports, weight_kg, baselines, onboarded_at'

export async function loadAccount(client: SupabaseClient, uid: string, email: string): Promise<Account> {
  const { data: me, error } = await client.from('profiles').select(PROFILE_COLUMNS).eq('id', uid).single()
  if (error) throw new Error(error.message)
  const profile = me as Profile
  const { data: linkRows, error: linkError } = await client
    .from('coach_athletes')
    .select('coach_id, athlete_id, ai_access')
    .eq('status', 'active')
  if (linkError) throw new Error(linkError.message)
  const links = (linkRows ?? []) as Link[]
  const others = links.map((l) => (l.coach_id === uid ? l.athlete_id : l.coach_id))
  let people: Profile[] = []
  if (others.length > 0) {
    const { data, error: peopleError } = await client.from('profiles').select(PROFILE_COLUMNS).in('id', others)
    if (peopleError) throw new Error(peopleError.message)
    people = (data ?? []) as Profile[]
  }
  const byName = (a: Profile, b: Profile) => a.display_name.localeCompare(b.display_name)
  if (profile.role === 'coach') {
    const mine = new Set(links.filter((l) => l.coach_id === uid).map((l) => l.athlete_id))
    return { uid, email, profile, athletes: people.filter((p) => mine.has(p.id)).toSorted(byName), coach: null, links }
  }
  const coachId = links.find((l) => l.athlete_id === uid)?.coach_id
  return { uid, email, profile, athletes: [profile], coach: people.find((p) => p.id === coachId) ?? null, links }
}

export async function loadInvitations(client: SupabaseClient): Promise<Invitation[]> {
  const { data, error } = await client.rpc('my_invitations')
  if (error) throw new Error(error.message)
  return (data ?? []) as Invitation[]
}

const SPORTS: readonly Sport[] = ['swim', 'bike', 'run', 'strength', 'other']

function asAthlete(p: Profile): Athlete {
  const athlete: Athlete = {
    id: p.id,
    name: p.display_name || 'Athlete',
    blurb: p.focus,
    focus: p.focus,
    sports: p.sports.filter((s): s is Sport => (SPORTS as readonly string[]).includes(s)),
    baselines: { restingHr: p.baselines?.restingHr ?? 0, hrvMs: p.baselines?.hrvMs ?? 0 },
  }
  if (p.weight_kg !== null) athlete.weightKg = p.weight_kg
  return athlete
}

export const isSelfCoached = (a: Account): boolean => a.profile.role === 'athlete' && a.coach === null

export function syncContext(a: Account): SyncContext {
  return {
    uid: a.uid,
    role: a.profile.role,
    selfCoached: isSelfCoached(a),
    athleteIds: a.athletes.map((p) => p.id),
  }
}

/** AI tiers (docs/dev/backend.md): the coach's grant for a coached athlete, the plan for a self-coached one. */
function applyAiTier(a: Account): void {
  const granted = (athleteId: string) => a.links.some((l) => l.athlete_id === athleteId && l.ai_access)
  if (a.profile.role === 'coach') {
    setCoachLayer({ on: granted, offReason: () => 'Turn on AI access for them in Settings, under Team.' })
  } else if (isSelfCoached(a)) {
    const premium = a.profile.plan === 'premium'
    setCoachLayer({ on: () => premium, offReason: () => 'AI is part of the premium plan.' })
  } else {
    setCoachLayer({ on: granted, offReason: () => "Your coach hasn't turned on AI for you yet." })
  }
  // Selectors read the layer: wake them.
  useLaree.setState({})
}

/** Point the roster and the viewer at this account. */
export function applyAccount(a: Account): void {
  applyAiTier(a)
  const coachName = a.profile.role === 'coach' ? a.profile.display_name : (a.coach?.display_name ?? 'Coach')
  const coach: Person = { id: 'coach', name: coachName || 'Coach', blurb: '' }
  setRoster(coach, a.athletes.map(asAthlete))
  const first = a.athletes[0]?.id ?? a.uid
  const viewer = useViewer.getState()
  const coachAthleteId = a.athletes.some((p) => p.id === viewer.coachAthleteId) ? viewer.coachAthleteId : first
  useViewer.setState({
    role: a.profile.role === 'coach' ? 'coach' : viewer.role === 'coach' && isSelfCoached(a) ? 'coach' : 'athlete',
    athleteId: a.profile.role === 'coach' ? first : a.uid,
    coachAthleteId,
    chosen: true,
  })
}

export function readCachedAccount(uid: string): Account | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    const a = raw ? (JSON.parse(raw) as Account) : null
    return a?.uid === uid ? a : null
  } catch {
    return null
  }
}

export function cacheAccount(a: Account | null): void {
  try {
    if (a) localStorage.setItem(CACHE_KEY, JSON.stringify(a))
    else localStorage.removeItem(CACHE_KEY)
  } catch {
    // Without storage the app still works online; it just cannot open offline.
  }
}
