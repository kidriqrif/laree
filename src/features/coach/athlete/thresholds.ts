import { thresholdOn } from '../../../data/selectors.ts'
import type { LareeData } from '../../../data/store.ts'
import { fmtPace } from '../../../charts/index.ts'
import type { AthleteId, DayOffset, Threshold, ThresholdKind, ThresholdSource } from '../../../domain/types.ts'

/** The four thresholds the coach edits, in display order. */
export const EDITABLE_KINDS = ['ftp', 'thresholdPace', 'css', 'lthr'] as const
export type EditableKind = (typeof EDITABLE_KINDS)[number]

export const KIND_LABEL: Record<EditableKind, string> = {
  ftp: 'FTP',
  thresholdPace: 'Threshold pace',
  css: 'CSS',
  lthr: 'LTHR',
}

export const SOURCE_LABEL: Record<ThresholdSource, string> = {
  seed: 'Starting value',
  test: 'Test',
  coachEdit: 'Coach estimate',
}

/** Sensible ranges, in the stored unit (W, m/s, m/s, bpm). */
export const RANGE: Record<EditableKind, [number, number]> = {
  ftp: [80, 600],
  thresholdPace: [1000 / 540, 1000 / 150],
  css: [100 / 180, 100 / 50],
  lthr: [100, 220],
}

export function formatThreshold(kind: ThresholdKind, value: number | undefined): string {
  if (value === undefined) return 'Not set'
  switch (kind) {
    case 'ftp':
      return `${Math.round(value)} W`
    case 'thresholdPace':
      return fmtPace(value, 'run')
    case 'css':
      return fmtPace(value, 'swim')
    default:
      return `${Math.round(value)} bpm`
  }
}

/** "FTP 255 W · Threshold 4:25 /km · CSS 1:48 /100 m · LTHR 166 bpm", skipping what is not set. */
export function thresholdsLine(data: LareeData, athleteId: AthleteId, day: DayOffset): string {
  const parts: string[] = []
  for (const kind of EDITABLE_KINDS) {
    const v = thresholdOn(data, athleteId, kind, day)
    if (v === undefined) continue
    parts.push(`${kind === 'thresholdPace' ? 'Threshold' : KIND_LABEL[kind]} ${formatThreshold(kind, v)}`)
  }
  return parts.length > 0 ? parts.join(' · ') : 'No thresholds set'
}

/** Every editable threshold row for an athlete, newest first. */
export function thresholdHistory(data: LareeData, athleteId: AthleteId): Threshold[] {
  return data.thresholds
    .filter((t) => t.athleteId === athleteId && (EDITABLE_KINDS as readonly string[]).includes(t.kind))
    .toSorted(
      (a, b) =>
        b.effectiveFromDay - a.effectiveFromDay ||
        EDITABLE_KINDS.indexOf(a.kind as EditableKind) - EDITABLE_KINDS.indexOf(b.kind as EditableKind),
    )
}
