import { ATHLETES } from '../../../app/people.ts'
import { fmtDay, Sparkline } from '../../../charts/index.ts'
import { ATHLETES as SEED_ATHLETES } from '../../../data/seed/people.ts'
import { selectCheckInSkipped } from '../../../data/selectors.ts'
import { useLaree } from '../../../data/store.ts'
import { baselineOrStored, usualLabel } from '../../../domain/baselines.ts'
import type { AthleteId, DayOffset } from '../../../domain/types.ts'
import { Drawer } from '../../../ui/overlay/index.ts'
import { CheckInSummaryPanel } from '../../shared/ai-panels/index.ts'
import { METRICS } from './model.ts'
import styles from './CheckIns.module.css'

export interface CheckInDetailDrawerProps {
  athleteId: AthleteId
  day: DayOffset
  onClose: () => void
}

const baselineKey = { rhr: 'restingHr', hrv: 'hrvMs' } as const

/** C15. One day's check-in against the athlete's own usual, with the 14 days before it. */
export default function CheckInDetailDrawer({ athleteId, day, onClose }: CheckInDetailDrawerProps) {
  const data = useLaree((s) => s.data)
  const name = ATHLETES.find((a) => a.id === athleteId)?.name ?? athleteId
  const mine = data.checkIns.filter((c) => c.athleteId === athleteId)
  const checkIn = mine.find((c) => c.day === day)
  const skipped = selectCheckInSkipped(data, athleteId, day)
  const stored = SEED_ATHLETES.find((a) => a.id === athleteId)?.baselines ?? { restingHr: 50, hrvMs: 70 }
  const first = day - 13
  const days = Array.from({ length: 14 }, (_, i) => first + i)

  return (
    <Drawer
      isOpen
      onOpenChange={(o) => !o && onClose()}
      title={`${name}, ${fmtDay(day)}`}
      className={styles.drawer}
      data-testid="checkin-detail"
    >
      <div className={styles.detail}>
        {checkIn ? (
          <section aria-labelledby="cd-day">
            <h3 id="cd-day">The day</h3>
            <dl className={styles.facts}>
              {METRICS.map((m) => {
                const v = m.value(checkIn)
                const key = m.id === 'rhr' || m.id === 'hrv' ? baselineKey[m.id] : null
                const usual = key ? usualLabel(key, baselineOrStored(mine, key, day, stored)) : null
                return (
                  <div key={m.id} className={styles.fact}>
                    <dt>{m.label}</dt>
                    <dd data-numeric>
                      {v === undefined ? 'Not recorded' : `${v.toFixed(m.decimals)}${m.unit ? ` ${m.unit}` : ''}`}
                      {usual && v !== undefined ? <span className={styles.muted}> · {usual}</span> : null}
                    </dd>
                  </div>
                )
              })}
            </dl>
            {checkIn.note ? <p>"{checkIn.note}"</p> : null}
            {checkIn.unwell ? (
              <p>
                Marked {checkIn.unwell.kind === 'ill' ? 'ill' : 'injured'}: {checkIn.unwell.note}
              </p>
            ) : null}
          </section>
        ) : (
          <p className={styles.muted}>
            {skipped ? `${name} chose "Not today" on this day.` : `${name} did not check in on this day.`}
          </p>
        )}

        <section aria-labelledby="cd-14">
          <h3 id="cd-14">Last 14 days</h3>
          <ul className={styles.plain}>
            {METRICS.map((m) => (
              <li key={m.id} className={styles.trend}>
                <span>{m.label}</span>
                <Sparkline
                  values={days.map((d) => {
                    const c = mine.find((x) => x.day === d)
                    return c ? (m.value(c) ?? null) : null
                  })}
                  label={`${m.label}, 14 days to ${fmtDay(day)}`}
                  height={28}
                  formatValue={(n) => `${n.toFixed(m.decimals)}${m.unit ? ` ${m.unit}` : ''}`}
                />
              </li>
            ))}
          </ul>
        </section>

        <CheckInSummaryPanel athleteId={athleteId} day={day} />
      </div>
    </Drawer>
  )
}
