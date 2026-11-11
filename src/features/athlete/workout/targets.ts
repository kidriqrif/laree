/** Step targets in an athlete's own numbers. Pure: no React, no store. */
import type { LoadThresholds } from '../../../domain/metrics/load.ts'
import { formatPace, resolveTarget } from '../../../domain/steps.ts'
import { zoneOf } from '../../../domain/metrics/zones.ts'
import type { PlainStep, Sport, Step, StepTarget, StepTargetKind } from '../../../domain/types.ts'

const BASIS_WORD: Record<StepTargetKind, string> = {
  pctFtp: 'FTP',
  pctThresholdPace: 'threshold',
  pctLthr: 'threshold heart rate',
  pctCss: 'swim threshold',
  rpe: '',
}

const MISSING_WORD: Record<StepTargetKind, string> = {
  pctFtp: 'FTP',
  pctThresholdPace: 'threshold pace',
  pctLthr: 'threshold heart rate',
  pctCss: 'swim threshold',
  rpe: '',
}

export const KIND_LABEL: Record<PlainStep['kind'], string> = {
  warmup: 'Warm-up',
  steady: 'Steady',
  interval: 'Interval',
  recovery: 'Recovery',
  cooldown: 'Cool-down',
}

const range = (low: number, high: number, fmt: (n: number) => string = String): string =>
  low === high ? fmt(low) : `${fmt(low)}-${fmt(high)}`

/** "45 s", "8 min", "2 min 30 s", "1 h 09 min". */
export function durationLabel(seconds: number): string {
  const s = Math.max(0, Math.round(seconds))
  if (s < 60) return `${s} s`
  if (s < 3600) {
    const m = Math.floor(s / 60)
    const r = s % 60
    return r === 0 ? `${m} min` : `${m} min ${r} s`
  }
  const h = Math.floor(s / 3600)
  return `${h} h ${String(Math.round((s % 3600) / 60)).padStart(2, '0')} min`
}

export function distanceLabel(metres: number): string {
  return metres >= 1000 ? `${Math.round(metres / 100) / 10} km` : `${Math.round(metres)} m`
}

export interface TargetText {
  /** "95-100% threshold", or "RPE 7". */
  basis: string
  /** "4:25-4:39 /km", or null when it cannot be worked out. */
  absolute: string | null
  /** Set when the athlete lacks the threshold the target needs. */
  missing: string | null
}

/** A target as a percentage plus numbers from the athlete's thresholds. */
export function targetText(target: StepTarget, th: LoadThresholds): TargetText {
  if (target.kind === 'rpe') {
    return { basis: `RPE ${range(target.low, target.high)}`, absolute: null, missing: null }
  }
  const basis = `${range(target.low, target.high)}% ${BASIS_WORD[target.kind]}`
  const r = resolveTarget(target, th)
  if (!r) return { basis, absolute: null, missing: `Ask Coach to set your ${MISSING_WORD[target.kind]}.` }
  switch (r.kind) {
    case 'power':
      return { basis, absolute: `${range(r.low, r.high)} W`, missing: null }
    case 'heartRate':
      return { basis, absolute: `${range(r.low, r.high)} bpm`, missing: null }
    case 'pace':
      return { basis, absolute: `${range(r.low, r.high, formatPace)} /km`, missing: null }
    case 'swimPace':
      return { basis, absolute: `${range(r.low, r.high, formatPace)} /100 m`, missing: null }
    case 'effort':
      return { basis, absolute: null, missing: null }
  }
}

function sizeLabel(step: PlainStep): string {
  if (step.durationS !== undefined) return durationLabel(step.durationS)
  if (step.distanceM !== undefined) return distanceLabel(step.distanceM)
  return ''
}

/** One line for a step, for example "10 min at 95-100% threshold, 4:25-4:39 /km". */
export function stepSentence(step: PlainStep, th: LoadThresholds): string {
  const size = sizeLabel(step)
  if (!step.target) return `${size} ${KIND_LABEL[step.kind].toLowerCase()}`.trim()
  const t = targetText(step.target, th)
  const core = `${size} at ${t.basis}`
  return t.absolute ? `${core}, ${t.absolute}` : core
}

/** The zone (1 to 5) a target sits in, from its mid-point. */
export function targetZone(target: StepTarget | undefined, kind: PlainStep['kind']): number {
  if (!target) return kind === 'interval' ? 4 : kind === 'steady' ? 2 : 1
  const mid = (target.low + target.high) / 2
  let zone: number
  switch (target.kind) {
    case 'pctFtp':
      zone = zoneOf('power', mid, 100)
      break
    case 'pctLthr':
      zone = zoneOf('heartRate', mid, 100)
      break
    case 'pctThresholdPace':
      zone = zoneOf('runPace', mid, 100)
      break
    case 'pctCss':
      zone = zoneOf('swim', mid, 100)
      break
    case 'rpe':
      zone = Math.ceil(mid / 2)
      break
  }
  return Math.min(5, Math.max(1, zone))
}

const GUESS_MPS: Record<Sport, number> = { run: 3.2, bike: 8, swim: 0.9, strength: 1, other: 2 }

export interface Segment {
  startS: number
  durS: number
  /** Bar height at each end, as a percentage of threshold (RPE counts 10 per point). */
  from: number
  to: number
  zone: number
  label: string
}

function level(step: PlainStep): { from: number; to: number } {
  const t = step.target
  if (!t) return { from: 55, to: 55 }
  if (t.kind === 'rpe') return { from: t.low * 10, to: t.high * 10 }
  if (step.kind === 'warmup' && t.low < t.high) return { from: t.low, to: t.high }
  if (step.kind === 'cooldown' && t.low < t.high) return { from: t.high, to: t.low }
  const mid = (t.low + t.high) / 2
  return { from: mid, to: mid }
}

/** Steps flattened (repeat blocks expanded) into timed segments for the profile chart. */
export function segmentsOf(steps: readonly Step[], sport: Sport, th: LoadThresholds): Segment[] {
  const out: Segment[] = []
  let t = 0
  const add = (s: PlainStep) => {
    const durS = s.durationS ?? (s.distanceM ? s.distanceM / GUESS_MPS[sport] : 0)
    if (durS <= 0) return
    const { from, to } = level(s)
    out.push({ startS: t, durS, from, to, zone: targetZone(s.target, s.kind), label: stepSentence(s, th) })
    t += durS
  }
  for (const s of steps) {
    if (s.kind === 'repeat') {
      for (let i = 0; i < s.repeat; i++) s.steps.forEach(add)
    } else add(s)
  }
  return out
}

export const ZONE_LABELS = ['Recovery', 'Endurance', 'Tempo', 'Threshold', 'Hard'] as const
