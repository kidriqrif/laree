import type { BadgeAward, BadgeKey, StreakResult } from '../../../domain/gamification.ts'
import { formBand } from '../../../domain/metrics/fitness.ts'
import type { FormBand } from '../../../domain/metrics/fitness.ts'
import type { DayOffset, Race } from '../../../domain/types.ts'

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/** The race to count down to: the next A race, else the next race of any priority. */
export function countdownRace(races: readonly Race[], today: DayOffset): Race | undefined {
  const upcoming = races.filter((r) => r.day >= today).toSorted((a, b) => a.day - b.day)
  return upcoming.find((r) => r.priority === 'A') ?? upcoming[0]
}

/** "62 days to Tasik Olympic Tri", or "Race day: ..." on the day. */
export function countdownText(race: Race, today: DayOffset): string {
  const n = race.day - today
  if (n <= 0) return `Race day: ${race.name}`
  return `${plural(n, 'day', 'days')} to ${race.name}`
}

/** "About 8 weeks away" once the race is two weeks out or more. */
export function countdownWeeks(race: Race, today: DayOffset): string | null {
  const n = race.day - today
  return n >= 14 ? `About ${Math.round(n / 7)} weeks away` : null
}

/** One plain sentence for the Fitness change over the window. */
export function trendSentence(now: number, then: number, weeks: number): string {
  const a = Math.round(now)
  const d = a - Math.round(then)
  const span = plural(weeks, 'week', 'weeks')
  if (d === 0) return `Fitness ${a}, level over ${span}.`
  return `Fitness ${a}, ${d > 0 ? 'up' : 'down'} ${Math.abs(d)} in ${span}.`
}

export const FITNESS_EXPLAINER =
  'Fitness is the training your body has absorbed over about six weeks. It rises slowly and falls slowly.'

const FORM_HINT: Record<FormBand, string> = {
  overreaching: 'Deep tiredness. Talk to Coach before the next hard session.',
  building: 'Training is adding up. Normal in a build block.',
  steady: 'Neither tired nor fresh.',
  fresh: 'Rested. Good for a race or a test.',
  detraining: 'Very fresh. If this lasts, Fitness slips.',
}
const FORM_NAME: Record<FormBand, string> = {
  overreaching: 'Overreaching',
  building: 'Building',
  steady: 'Steady',
  fresh: 'Fresh',
  detraining: 'Detraining',
}

/** Form always comes with its one-sentence meaning. */
export function formSentence(form: number): string {
  const band = formBand(form)
  return `Form is how rested you were when today began. Yours is ${FORM_NAME[band]}: ${FORM_HINT[band]}`
}

export function streakHeadline(s: StreakResult): string {
  return s.current > 0 ? `Streak: ${plural(s.current, 'week', 'weeks')}` : 'This week can start a new streak.'
}

export function streakSoFar(s: StreakResult): string | null {
  return s.soFar === null ? null : `So far: ${Math.round(s.soFar)}%. A week counts at 80% or better.`
}

export interface BadgeInfo {
  name: string
  face: string
  /** What earns it, shown for badges not yet earned. */
  how: string
  line: string
}

export const BADGES: Record<BadgeKey, BadgeInfo> = {
  'first-brick': { name: 'First brick', face: 'T2', how: 'Ride for 30 minutes or more, then run for 10 minutes or more straight after.', line: 'Your first brick: a ride, then a run straight after.' },
  'bike-100': { name: '100 km bike week', face: '100', how: 'Ride 100 km of planned bike work in one week.', line: 'Your first 100 km bike week in Laree.' },
  'run-50': { name: '50 km run week', face: '50', how: 'Run 50 km of planned running in one week.', line: 'Your first 50 km run week in Laree.' },
  'swim-5': { name: '5 km swim week', face: '5', how: 'Swim 5 km of planned swimming in one week.', line: 'Your first 5 km swim week in Laree.' },
  'new-threshold': { name: 'New threshold', face: 'New', how: 'Coach sets a new best FTP, threshold pace or CSS.', line: 'A new best threshold.' },
  'coach-kudos': { name: 'Coach kudos', face: 'Kudos', how: 'Get kudos from Coach for the first time.', line: 'Your first kudos from Coach.' },
  'check-in-7': { name: 'Seven mornings', face: '7', how: 'Check in seven days in a row.', line: 'Seven check-ins in a row.' },
  'full-lap': { name: 'Full lap', face: 'Lap', how: 'A week with every session on plan and every rest day kept.', line: 'Every session on plan and every rest day kept.' },
  'easy-lap': { name: 'Easy lap', face: 'Easy', how: 'A recovery week done as planned, rest days and all.', line: 'A recovery week done as planned, rest days and all.' },
  comeback: { name: 'Comeback', face: 'Back', how: 'After time off unwell, a week that counts towards your streak with no caution.', line: 'Back on plan after time off unwell.' },
  'race-finisher': { name: 'Race finisher', face: 'Race', how: 'Cover at least 80% of every leg of a race on its day.', line: 'Finished a race.' },
}

/** New threshold shows its new value on the bib; a race finisher shows the race priority letter. */
export function badgeFace(award: BadgeAward, races: readonly Race[]): string {
  if (award.key === 'new-threshold') {
    const m = /to (.+)\.$/.exec(award.line ?? '')
    if (m?.[1]) return m[1]
  }
  if (award.key === 'race-finisher') {
    const r = races.find((x) => award.id.endsWith(`:${x.id}`))
    if (r) return r.priority
  }
  return BADGES[award.key].face
}

export function badgeLine(award: BadgeAward): string {
  const base = BADGES[award.key].line
  if (award.key === 'coach-kudos' && award.line) return `${base} “${award.line}”`
  return award.line ?? base
}
