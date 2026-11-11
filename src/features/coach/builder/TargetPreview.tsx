import { useMemo } from 'react'
import { ATHLETES } from '../../../app/people.ts'
import type { LareeData } from '../../../data/store.ts'
import { thresholdOn } from '../../../data/selectors.ts'
import type { LoadThresholds } from '../../../domain/metrics/load.ts'
import type { AthleteId, PlainStep, Sport, Step } from '../../../domain/types.ts'
import { SegmentedControl } from '../../../ui/form/index.ts'
import { durationLabel, distanceLabel, targetText } from '../../athlete/workout/targets.ts'
import { KIND_NAMES } from './draft.ts'
import styles from './BuilderPage.module.css'

/** An athlete's thresholds on a day, in the units the load and step code take. */
export function thresholdsFor(data: LareeData, athleteId: AthleteId, day: number): LoadThresholds {
  const out: LoadThresholds = {}
  const ftp = thresholdOn(data, athleteId, 'ftp', day)
  const pace = thresholdOn(data, athleteId, 'thresholdPace', day)
  const css = thresholdOn(data, athleteId, 'css', day)
  const lthr = thresholdOn(data, athleteId, 'lthr', day)
  const rhr = thresholdOn(data, athleteId, 'restingHr', day)
  if (ftp !== undefined) out.ftp = ftp
  if (pace) out.thresholdPaceSPerKm = 1000 / pace
  if (css) out.cssSPer100m = 100 / css
  if (lthr !== undefined) out.lthr = lthr
  if (rhr !== undefined) out.restingHr = rhr
  return out
}

const fmtPace = (s: number): string => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`

/** The threshold a sport's targets lean on, in words: "FTP 255 W". */
function basisLine(sport: Sport, th: LoadThresholds, name: string): string {
  switch (sport) {
    case 'bike':
      return th.ftp ? `${name}'s FTP is ${th.ftp} W.` : `${name} has no FTP set.`
    case 'run':
      return th.thresholdPaceSPerKm
        ? `${name}'s threshold pace is ${fmtPace(th.thresholdPaceSPerKm)} /km.`
        : `${name} has no threshold pace set.`
    case 'swim':
      return th.cssSPer100m
        ? `${name}'s swim threshold is ${fmtPace(th.cssSPer100m)} /100 m.`
        : `${name} has no swim threshold set.`
    default:
      return `${name}'s threshold heart rate is ${th.lthr ?? 'not set'}${th.lthr ? ' bpm' : ''}.`
  }
}

export interface TargetPreviewProps {
  steps: Step[]
  sport: Sport
  athleteId: AthleteId
  onAthlete: (id: AthleteId) => void
  thresholds: LoadThresholds
}

export function TargetPreview({ steps, sport, athleteId, onAthlete, thresholds }: TargetPreviewProps) {
  const name = ATHLETES.find((a) => a.id === athleteId)?.name ?? athleteId
  const rows = useMemo(() => {
    const out: { key: string; kind: string; size: string; basis: string; absolute: string | null; missing: boolean }[] = []
    const add = (s: PlainStep, prefix: string) => {
      const size =
        s.durationS !== undefined ? durationLabel(s.durationS) : s.distanceM !== undefined ? distanceLabel(s.distanceM) : ''
      if (!s.target) {
        out.push({ key: s.id, kind: `${prefix}${KIND_NAMES[s.kind]}`, size, basis: 'No target', absolute: null, missing: false })
        return
      }
      const t = targetText(s.target, thresholds)
      out.push({
        key: s.id,
        kind: `${prefix}${KIND_NAMES[s.kind]}`,
        size,
        basis: t.basis,
        absolute: t.absolute,
        missing: t.missing !== null,
      })
    }
    for (const s of steps) {
      if (s.kind === 'repeat') s.steps.forEach((c) => add(c, `${s.repeat} × `))
      else add(s, '')
    }
    return out
  }, [steps, thresholds])
  const anyMissing = rows.some((r) => r.missing)

  return (
    <section className={styles.panel} aria-labelledby="preview-title">
      <h2 id="preview-title" className={styles.panelTitle}>
        Targets for {name}
      </h2>
      <SegmentedControl
        ariaLabel="Preview for athlete"
        options={ATHLETES.map((a) => ({ id: a.id, label: a.name }))}
        value={athleteId}
        onChange={(id) => onAthlete(id as AthleteId)}
      />
      <p className={styles.note}>{basisLine(sport, thresholds, name)}</p>
      {rows.length === 0 ? (
        <p className={styles.note}>Add a step to see targets.</p>
      ) : (
        <ul className={styles.previewList} aria-label={`Targets for ${name}`}>
          {rows.map((r) => (
            <li key={r.key} className={styles.previewItem}>
              <span>
                <span className={styles.previewKind}>{r.kind}</span> {r.size}
              </span>
              <span>{r.absolute ? `${r.absolute} at ${r.basis}` : r.basis}</span>
            </li>
          ))}
        </ul>
      )}
      {anyMissing ? (
        <p className={styles.note}>Showing percentages only where {name} has no threshold for the target.</p>
      ) : null}
    </section>
  )
}
