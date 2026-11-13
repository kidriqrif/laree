import { REFERENCE_THRESHOLDS } from '../../../data/seed/templates.ts'
import type { WorkoutTemplate } from '../../../domain/types.ts'
import { segmentsOf } from '../../athlete/workout/targets.ts'
import styles from './ProfileMini.module.css'

const W = 96
const H = 24

/** A small zone-coloured profile for a table row. Decorative: the row names the workout. */
export function ProfileMini({ template }: { template: WorkoutTemplate }) {
  const segs = segmentsOf(template.steps, template.sport, REFERENCE_THRESHOLDS)
  const total = segs.reduce((a, s) => a + s.durS, 0)
  if (total <= 0) return <span className={styles.none}>No steps</span>
  const top = Math.max(110, ...segs.flatMap((s) => [s.from, s.to]))
  const x = (s: number) => (s / total) * W
  const y = (v: number) => H - 1 - (v / top) * (H - 3)
  return (
    <svg className={styles.svg} width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden="true" focusable="false">
      {segs.map((s, i) => (
        <polygon
          key={i}
          points={`${x(s.startS)},${H - 1} ${x(s.startS)},${y(s.from)} ${x(s.startS + s.durS)},${y(s.to)} ${x(s.startS + s.durS)},${H - 1}`}
          fill={`var(--zone-${s.zone})`}
        />
      ))}
    </svg>
  )
}
