/* oxlint-disable jsx-a11y/no-redundant-roles -- role="list" keeps list semantics in Safari when list-style is none */
import { lazy, Suspense, useEffect, useId, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useViewer } from '../../../app/viewer.ts'
import { TrackLap } from '../../../charts/index.ts'
import { currentDay, selectUnseenBadges } from '../../../data/selectors.ts'
import { thresholdsOn } from '../../../data/seed/people.ts'
import { useLaree } from '../../../data/store.ts'
import type { LapState } from '../../../domain/gamification.ts'
import type { LoadThresholds } from '../../../domain/metrics/load.ts'
import type { AthleteId } from '../../../domain/types.ts'
import { EmptyState, PlainButton } from '../../../ui/core/index.ts'
import { IconChevronRight, IconPlus, IconRace } from '../../../ui/icons/icons-core.tsx'
import { isSheetName, SHEET_PARAM } from '../../../ui/overlay/index.ts'
import { fmtWeekdayDate } from '../../shared/activity/format.ts'
import { CheckInStrip } from './CheckInStrip.tsx'
import { KudosSlot } from './KudosSlot.tsx'
import { useOpenLog } from './logMatch.ts'
import { MissedRow, RestBib, SessionBib, TomorrowRows, UnplannedResult } from './SessionBib.tsx'
import { TileBoundary } from './TileBoundary.tsx'
import { TodaySkeleton } from './TodaySkeleton.tsx'
import { PHASE_LABEL, raceLine, todayModel } from './todayModel.ts'
import type { TodayModel } from './todayModel.ts'
import { useStoreReady } from './useStoreReady.ts'
import styles from './TodayPage.module.css'

// The sheets load only once their ?sheet= value is set, so Today's first load stays small.
const LogSheet = lazy(() => import('../log/LogSheet.tsx').then((m) => ({ default: m.LogSheet })))
const CheckInSheet = lazy(() => import('../checkin/CheckInSheet.tsx').then((m) => ({ default: m.CheckInSheet })))
const BadgeMoment = lazy(() => import('../badge-moment/BadgeMoment.tsx').then((m) => ({ default: m.BadgeMoment })))

/** A1 Today: what do I do today, and am I on track this week? */
export default function TodayPage() {
  const athleteId = useViewer((s) => s.athleteId)
  const data = useLaree((s) => s.data)
  const readiness = useStoreReady()
  const day = currentDay()
  const model = useMemo(() => todayModel(data, athleteId, day), [data, athleteId, day])
  const th = useMemo(() => thresholdsOn(athleteId, day, data.thresholds), [athleteId, day, data.thresholds])
  const ready = readiness === 'ready'

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <h1 className={styles.title}>Today</h1>
        <p className={styles.dateline}>
          <span className={styles.date}>{fmtWeekdayDate(day)}</span>
          {ready && model.phase ? <span className={styles.phase}>{PHASE_LABEL[model.phase]}</span> : null}
        </p>
      </header>
      {ready ? <TodayBody model={model} th={th} athleteId={athleteId} /> : null}
      {readiness === 'slow' ? <TodaySkeleton /> : null}
      <SheetHost />
    </div>
  )
}

function TodayBody({ model, th, athleteId }: { model: TodayModel; th: LoadThresholds; athleteId: AthleteId }) {
  const openLog = useOpenLog()
  const alsoId = useId()
  const fresh = model.kind === 'first-time'
  // Sessions stay in planned order. On a two-session day the first one is the hero and the rest
  // follow the check-in strip, so the strip still sits above the fold at 390 by 844.
  const sessions = model.kind === 'sessions' ? model.today.planned : []
  const [lead, ...later] = sessions
  const primaryId = sessions.find((p) => p.evaluation?.status !== 'matched')?.workout.id
  const unplanned = model.kind === 'sessions' ? model.today.unplanned : []

  return (
    <div className={styles.body} data-today={model.kind}>
      <BadgeSlot athleteId={athleteId} />
      <section aria-label={sessions.length > 1 ? 'First session today' : "Today's session"} className={styles.hero}>
        {lead ? (
          <SessionBib item={lead} th={th} primary={lead.workout.id === primaryId} onLog={openLog} />
        ) : (
          <Hero model={model} onLog={openLog} />
        )}
      </section>

      <TileBoundary message="The morning check-in could not be shown here. Everything else on Today still works.">
        <CheckInStrip athleteId={athleteId} day={model.day} />
      </TileBoundary>

      {later.length > 0 || unplanned.length > 0 ? (
        <section aria-labelledby={alsoId} className={styles.hero}>
          <h2 id={alsoId} className={styles.sectionLabel}>
            Also today
          </h2>
          {later.map((item) => (
            <SessionBib key={item.workout.id} item={item} th={th} primary={item.workout.id === primaryId} onLog={openLog} />
          ))}
          {unplanned.map((a) => (
            <UnplannedResult key={a.id} activity={a} />
          ))}
        </section>
      ) : null}

      {fresh ? null : <LapSection lap={model.lap} />}

      {model.missed.length > 0 ? (
        <ul role="list" className={styles.list} aria-label="Missed yesterday">
          {model.missed.map((item) => (
            <li key={item.workout.id}>
              <MissedRow item={item} onLog={openLog} />
            </li>
          ))}
        </ul>
      ) : null}

      {fresh ? null : <NextUp model={model} />}

      <TileBoundary message="Kudos from Coach could not be shown here.">
        <KudosSlot key={athleteId} athleteId={athleteId} />
      </TileBoundary>
    </div>
  )
}

