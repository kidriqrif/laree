import { baselineOrStored } from '../../../domain/baselines.ts'
import type { BaselineCheckIn, BaselineMetric } from '../../../domain/baselines.ts'
import type { Athlete, DayOffset } from '../../../domain/types.ts'

/** "7 h", "7.5 h", "7.25 h". */
export function formatSleep(hours: number): string {
  return `${Number(hours.toFixed(2))} h`
}

export const SORENESS_NAMES = ['None', 'Slight', 'Sore', 'Very sore', 'Extremely sore'] as const
export const MOOD_NAMES = ['Very low', 'Low', 'OK', 'Good', 'Great'] as const

/** "Checked in. Sleep 7 h. Soreness 2. Mood 4." */
export function summaryLine(c: { sleepHours: number; soreness: number; mood: number }): string {
  return `Checked in. Sleep ${formatSleep(c.sleepHours)}. Soreness ${c.soreness}. Mood ${c.mood}.`
}

const NAME: Record<BaselineMetric, string> = { restingHr: 'Resting HR', hrvMs: 'HRV' }
const UNIT: Record<BaselineMetric, string> = { restingHr: 'bpm', hrvMs: 'ms' }

/**
 * A neutral sentence when a reading sits far from the athlete's own usual, such as
 * "Resting HR 52 bpm, usual 44 bpm.". Null when it is close or unknown. Never alarming.
 */
export function baselineNote(
  metric: BaselineMetric,
  value: number | undefined,
  history: readonly BaselineCheckIn[],
  day: DayOffset,
  baselines: Athlete['baselines'],
): string | null {
  if (value === undefined || !Number.isFinite(value)) return null
  const b = baselineOrStored(history, metric, day, baselines)
  const gap = Math.abs(value - b.mean)
  // Far means over two usual swings, or without history a gap of 6 bpm or 20 per cent.
  const far = b.sd !== null && b.sd > 0 ? gap > 2 * b.sd : gap > (metric === 'restingHr' ? 6 : 0.2 * b.mean)
  if (!far) return null
  return `${NAME[metric]} ${Math.round(value)} ${UNIT[metric]}, usual ${Math.round(b.mean)} ${UNIT[metric]}.`
}
