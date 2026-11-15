/** AI consent: two layers, both off by default (docs/spec/ai.md 2). Pure functions, one check for every panel. */
import type { AthleteId, PersonId } from '../domain/types.ts'

export type AiState = 'off' | 'athlete-only' | 'waiting-for-athlete' | 'active'

/** Settings keyed by owner: 'coach' and each athlete id. A missing owner has not agreed. */
export type ConsentSettings = Readonly<Record<string, { aiConsent: boolean } | undefined>>

const agreed = (settings: ConsentSettings, owner: string): boolean => settings[owner]?.aiConsent === true

/**
 * The second layer in the live app. The demo's second layer is Coach's own switch. Live, it is
 * the account's tier: the coach's per-athlete grant, or the premium plan for a self-coached athlete.
 */
export interface CoachLayer {
  on(athleteId: AthleteId): boolean
  /** Why it is off, in words for the athlete. */
  offReason(athleteId: AthleteId): string
}

let coachLayer: CoachLayer | null = null

export function setCoachLayer(layer: CoachLayer | null): void {
  coachLayer = layer
}

/** Is the second layer on for this athlete? */
export function coachLayerOn(settings: ConsentSettings, athleteId: AthleteId): boolean {
  return coachLayer ? coachLayer.on(athleteId) : agreed(settings, 'coach')
}

/** The live app's reason the second layer is off, or null in the demo. */
export function coachLayerOffReason(athleteId: AthleteId): string | null {
  return coachLayer && !coachLayer.on(athleteId) ? coachLayer.offReason(athleteId) : null
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
  return aiStateOf(agreed(settings, athleteId), coachLayerOn(settings, athleteId))
}

export function isAiActiveFor(settings: ConsentSettings, athleteId: AthleteId): boolean {
  return isAiActive(agreed(settings, athleteId), coachLayerOn(settings, athleteId))
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
  'AI is off for now, but this device could not save that choice for good. After a reload or a browser restart it may be on again, so check this setting then.'

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
