import type { PlanChange } from '../data/store.ts'
import type { AthleteId, DayOffset } from '../domain/types.ts'

export const AI_LABEL = 'Simulated AI - prototype'
export const MODEL_SUMMARY = 'claude-haiku-5-5'
export const MODEL_PLAN = 'claude-sonnet-5-5'

export type AiFeature = 'recap' | 'checkin' | 'suggest'

interface Base {
  feature: AiFeature
  /** "Simulated AI - prototype" in the demo; who wrote the text in the live app. */
  label: string
  /** The model the MVP would use in the demo; the model that wrote it in the live app. */
  model: string
  athleteId: AthleteId
}

export interface DeclinedOutput extends Base {
  status: 'declined'
  message: string
}

export interface TextOutput extends Base {
  status: 'ok'
  headline: string
  lines: string[]
  /** "Numbers used" under the panel. */
  cites: string[]
  /** All lines joined, for tests and copying. */
  text: string
}

export interface SuggestedChange {
  id: string
  type: 'edit' | 'remove' | 'add' | 'move'
  /** One plain sentence. */
  summary: string
  loadBefore: number
  loadAfter: number
  /** What the store applies if Coach accepts. */
  change: PlanChange
  /** The workout it touches, if any. */
  workoutId: string | undefined
}

export interface SuggestOutput extends Base {
  feature: 'suggest'
  status: 'ok'
  reason: string
  changes: SuggestedChange[]
  week: { durationBeforeS: number; durationAfterS: number; loadBefore: number; loadAfter: number }
  /** The week the change set was built for, and its plan fingerprint for the stale-plan check. */
  firstDay: DayOffset
  planVersion: string
}

export type AiRecapOutput = (TextOutput & { feature: 'recap' }) | (DeclinedOutput & { feature: 'recap' })
export type AiCheckInOutput = (TextOutput & { feature: 'checkin' }) | (DeclinedOutput & { feature: 'checkin' })
export type AiSuggestOutput = SuggestOutput | (DeclinedOutput & { feature: 'suggest' })
