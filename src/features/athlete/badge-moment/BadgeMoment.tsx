import { useInRouterContext, useNavigate } from 'react-router'
import { useViewer } from '../../../app/viewer.ts'
import { selectUnseenBadges } from '../../../data/selectors.ts'
import { useLaree } from '../../../data/store.ts'
import { dayToDate } from '../../../domain/time.ts'
import type { BadgeAward, BadgeKey } from '../../../domain/gamification.ts'
import { Button } from '../../../ui/core/index.ts'
import { BADGES, badgeFace, badgeLine } from '../progress/copy.ts'
import styles from './BadgeMoment.module.css'

const dateText = (day: number): string =>
  dayToDate(day).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })

/** Two halves of tape that part. Without motion the tape is drawn already broken. */
function FinishTape({ face }: { face: string }) {
  return (
    <svg className={styles.tape} viewBox="0 0 240 56" aria-hidden="true" data-testid="finish-tape">
      <g className={styles.tapeLeft}>
        <path d="M0 14h112l-6 14 6 14H0z" className={styles.strip} />
        <path d="M0 28h108" className={styles.stripe} />
      </g>
      <g className={styles.tapeRight}>
        <path d="M240 14H128l6 14-6 14h112z" className={styles.strip} />
        <path d="M240 28H132" className={styles.stripe} />
      </g>
      <text x="120" y="35" textAnchor="middle" className={styles.face}>
        {face}
      </text>
    </svg>
  )
}

function Moment({ award, onDone, onSee }: { award: BadgeAward; onDone: () => void; onSee: () => void }) {
  const races = useLaree((s) => s.data.races)
  const info = BADGES[award.key]
  return (
    <section className={styles.moment} aria-label="New badge" data-testid="badge-moment" data-badge={award.key}>
      <FinishTape face={badgeFace(award, races)} />
      <div className={styles.text}>
        <p className={styles.kicker}>New badge</p>
        <h2 className={styles.name}>{info.name}</h2>
        <p className={styles.line}>{badgeLine(award)}</p>
        <p className={styles.date}>{dateText(award.earnedDay)}</p>
      </div>
      <div className={styles.actions}>
        <Button variant="primary" onPress={onSee}>
          See your badges
        </Button>
        <Button variant="quiet" onPress={onDone}>
          Dismiss
        </Button>
      </div>
    </section>
  )
}

function Inner() {
  const athleteId = useViewer((s) => s.athleteId)
  const unseen = useLaree((s) => selectUnseenBadges(s.data, athleteId))
  const markSeen = useLaree((s) => s.markBadgesSeen)
  const navigate = useNavigate()
  // Saved data can hold a badge key this version no longer has; those are skipped, not drawn.
  const first = unseen.find((b) => Object.hasOwn(BADGES, b.key))
  if (!first) return <output aria-live="polite" className={styles.live} />
  const award: BadgeAward = {
    id: first.id,
    athleteId: first.athleteId,
    key: first.key as BadgeKey,
    earnedDay: first.earnedDay,
    sourceItemId: first.sourceItemId ?? '',
  }
  return (
    <output aria-live="polite" className={styles.live}>
      <Moment
        key={award.id}
        award={award}
        onDone={() => markSeen(athleteId, [award.id])}
        onSee={() => {
          markSeen(athleteId, [award.id])
          void navigate('/athlete/progress')
        }}
      />
    </output>
  )
}

/**
 * The badge moment (A10): an inline card that shows each unseen badge once, one after another.
 * It is not modal, so it never takes focus. Mount it at the top of Today; the log sheet mounts one too.
 */
export function BadgeMoment() {
  return useInRouterContext() ? <Inner /> : null
}
