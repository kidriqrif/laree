import { paceZoneRanges, wholeZoneRanges } from '../../../domain/metrics/zones.ts'
import { formatPace } from '../../../domain/steps.ts'
import { dayToDate, weekOfDay } from '../../../domain/time.ts'
import type { AthleteId, DayOffset, Sport, Threshold, ThresholdKind } from '../../../domain/types.ts'

export interface KindInfo {
  kind: ThresholdKind
  label: string
}

const KINDS: Record<ThresholdKind, KindInfo> = {
  ftp: { kind: 'ftp', label: 'FTP' },
  thresholdPace: { kind: 'thresholdPace', label: 'Threshold pace' },
  css: { kind: 'css', label: 'CSS' },
  lthr: { kind: 'lthr', label: 'LTHR' },
  restingHr: { kind: 'restingHr', label: 'Resting heart rate' },
}

/** The thresholds that apply to an athlete's sports, in display order. */
export function kindsFor(sports: readonly Sport[]): KindInfo[] {
  const out: KindInfo[] = []
  if (sports.includes('bike')) out.push(KINDS.ftp)
  if (sports.includes('run')) out.push(KINDS.thresholdPace)
  if (sports.includes('swim')) out.push(KINDS.css)
  out.push(KINDS.lthr, KINDS.restingHr)
  return out
}

/** Value text. Pace is stored as speed in m/s. */
export function valueText(kind: ThresholdKind, value: number): string {
  switch (kind) {
    case 'ftp':
      return `${Math.round(value)} W`
    case 'thresholdPace':
      return `${formatPace(1000 / value)} /km`
    case 'css':
      return `${formatPace(100 / value)} /100 m`
    default:
      return `${Math.round(value)} bpm`
  }
}

export function sourceText(source: Threshold['source']): string {
  return source === 'coachEdit' ? 'Coach' : source === 'test' ? 'a test' : 'the starting set-up'
}

const DAY_FMT = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
export const dateText = (day: DayOffset) => DAY_FMT.format(dayToDate(day))

/** Oldest first. */
export function historyOf(all: readonly Threshold[], athleteId: AthleteId, kind: ThresholdKind): Threshold[] {
  return all
    .filter((t) => t.athleteId === athleteId && t.kind === kind)
    .toSorted((a, b) => a.effectiveFromDay - b.effectiveFromDay)
}

export function currentOf(history: readonly Threshold[], today: DayOffset): Threshold | undefined {
  let cur: Threshold | undefined
  for (const t of history) if (t.effectiveFromDay <= today) cur = t
  return cur
}

/** "FTP 245 W to 255 W, set by Coach, from week 9 (date)". One sentence per change. */
export function changeLines(history: readonly Threshold[], label: string): string[] {
  const lines: string[] = []
  for (let i = 1; i < history.length; i++) {
    const prev = history[i - 1] as Threshold
    const cur = history[i] as Threshold
    lines.push(
      `${label} ${valueText(cur.kind, prev.value)} to ${valueText(cur.kind, cur.value)}, set by ${sourceText(cur.source)}, from week ${weekOfDay(cur.effectiveFromDay)} (${dateText(cur.effectiveFromDay)})`,
    )
  }
  return lines
}

export interface ZoneRow {
  zone: number
  name: string
  range: string
}

export function zoneRows(kind: ThresholdKind, value: number): ZoneRow[] {
  if (kind === 'ftp' || kind === 'lthr') {
    const unit = kind === 'ftp' ? 'W' : 'bpm'
    return wholeZoneRanges(kind === 'ftp' ? 'power' : 'heartRate', value).map((z) => ({
      zone: z.zone,
      name: z.name,
      range:
        z.low === null
          ? `up to ${z.high ?? 0} ${unit}`
          : z.high === null
            ? `${z.low} ${unit} and above`
            : `${z.low} to ${z.high} ${unit}`,
    }))
  }
  if (kind === 'thresholdPace' || kind === 'css') {
    const per = kind === 'css' ? 100 : 1000
    const unit = kind === 'css' ? '/100 m' : '/km'
    return paceZoneRanges(kind === 'css' ? 'swim' : 'runPace', per / value).map((z) => ({
      zone: z.zone,
      name: z.name,
      range:
        z.slowEdgeS === null
          ? `slower than ${formatPace(z.fastEdgeS ?? 0)} ${unit}`
          : z.fastEdgeS === null
            ? `${formatPace(z.slowEdgeS)} ${unit} or faster`
            : `${formatPace(z.slowEdgeS)} to ${formatPace(z.fastEdgeS)} ${unit}`,
    }))
  }
  return []
}
