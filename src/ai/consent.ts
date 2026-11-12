/** AI consent: two layers, both off by default (docs/spec/ai.md 2). Pure functions, one check for every panel. */
import type { AthleteId, PersonId } from '../domain/types.ts'

export type AiState = 'off' | 'athlete-only' | 'waiting-for-athlete' | 'active'

export interface ConsentSettings {
  coach: { aiConsent: boolean }
  amir: { aiConsent: boolean }
  danial: { aiConsent: boolean }
  irfan: { aiConsent: boolean }
}

export interface ViewerLike {
  role: 'coach' | 'athlete'
  athleteId: AthleteId
}

/** The truth table in docs/spec/ai.md 2.1. */
export function aiStateOf(athleteOn: boolean, coachOn: boolean): AiState {
  if (athleteOn && coachOn) return 'active'
  if (athleteOn) return 'athlete-only'
  return coachOn ? 'waiting-for-athlete' : 'off'
}

/** AI runs only when the athlete and Coach both consent. */
export function isAiActive(athleteOn: boolean, coachOn: boolean): boolean {
  return athleteOn && coachOn
}

export function aiStateFor(settings: ConsentSettings, athleteId: AthleteId): AiState {
  return aiStateOf(settings[athleteId].aiConsent, settings.coach.aiConsent)
}

export function isAiActiveFor(settings: ConsentSettings, athleteId: AthleteId): boolean {
  return isAiActive(settings[athleteId].aiConsent, settings.coach.aiConsent)
}

function isOwnerViewing(owner: PersonId, viewer: ViewerLike): boolean {
  return owner === 'coach' ? viewer.role === 'coach' : viewer.role === 'athlete' && viewer.athleteId === owner
}

/** Agreeing is personal: only the owner, viewing as themselves, can turn their layer on. */
export function canTurnOn(owner: PersonId, viewer: ViewerLike): boolean {
  return isOwnerViewing(owner, viewer)
}

/** Withdrawing is open to the owner and, for an athlete, to Coach. */
export function canTurnOff(owner: PersonId, viewer: ViewerLike): boolean {
  return isOwnerViewing(owner, viewer) || (viewer.role === 'coach' && owner !== 'coach')
}

/** Shown instead of the usual confirmation when turning AI off could not be saved at all. */
export const WITHDRAWAL_UNSAVED =
  'AI is off for now, but this device could not save that choice. After a reload it may be on again, so check this setting then.'

/** What Me says under the toggle, for each state (docs/ia 7.6). */
export function athleteStatusLine(state: AiState): string {
  switch (state) {
    case 'active':
      return 'On. Your weekly recap shows on past weeks in Week, and Coach reads the same text.'
    case 'athlete-only':
      return "On for you. Coach hasn't turned AI on yet."
    case 'waiting-for-athlete':
      return 'Off. Coach has turned AI on. Turning it on here starts it for you.'
    default:
      return 'Off. AI also needs Coach to turn it on before anything runs.'
  }
}

/** What the coach settings table says for an athlete. */
export function coachRowLabel(state: AiState): 'Active' | 'Waiting for the athlete' | 'Off' {
  if (state === 'active') return 'Active'
  if (state === 'waiting-for-athlete') return 'Waiting for the athlete'
  return 'Off'
}
