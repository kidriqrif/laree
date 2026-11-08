/** The three athletes and the coach. Ids are fixed; names and one-liners are display copy. */
export type AthleteId = 'amir' | 'danial' | 'irfan'
export type ViewerChoice = 'coach' | AthleteId

export interface Person {
  id: ViewerChoice
  name: string
  /** One line for the role picker and menus. */
  blurb: string
}

export interface Athlete extends Person {
  id: AthleteId
  /** Sport focus, shown when no race is known. */
  focus: string
}

export const ATHLETE_IDS: readonly AthleteId[] = ['amir', 'danial', 'irfan']

export const COACH: Person = {
  id: 'coach',
  name: 'Coach',
  blurb: 'Plan and review the team. Best on a laptop.',
}

export const ATHLETES: readonly Athlete[] = [
  { id: 'amir', name: 'Amir', focus: '70.3 triathlon', blurb: '70.3 triathlete.' },
  { id: 'danial', name: 'Danial', focus: 'Marathon', blurb: 'Marathoner.' },
  { id: 'irfan', name: 'Irfan', focus: 'Gran fondo', blurb: 'Gran-fondo cyclist.' },
]

/** Switcher order: Coach first, then the three athletes. */
export const PEOPLE: readonly Person[] = [COACH, ...ATHLETES]

export function isAthleteId(value: unknown): value is AthleteId {
  return value === 'amir' || value === 'danial' || value === 'irfan'
}

export function personName(choice: ViewerChoice): string {
  return PEOPLE.find((p) => p.id === choice)?.name ?? 'Coach'
}