/**
 * A badge earned by a log or by Coach's kudos shows here once, at the top. The live region is always
 * there so the card is announced when it appears; the card's code loads only while a badge is unseen.
 */
function BadgeSlot({ athleteId }: { athleteId: AthleteId }) {
  const unseen = useLaree((s) => selectUnseenBadges(s.data, athleteId).length > 0)
  return (
    <div aria-live="polite" className={styles.badgeSlot}>
      {unseen ? (
        <TileBoundary message="Your new badge could not be shown here. It is on the Progress page.">
          <Suspense fallback={null}>
            <BadgeMoment />
          </Suspense>
        </TileBoundary>
      ) : null}
    </div>
  )
}

/** Today without a planned session: first visit, nothing planned, or a rest day. */
function Hero({ model, onLog }: { model: TodayModel; onLog: (workoutId?: string) => void }) {
  const { today } = model
  const unplanned = today.unplanned.map((a) => <UnplannedResult key={a.id} activity={a} />)
  const logAction = (
    <PlainButton variant="primary" onPress={() => onLog()}>
      <span className={styles.plusLabel}>
        <IconPlus size={20} />
        Log
      </span>
    </PlainButton>
  )

  switch (model.kind) {
    case 'first-time':
      return (
        <EmptyState
          headingLevel={2}
          className={styles.empty}
          data-testid="today-first-time"
          title="Your training starts here"
          description="Coach hasn't planned your first sessions yet. Anything you log still counts."
          action={logAction}
        />
      )
    case 'nothing-planned':
      if (unplanned.length > 0) {
        return (
          <>
            <p className={styles.lead}>Nothing was planned today. Here is what you logged.</p>
            {unplanned}
          </>
        )
      }
      return (
        <EmptyState
          headingLevel={2}
          className={styles.empty}
          data-testid="today-nothing-planned"
          title="Nothing planned today."
          description="Rest, or log something you did."
          action={logAction}
        />
      )
    case 'rest':
      return (
        <>
          <RestBib day={model.day} />
          {unplanned}
        </>
      )
    case 'sessions':
      // TodayBody draws the session bibs itself.
      return null
  }
}

/** The compact lap. The whole tile opens Week. */
function LapSection({ lap }: { lap: LapState }) {
  const headId = useId()
  return (
    <section className={styles.lapSection} aria-labelledby={headId}>
      <h2 id={headId} className={styles.sectionLabel}>
        <Link to="/athlete/week" className={styles.lapLink}>
          This week
          <IconChevronRight size={20} />
        </Link>
      </h2>
      <TileBoundary message="The lap could not be drawn. Week has the same numbers.">
        <TrackLap lap={lap} size="compact" className={styles.lap} />
      </TileBoundary>
    </section>
  )
}

/** Tomorrow and the next race: planning for the day after. */
function NextUp({ model }: { model: TodayModel }) {
  const headId = useId()
  return (
    <section className={styles.next} aria-labelledby={headId}>
      <h2 id={headId} className={styles.sectionLabel}>
        Next up
      </h2>
      <ul role="list" className={styles.list}>
        <TomorrowRows items={model.tomorrow.planned} planned={model.tomorrowPlanned} />
        {model.race ? (
          <li className={styles.race} data-testid="race-countdown">
            <IconRace size={24} />
            <span>{raceLine(model.race, model.day)}</span>
          </li>
        ) : null}
      </ul>
    </section>
  )
}

/**
 * Hosts the log and check-in sheets. Each loads on its first open and then stays mounted, so it can
 * close itself from the URL. An unknown ?sheet= value is dropped and the URL rewritten (IA 8.5).
 */
function SheetHost() {
  const [params, setParams] = useSearchParams()
  const raw = params.get(SHEET_PARAM)
  const [loadLog, setLoadLog] = useState(raw === 'log')
  const [loadCheckIn, setLoadCheckIn] = useState(raw === 'check-in')
  if (raw === 'log' && !loadLog) setLoadLog(true)
  if (raw === 'check-in' && !loadCheckIn) setLoadCheckIn(true)

  useEffect(() => {
    if (raw === null || isSheetName(raw)) return
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.delete(SHEET_PARAM)
        return next
      },
      { replace: true, preventScrollReset: true },
    )
  }, [raw, setParams])

  return (
    <>
      {loadLog ? (
        <Suspense fallback={null}>
          <LogSheet />
        </Suspense>
      ) : null}
      {loadCheckIn ? (
        <Suspense fallback={null}>
          <CheckInSheet />
        </Suspense>
      ) : null}
    </>
  )
}
