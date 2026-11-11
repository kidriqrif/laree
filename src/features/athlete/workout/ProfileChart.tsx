/* oxlint-disable jsx-a11y/prefer-tag-over-role -- an inline SVG chart needs role="img" with a text summary */
import { ChartFrame, fmtMinutesWords, fmtNumber, linear, maxOf, useSize } from '../../../charts/index.ts'
import { durationLabel, ZONE_LABELS } from './targets.ts'
import type { Segment } from './targets.ts'
import styles from './ProfileChart.module.css'

export interface ProfileChartProps {
  segments: readonly Segment[]
  title?: string
}

const H = 120

/** Intensity over time as zone-coloured blocks; ramps slope. Zone names are listed beneath. */
export function ProfileChart({ segments, title = 'Session profile' }: ProfileChartProps) {
  const [ref, width] = useSize<HTMLDivElement>(320)
  const w = Math.max(120, width)
  const total = segments.reduce((a, s) => a + s.durS, 0)
  const top = Math.max(120, maxOf(segments.flatMap((s) => [s.from, s.to]), 100) * 1.05)
  const x = linear([0, Math.max(1, total)], [0, w])
  const y = linear([0, top], [H - 1, 2])
  const used = [...new Set(segments.map((s) => s.zone))].toSorted((a, b) => a - b)
  const hardest = segments.reduce<Segment | undefined>((m, s) => (!m || s.zone > m.zone ? s : m), undefined)
  const summary =
    total === 0 || !hardest
      ? 'No set structure.'
      : `${fmtMinutesWords(total / 60)} in ${segments.length} ${segments.length === 1 ? 'step' : 'steps'}. ` +
        `Hardest: ${durationLabel(hardest.durS)} in the ${ZONE_LABELS[hardest.zone - 1]?.toLowerCase()} zone.`

  return (
    <ChartFrame
      title={title}
      summary={summary}
      table={{
        columns: ['Step', 'Starts at', 'Zone'],
        rows: segments.map((s) => [s.label, durationLabel(s.startS), `Z${s.zone} ${ZONE_LABELS[s.zone - 1] ?? ''}`]),
      }}
    >
      <div ref={ref} className={styles.wrap}>
        <svg width={w} height={H} viewBox={`0 0 ${w} ${H}`} role="img" aria-label={summary} className={styles.svg}>
          <line x1={0} x2={w} y1={H - 0.5} y2={H - 0.5} stroke="var(--chart-axis)" strokeWidth={1} />
          <line
            x1={0}
            x2={w}
            y1={y(100)}
            y2={y(100)}
            stroke="var(--chart-grid)"
            strokeDasharray="2 4"
            strokeWidth={1}
          />
          {segments.map((s, i) => {
            const x0 = x(s.startS)
            const x1 = x(s.startS + s.durS)
            const pts = `${x0},${H - 1} ${x0},${y(s.from)} ${x1},${y(s.to)} ${x1},${H - 1}`
            return (
              <polygon
                key={i}
                points={pts}
                fill={`var(--zone-${s.zone})`}
                stroke="var(--color-bg)"
                strokeWidth={1}
              />
            )
          })}
        </svg>
        <div className={styles.ends} aria-hidden="true">
          <span>0</span>
          <span>{fmtNumber(Math.round(total / 60))} min</span>
        </div>
      </div>
      <ul className={styles.legend}>
        {used.map((z) => (
          <li key={z} className={styles.key}>
            <span className={styles.swatch} style={{ background: `var(--zone-${z})` }} aria-hidden="true" />
            Z{z} {ZONE_LABELS[z - 1]}
          </li>
        ))}
      </ul>
    </ChartFrame>
  )
}
