/** Small formatters shared by the workout and activity screens. */
import { BAND_LABELS } from '../../../domain/metrics/compliance.ts'
import { dayToDate } from '../../../domain/time.ts'
import type { ActivitySource, ComplianceBand, DayOffset, LoadMethod } from '../../../domain/types.ts'
import type { StatusKey } from '../../../ui/core/index.ts'

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
  file: 'From file (.FIT)',
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
