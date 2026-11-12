/** Check-ins page logic that is not drawing: grid metrics, inbox order and the undo helper. */
import { fmtDay } from '../../../charts/index.ts'
import type { HeatCell, HeatLevel } from '../../../charts/index.ts'
import { ATHLETES } from '../../../data/seed/people.ts'
import type { SeedCheckIn } from '../../../data/seed/index.ts'
import { useLaree } from '../../../data/store.ts'
import { baselineOrStored } from '../../../domain/baselines.ts'
import { lifecycleOf, sameLifecycle } from '../../../domain/flags.ts'
import type { FlagRecord, FlagRuleId, Severity } from '../../../domain/flags.ts'
import type { AthleteId, DayOffset } from '../../../domain/types.ts'
import { showToast } from '../../../ui/overlay/index.ts'

export type GridMetric = 'sleep' | 'soreness' | 'mood' | 'rhr' | 'hrv'

export interface MetricInfo {
  id: GridMetric
  label: string
  unit: string
  /** Lowest to highest legend labels. */
  legend: readonly [string, string, string, string, string]
  value: (c: SeedCheckIn) => number | undefined
  decimals: number
}

export const METRICS: readonly MetricInfo[] = [
  {
    id: 'sleep',
    label: 'Sleep',
    unit: 'h',
    legend: ['Under 5 h', '5 to 6 h', '6 to 7 h', '7 to 8 h', '8 h or more'],
    value: (c) => c.sleepHours,
    decimals: 1,
  },
  {
    id: 'soreness',
    label: 'Soreness',
    unit: '',
    legend: ['1 none', '2', '3', '4', '5 very sore'],
    value: (c) => c.soreness,
    decimals: 0,
  },
  {
    id: 'mood',
    label: 'Mood',
    unit: '',
    legend: ['1 low', '2', '3', '4', '5 high'],
    value: (c) => c.mood,
    decimals: 0,
  },
  {
    id: 'rhr',
    label: 'Resting heart rate',
    unit: 'bpm',
    legend: ['Well below usual', 'Below usual', 'Usual', 'Above usual', 'Well above usual'],
    value: (c) => c.restingHr,
    decimals: 0,
  },
  {
    id: 'hrv',
    label: 'HRV',
    unit: 'ms',
    legend: ['Well below usual', 'Below usual', 'Usual', 'Above usual', 'Well above usual'],
    value: (c) => c.hrvMs,
    decimals: 0,
  },
]

export const METRIC_IDS: readonly string[] = METRICS.map((m) => m.id)

export function isGridMetric(v: unknown): v is GridMetric {
  return typeof v === 'string' && METRIC_IDS.includes(v)
}

export const metricInfo = (id: GridMetric): MetricInfo => METRICS.find((m) => m.id === id) ?? (METRICS[0] as MetricInfo)

const bucket = (z: number): HeatLevel => (z < -1.5 ? 0 : z < -0.5 ? 1 : z <= 0.5 ? 2 : z <= 1.5 ? 3 : 4)

/** One heat cell for a check-in, or null when the athlete did not check in or left the value out. */
export function cellFor(
  metric: GridMetric,
  checkIn: SeedCheckIn | undefined,
  history: readonly SeedCheckIn[],
  athleteId: AthleteId,
): HeatCell | null {
  if (!checkIn) return null
  const info = metricInfo(metric)
  const v = info.value(checkIn)
  if (v === undefined || !Number.isFinite(v)) return null
  const text = v.toFixed(info.decimals)
  const who = ATHLETES.find((a) => a.id === athleteId)?.name ?? athleteId
  const label = `${who}, ${fmtDay(checkIn.day)}: ${info.label} ${text}${info.unit ? ` ${info.unit}` : ''}`
  switch (metric) {
    case 'sleep': {
      const level: HeatLevel = v < 5 ? 0 : v < 6 ? 1 : v < 7 ? 2 : v < 8 ? 3 : 4
      return v < 6 ? { level, text, glyph: '↓', label } : { level, text, label }
    }
    case 'soreness':
      return { level: (Math.min(5, Math.max(1, Math.round(v))) - 1) as HeatLevel, text, ...(v >= 4 ? { glyph: '↑' } : {}), label }
    case 'mood':
      return { level: (Math.min(5, Math.max(1, Math.round(v))) - 1) as HeatLevel, text, ...(v <= 2 ? { glyph: '↓' } : {}), label }
    case 'rhr':
    case 'hrv': {
      const key = metric === 'rhr' ? 'restingHr' : 'hrvMs'
      const stored = ATHLETES.find((a) => a.id === athleteId)?.baselines ?? { restingHr: 50, hrvMs: 70 }
      const b = baselineOrStored(history, key, checkIn.day, stored)
      const sd = b.sd && b.sd > 0 ? b.sd : metric === 'rhr' ? 1.5 : b.mean * 0.07
      const z = (v - b.mean) / sd
      const worse = metric === 'rhr' ? z > 1 : z < -1
      return { level: bucket(z), text, ...(worse ? { glyph: metric === 'rhr' ? '↑' : '↓' } : {}), label }
    }
  }
}

