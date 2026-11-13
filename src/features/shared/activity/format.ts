/** Small formatters shared by the workout and activity screens. */
import { BAND_LABELS } from '../../../domain/metrics/compliance.ts'
import { dayToDate } from '../../../domain/time.ts'
import type { ActivitySource, ComplianceBand, DayOffset, LoadMethod, Sport } from '../../../domain/types.ts'
import type { StatusKey } from '../../../ui/core/index.ts'

const SPORT_NAME: Record<Sport, string> = {
  swim: 'Swim',
  bike: 'Bike',
  run: 'Run',
  strength: 'Strength',
  other: 'Other',
}

export function sportName(sport: Sport): string {
  return SPORT_NAME[sport]
}

/**
 * A title without its sport prefix, for places where the sport already shows as a mark or a word:
 * "Run: Easy run" becomes "Easy run". Other titles are left as they are.
 */
export function sessionName(title: string, sport: Sport): string {
  const prefix = `${SPORT_NAME[sport]}:`
  if (!title.toLowerCase().startsWith(prefix.toLowerCase())) return title
  const rest = title.slice(prefix.length).trim()
  return rest === '' ? title : rest
}

const dayFmt = new Intl.DateTimeFormat('en-MY', { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'UTC' })

/** "Tuesday 12 Oct". */
export function fmtWeekdayDate(day: DayOffset): string {
  return dayFmt.format(dayToDate(day)).replace(',', '')
}

/** Minutes after midnight as "07:30". */
export function fmtClock(minute: number): string {
  const m = Math.max(0, Math.round(minute))
  return `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

export const SOURCE_LABEL: Record<ActivitySource, string> = {
  file: 'Imported file',
  manual: 'Quick log',
  simulatedDevice: 'Device (simulated)',
}

export const METHOD_LABEL: Record<LoadMethod, string> = {
  power: 'Power',
  pace: 'Pace',
  swim: 'Swim pace',
  heartRate: 'Heart rate',
  effort: 'Effort',
  duration: 'Duration only',
}

export const CONFIDENCE_LABEL = { high: 'High confidence', medium: 'Medium confidence', low: 'Low confidence' } as const

export function statusOf(band: ComplianceBand): StatusKey {
  switch (band) {
    case 'onPlan':
      return 'on-plan'
    case 'short':
    case 'under':
      return 'partial'
    case 'over':
    case 'wellOver':
      return 'over'
    case 'missed':
      return 'missed'
    case 'unplanned':
      return 'unplanned'
  }
}

export { BAND_LABELS }
