/**
 * Who is on the team. The demo starts with the three seed athletes and the coach. The live app
 * replaces them with the signed-in account's roster through `setRoster`. The exports are `let`
 * bindings, so every importer reads the current roster: read them inside functions, never once at
 * module load.
 */
import { ATHLETES as SEED_ATHLETES } from '../data/seed/people.ts'
import type { Athlete as DomainAthlete, AthleteId } from '../domain/types.ts'

export type { AthleteId } from '../domain/types.ts'
export type ViewerChoice = 'coach' | AthleteId

export interface Person {
  id: ViewerChoice
  name: string
  /** One line for the role picker and menus. */
  blurb: string
}

/** An athlete as the screens show them: display copy plus the sports and baselines the metrics use. */
export interface Athlete extends Person, Omit<DomainAthlete, 'id' | 'name'> {
  id: AthleteId
  /** Sport focus, shown when no race is known. */
  focus: string
}

const DEMO_COPY: Readonly<Record<string, { focus: string; blurb: string }>> = {
  amir: { focus: '70.3 triathlon', blurb: '70.3 triathlete.' },
  danial: { focus: 'Marathon', blurb: 'Marathoner.' },
  irfan: { focus: 'Gran fondo', blurb: 'Gran-fondo cyclist.' },
}

export const DEMO_COACH: Person = {
  id: 'coach',
  name: 'Coach',
  blurb: 'Plan and review the team. Best on a laptop.',
}

export const DEMO_ATHLETES: readonly Athlete[] = SEED_ATHLETES.map((a) => ({
  ...a,
  focus: DEMO_COPY[a.id]?.focus ?? '',
  blurb: DEMO_COPY[a.id]?.blurb ?? '',
}))

export let COACH: Person = DEMO_COACH
export let ATHLETES: readonly Athlete[] = DEMO_ATHLETES
export let ATHLETE_IDS: readonly AthleteId[] = DEMO_ATHLETES.map((a) => a.id)
/** Switcher order: Coach first, then the athletes. */
export let PEOPLE: readonly Person[] = [COACH, ...ATHLETES]

/** Replace the roster. Call before the store's data for these people is set, so screens never miss a name. */
export function setRoster(coach: Person, athletes: readonly Athlete[]): void {
  COACH = coach
  ATHLETES = athletes
  ATHLETE_IDS = athletes.map((a) => a.id)
  PEOPLE = [coach, ...athletes]
}

export function isAthleteId(value: unknown): value is AthleteId {
  return typeof value === 'string' && ATHLETE_IDS.includes(value)
}

export function personName(choice: ViewerChoice): string {
  return PEOPLE.find((p) => p.id === choice)?.name ?? COACH.name
}