// ------------------------------------------------------------------ inbox

export type StatusFilter = 'open' | 'resolved' | 'all'
export const STATUS_FILTERS: readonly { id: StatusFilter; label: string }[] = [
  { id: 'open', label: 'Open' },
  { id: 'resolved', label: 'Resolved' },
  { id: 'all', label: 'All' },
]
export const isStatusFilter = (v: unknown): v is StatusFilter => STATUS_FILTERS.some((f) => f.id === v)

export const SEVERITY_LABEL: Record<Severity, string> = { act: 'Act', watch: 'Watch', info: 'Info' }
export const STATUS_TEXT = { open: 'Open', acknowledged: 'Acknowledged', resolved: 'Resolved' } as const
const SEVERITY_RANK: Record<Severity, number> = { act: 2, watch: 1, info: 0 }
const STATUS_RANK = { open: 0, acknowledged: 1, resolved: 2 } as const

export const RESOLVED_WINDOW_DAYS = 28

/** Open before acknowledged, then Act, Watch, Info, then newest first, then athlete name. */
export function sortFlags(flags: readonly FlagRecord[]): FlagRecord[] {
  return flags.toSorted(
    (a, b) =>
      STATUS_RANK[a.status] - STATUS_RANK[b.status] ||
      SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] ||
      b.openedDay - a.openedDay ||
      a.athleteId.localeCompare(b.athleteId),
  )
}

export function filterFlags(flags: readonly FlagRecord[], status: StatusFilter, today: DayOffset): FlagRecord[] {
  const kept = flags.filter((f) => {
    if (status === 'open') return f.status !== 'resolved'
    if (status === 'all') return true
    if (status === 'resolved') return f.status === 'resolved' && (f.resolvedDay ?? f.openedDay) >= today - RESOLVED_WINDOW_DAYS
    return f.status === status
  })
  return sortFlags(kept)
}

/** Series the flag chart draws, by rule. */
export const RULE_SERIES: Partial<Record<FlagRuleId, { label: string; key: 'sleepHours' | 'soreness' | 'mood' | 'hrvMs' | 'restingHr' | 'fitness' | 'form'; unit: string }>> = {
  'hrv-low': { label: 'HRV', key: 'hrvMs', unit: 'ms' },
  'rhr-high': { label: 'Resting heart rate', key: 'restingHr', unit: 'bpm' },
  'sleep-short': { label: 'Sleep', key: 'sleepHours', unit: 'h' },
  'soreness-high': { label: 'Soreness', key: 'soreness', unit: '' },
  'mood-low-under-load': { label: 'Mood', key: 'mood', unit: '' },
  'ramp-high': { label: 'Fitness', key: 'fitness', unit: '' },
  'form-deep': { label: 'Form', key: 'form', unit: '' },
}

// ------------------------------------------------------------------ undo

export const FLAG_UNDO_STALE = 'That flag has changed since, so nothing was undone.'

/**
 * Run one coach action on one flag and return its Undo, or undefined if the action changed
 * nothing. Undo puts back that flag's own lifecycle fields and nothing else, and only while the
 * flag is still as the action left it. A flag that has changed since (resolved, noted, closed by
 * the rules) is left alone and the coach is told.
 */
export function flagActionUndo(athleteId: AthleteId, flagId: string, run: () => void): (() => void) | undefined {
  const read = () => {
    const state = useLaree.getState().data.flagsState[athleteId]
    const rec = state.flags.find((f) => f.id === flagId)
    return rec ? { life: lifecycleOf(rec), quiet: state.quiet[rec.ruleId] === true } : undefined
  }
  const before = read()
  run()
  const after = read()
  if (!before || !after || sameLifecycle(before.life, after.life)) return undefined
  return () => {
    const done = useLaree.getState().undoFlagAction(athleteId, flagId, before.life, after.life, after.quiet && !before.quiet)
    if (!done) showToast(FLAG_UNDO_STALE)
  }
}
