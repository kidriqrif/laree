import { useInRouterContext } from 'react-router'
import { currentDay } from '../../../data/selectors.ts'
import { useLaree } from '../../../data/store.ts'
import { ATHLETES } from '../../../data/seed/people.ts'
import { PlainButton } from '../../../ui/core/index.ts'
import { useSheetParam } from '../../../ui/overlay/index.ts'
import type { AthleteId, DayOffset } from '../../../domain/types.ts'
import { baselineNote, summaryLine } from '../checkin/checkinText.ts'
import styles from './CheckInStrip.module.css'

export interface CheckInStripProps {
  athleteId: AthleteId
  day: DayOffset
}

/** One line on Today: the prompt, or a summary of the morning's check-in. Renders nothing outside a router. */
export function CheckInStrip(props: CheckInStripProps) {
  return useInRouterContext() ? <Strip {...props} /> : null
}

function Strip({ athleteId, day }: CheckInStripProps) {
  const sheet = useSheetParam('check-in')
  const checkIns = useLaree((s) => s.data.checkIns)
  const skipped = useLaree((s) => s.data.skippedCheckIns)
  const skipCheckIn = useLaree((s) => s.skipCheckIn)
  const mine = checkIns.filter((c) => c.athleteId === athleteId)
  const existing = mine.find((c) => c.day === day)
  const wasSkipped = skipped.some((s) => s.athleteId === athleteId && s.day === day)
  // The window closes at midnight Malaysia time, when today's day offset rolls on.
  const editable = day === currentDay()

  if (existing) {
    const stored = ATHLETES.find((a) => a.id === athleteId)?.baselines
    const history = mine.filter((c) => c.day !== day)
    const notes = stored
      ? [
          baselineNote('restingHr', existing.restingHr, history, day, stored),
          baselineNote('hrvMs', existing.hrvMs, history, day, stored),
        ].filter((n): n is string => n !== null)
      : []
    return (
      <section className={styles.strip} aria-label="Morning check-in" data-testid="check-in-strip">
        <div className={styles.text}>
          <p className={styles.main}>{summaryLine(existing)}</p>
          {notes.length > 0 ? <p className={styles.extra}>{notes.join(' ')}</p> : null}
        </div>
        {editable ? <PlainButton onPress={sheet.open}>Edit</PlainButton> : null}
      </section>
    )
  }

  if (!editable) {
    return (
      <section className={styles.strip} aria-label="Morning check-in" data-testid="check-in-strip">
        <p className={styles.main}>No check-in this day.</p>
      </section>
    )
  }

  return (
    <section className={styles.strip} aria-label="Morning check-in" data-testid="check-in-strip">
      <div className={styles.text}>
        <p className={styles.main}>{wasSkipped ? 'No check-in today.' : 'Morning check-in'}</p>
      </div>
      <div className={styles.actions}>
        {wasSkipped ? null : <PlainButton onPress={() => skipCheckIn(athleteId, day)}>Not today</PlainButton>}
        <PlainButton variant="primary" onPress={sheet.open}>
          Check in
        </PlainButton>
      </div>
    </section>
  )
}
