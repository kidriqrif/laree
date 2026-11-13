import { Link, useNavigate, useParams } from 'react-router'
import { usePageTitle } from '../../../app/pageTitle.ts'
import { useViewer } from '../../../app/viewer.ts'
import { fmtDistance, fmtDuration, fmtNumber } from '../../../charts/index.ts'
import { currentDay } from '../../../data/selectors.ts'
import { thresholdsOn } from '../../../data/seed/people.ts'
import { useLaree } from '../../../data/store.ts'
import { workoutTotals } from '../../../domain/steps.ts'
import type { PlainStep, Step } from '../../../domain/types.ts'
import { Button, Card, EmptyState, SportMark, StatusChip } from '../../../ui/core/index.ts'
import { showToast } from '../../../ui/overlay/index.ts'
import { BAND_LABELS, fmtWeekdayDate, sessionName, statusOf } from '../../shared/activity/format.ts'
import { LOG_MATCH_DRAFT, type LogMatchDraft } from '../today/logMatch.ts'
import { ProfileChart } from './ProfileChart.tsx'
import { KIND_LABEL, segmentsOf, stepSentence, targetText } from './targets.ts'
import styles from './WorkoutPage.module.css'

function NotFoundCard() {
  return (
    <EmptyState
      headingLevel={2}
      title="Session not found"
      description="This session is not in your plan. It may have been moved or removed."
      action={
        <Link to="/athlete/today" className={styles.link}>
          Go to Today
        </Link>
      }
    />
  )
}

function StepRow({ step, th }: { step: PlainStep; th: ReturnType<typeof thresholdsOn> }) {
  const t = step.target ? targetText(step.target, th) : null
  return (
    <li className={styles.step}>
      <span className={styles.kind}>{KIND_LABEL[step.kind]}</span>
      <span className={styles.sentence}>{stepSentence(step, th)}</span>
      {t?.missing ? <span className={styles.note}>{t.missing}</span> : null}
      {step.note ? <span className={styles.note}>{step.note}</span> : null}
    </li>
  )
}

function StepList({ steps, th }: { steps: readonly Step[]; th: ReturnType<typeof thresholdsOn> }) {
  return (
    <ol className={styles.steps} aria-label="Steps">
      {steps.map((s) =>
        s.kind === 'repeat' ? (
          <li key={s.id} className={styles.block}>
            <span className={styles.repeat}>{s.repeat} times</span>
            <ol className={styles.steps}>
              {s.steps.map((c) => (
                <StepRow key={c.id} step={c} th={th} />
              ))}
            </ol>
          </li>
        ) : (
          <StepRow key={s.id} step={s} th={th} />
        ),
      )}
    </ol>
  )
}

/** A7. One planned session in full, with targets in the athlete's own numbers. */
export default function WorkoutPage() {
  const { workoutId = '' } = useParams()
  const navigate = useNavigate()
  const athleteId = useViewer((s) => s.athleteId)
  const data = useLaree((s) => s.data)
  const found = data.planned.find((w) => w.id === workoutId)
  const workout = found?.athleteId === athleteId ? found : undefined
  usePageTitle(workout?.title)
  if (!workout) return <NotFoundCard />

  const today = currentDay()
  const th = thresholdsOn(athleteId, workout.day, data.thresholds)
  const totals = workoutTotals(workout.steps, workout.sport, th, {
    plannedDurationS: workout.plannedDurationS,
    ...(workout.plannedDistanceM !== undefined ? { plannedDistanceM: workout.plannedDistanceM } : {}),
  })
  const activity = data.activities.find((a) => a.matchedWorkoutId === workout.id)
  const done = activity !== undefined
  const missed = !done && workout.day < today
  const canLog = !done && workout.day <= today
  const segments = segmentsOf(workout.steps, workout.sport, th)
  const distance = totals.distanceM ?? workout.plannedDistanceM
  const minutes = Math.round(workout.plannedDurationS / 60)

  return (
    <article className={styles.page} aria-labelledby="workout-title">
      <header className={styles.head}>
        <p className={styles.date}>
          <SportMark sport={workout.sport === 'other' ? 'strength' : workout.sport} showLabel />
          <span>{fmtWeekdayDate(workout.day)}</span>
          {workout.keySession ? <span className={styles.key}>Key session</span> : null}
        </p>
        <h1 id="workout-title" className={styles.title}>
          {sessionName(workout.title, workout.sport)}
        </h1>
        <dl className={styles.facts}>
          <div>
            <dt>Duration</dt>
            <dd>{fmtDuration(totals.durationS)}</dd>
          </div>
          {distance !== undefined ? (
            <div>
              <dt>Distance</dt>
              <dd>{fmtDistance(distance, workout.sport)}</dd>
            </div>
          ) : null}
          <div>
            <dt>Planned load</dt>
            <dd>{fmtNumber(workout.plannedLoad)}</dd>
          </div>
        </dl>
        <p className={styles.status}>
          {done && activity ? (
            <>
              <StatusChip status={statusOf(activity.complianceBand ?? 'onPlan')} label={BAND_LABELS[activity.complianceBand ?? 'onPlan']} />
              <Link to={`/athlete/activity/${activity.id}`} className={styles.link}>
                Open the activity
              </Link>
            </>
          ) : missed ? (
            <StatusChip status="missed" />
          ) : (
            <span className={styles.upcoming}>Upcoming</span>
          )}
        </p>
      </header>

      {workout.coachNote ? (
        <Card as="section" aria-label="Coach's note" className={styles.note}>
          <h2 className={styles.h2}>Coach&rsquo;s note</h2>
          <p>{workout.coachNote}</p>
        </Card>
      ) : null}

      {segments.length > 0 ? (
        <>
          <ProfileChart segments={segments} />
          <section aria-labelledby="steps-h">
            <h2 id="steps-h" className={styles.h2}>
              Steps
            </h2>
            <StepList steps={workout.steps} th={th} />
          </section>
        </>
      ) : (
        <p className={styles.free}>{minutes} min {workout.sport}. No set structure.</p>
      )}

      <div className={styles.actions}>
        {canLog ? (
          <Button variant="primary" onPress={() => {
              // The log sheet lives on Today: choose this session as the match first.
              useLaree.getState().setDraft(LOG_MATCH_DRAFT, {
                athleteId,
                workoutId: workout.id,
                chosenOn: today,
              } satisfies LogMatchDraft)
              void navigate('/athlete/today?sheet=log')
            }}>
            Log it
          </Button>
        ) : null}
        <Button variant="quiet" onPress={() => showToast('Sent to your device (simulated). Nothing leaves this prototype.')}>
          Send to device (simulated)
        </Button>
      </div>
    </article>
  )
}
