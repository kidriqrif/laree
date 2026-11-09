import { freshData, type LareeData } from '../../../data/store.ts'
import {
  currentDay,
  selectAnalytics,
  selectFitnessSeries,
  selectProgress,
  selectRosterRows,
} from '../../../data/selectors.ts'
import { ATHLETE_IDS, CURRENT_WEEK } from '../../../data/seed/index.ts'
import { weekOfDay } from '../../../domain/time.ts'

/** Sample content for the gallery: the seeded Laree data, built once when the page first needs it. */
export function buildSample() {
  const data: LareeData = freshData()
  const today = currentDay()
  const athleteId = ATHLETE_IDS[0] ?? 'amir'
  const fitness = selectFitnessSeries(data, athleteId, today)
  const progress = selectProgress(data, athleteId, today)
  const lastWeek = Math.max(1, weekOfDay(today) - 1)
  const weekly = selectAnalytics(data, athleteId, Math.min(lastWeek, CURRENT_WEEK), today).weekly
  const races = data.races
    .filter((r) => r.athleteId === athleteId)
    .map((r) => ({ day: r.day, name: r.name, priority: r.priority }))
  const roster = selectRosterRows(data, today)
  return { data, today, athleteId, fitness, progress, weekly, races, roster }
}

export type Sample = ReturnType<typeof buildSample>

let cached: Sample | null = null
export function getSample(): Sample {
  cached ??= buildSample()
  return cached
}

/** Best-effort power curve in watts for the curve chart: a smooth decay with a small sprint bump. */
export const POWER_CURVE = [5, 15, 30, 60, 120, 300, 600, 1200, 1800, 3600].map((seconds, i) => ({
  seconds,
  value: Math.round(210 + 780 / (1 + i * 1.15) ** 1.35),
}))
export const POWER_CURVE_BEFORE = POWER_CURVE.map((p) => ({ seconds: p.seconds, value: Math.round(p.value * 0.93) }))

export const ZONE_SECONDS = [900, 2400, 1500, 600, 120]
