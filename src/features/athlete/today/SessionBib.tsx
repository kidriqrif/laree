import { useId, useState } from 'react'
import { Link } from 'react-router'
import { fmtDistance, fmtNumber } from '../../../charts/index.ts'
import type { PlannedItem } from '../../../data/selectors.ts'
import type { LoadThresholds } from '../../../domain/metrics/load.ts'
import type { Activity, DayOffset, Sport } from '../../../domain/types.ts'
import { BibCard, PlainButton, SportMark, StatusChip, buttonClass } from '../../../ui/core/index.ts'
import { IconChevronRight, IconSleep } from '../../../ui/icons/index.ts'
import { BAND_LABELS, fmtClock, fmtWeekdayDate, statusOf } from '../../shared/activity/format.ts'
import { durationFigure, mainSetLine, sessionName, sportKey, sportName } from './todayModel.ts'
import styles from './TodayPage.module.css'

function Mark({ sport }: { sport: Sport }) {
  const key = sportKey(sport)
  return key ? <SportMark sport={key} showLabel size={24} /> : <span className={styles.otherMark}>Other</span>
}

function Figure({ seconds, kicker }: { seconds: number; kicker?: string }) {
  const f = durationFigure(seconds)
  return (
    <span className={styles.figure}>
      {kicker ? <span className={styles.kicker}>{kicker}</span> : null}
      <span className={styles.figureLine}>
        <span>{f.value}</span>
        <span className={styles.unit}>{f.unit}</span>
      </span>
    </span>
  )
}

function joinSentences(parts: ReadonlyArray<string | null | false | undefined>): string {
  return parts.filter((p): p is string => typeof p === 'string' && p !== '').map((p) => `${p}.`).join(' ')
}

export interface SessionBibProps {
  item: PlannedItem
  th: LoadThresholds
  /** The screen's one primary action: the first session still to log. */
  primary: boolean
  onLog: (workoutId: string) => void
}

/**
 * Today's session as a race bib. The bib is one link to the workout; "Log it" (or "See activity",
 * once done) sits under it, because a link cannot hold a button.
 */
export function SessionBib({ item, th, primary, onLog }: SessionBibProps) {
  const { workout: w, evaluation, activity } = item
  const done: Activity | undefined = evaluation?.status === 'matched' ? activity : undefined
  const band = done ? evaluation?.band : undefined
  const noteId = useId()
  const title = sessionName(w.title, w.sport)

  // The result stamps in only when it changes while the screen is open, as after a save.
  const isDone = done !== undefined
  const [wasDone, setWasDone] = useState(isDone)
  const [stamp, setStamp] = useState(false)
  if (wasDone !== isDone) {
    setWasDone(isDone)
    setStamp(isDone)
  }

  const planned = durationFigure(w.plannedDurationS)
  const actual = done ? durationFigure(done.summary.durationS) : null
  const main = done ? null : mainSetLine(w.steps, th)
  const name = joinSentences([
    sportName(w.sport),
    title,
    actual ? `Done in ${actual.words}` : planned.words,
    w.keySession && 'Key session',
    band && BAND_LABELS[band],
  ])
  const when = w.startMinute === undefined ? fmtWeekdayDate(w.day) : `${fmtWeekdayDate(w.day)}, ${fmtClock(w.startMinute)}`
  const distanceM = done ? done.summary.distanceM : w.plannedDistanceM
  const distance = distanceM === undefined ? null : fmtDistance(distanceM, w.sport)
  const stubRight = done
    ? [distance, `Planned ${planned.words}`]
    : [distance, `Load ${fmtNumber(w.plannedLoad)}`]

  return (
    <div className={styles.session} data-state={done ? 'done' : 'open'}>
      <Link
        to={`/athlete/workout/${w.id}`}
        className={styles.bibLink}
        aria-label={name}
        aria-describedby={w.coachNote ? noteId : undefined}
        data-testid="session-bib"
      >
        <BibCard
          as="div"
          className={styles.bib}
          mark={
            <span className={styles.markRow}>
              <Mark sport={w.sport} />
              {w.keySession ? <span className={styles.key}>Key session</span> : null}
            </span>
          }
          figure={<Figure seconds={done ? done.summary.durationS : w.plannedDurationS} kicker={done ? 'Done in' : undefined} />}
          caption={
            <span className={styles.caption}>
              <span className={styles.sessionTitle}>{title}</span>
              {done && band ? (
                <span className={styles.result} data-stamp={stamp || undefined}>
                  <StatusChip status={statusOf(band)} label={BAND_LABELS[band]} />
                  <span className={styles.load}>
                    Load <span data-numeric>{fmtNumber(done.load.load)}</span>
                  </span>
                </span>
              ) : null}
              {main ? <span className={styles.mainSet}>{main}</span> : null}
              {w.coachNote ? (
                <span className={styles.note} id={noteId}>
                  <span className={styles.noteLabel}>Coach&rsquo;s note</span>
                  <span className={styles.noteText}>{w.coachNote}</span>
                </span>
              ) : null}
            </span>
          }
          stub={
            <>
              <span>{when}</span>
              <span>{stubRight.filter((s): s is string => s !== null).join(' · ')}</span>
            </>
          }
        />
      </Link>
      <div className={styles.sessionActions}>
        {done ? (
          <Link
            to={`/athlete/activity/${done.id}`}
            className={buttonClass('secondary', styles.wide)}
            aria-label={`See activity: ${title}`}
          >
            See activity
          </Link>
        ) : (
          <PlainButton
            variant={primary ? 'primary' : 'secondary'}
            className={styles.wide}
            aria-label={`Log it: ${title}`}
            onPress={() => onLog(w.id)}
          >
            Log it
          </PlainButton>
        )}
      </div>
    </div>
  )
}

/** A planned rest day: still a bib, because rest is part of the plan. */
export function RestBib({ day }: { day: DayOffset }) {
  return (
    <BibCard
      as="section"
      aria-label="Rest day"
      className={styles.bib}
      data-testid="rest-bib"
      mark={
        <span className={styles.restMark}>
          <IconSleep size={24} />
        </span>
      }
      figure={<span className={styles.restFigure}>Rest day</span>}
      caption={<span className={styles.restText}>Rest days count towards your streak.</span>}
      stub={
        <>
          <span>{fmtWeekdayDate(day)}</span>
          <span>No session</span>
        </>
      }
    />
  )
}

/** Logged today and not matched to a plan. */
export function UnplannedResult({ activity: a }: { activity: Activity }) {
  const f = durationFigure(a.summary.durationS)
  return (
    <Link to={`/athlete/activity/${a.id}`} className={styles.row} data-testid="unplanned-result">
      <StatusChip status="unplanned" />
      <span className={styles.rowMain}>
        <span className={styles.rowTitle}>{sessionName(a.title, a.sport)}</span>
        <span className={styles.rowMeta}>
          {sportName(a.sport)} · {f.words} · Load {fmtNumber(a.load.load)}
        </span>
      </span>
      <IconChevronRight size={20} className={styles.chev} />
    </Link>
  )
}

/** Yesterday's session that ended unlogged. It can still be logged from the sheet. */
export function MissedRow({ item, onLog }: { item: PlannedItem; onLog: (workoutId: string) => void }) {
  const w = item.workout
  return (
    <div className={styles.row} data-testid="missed-row">
      <StatusChip status="missed" />
      <span className={styles.rowMain}>
        <span className={styles.rowTitle}>Yesterday: {sessionName(w.title, w.sport)}</span>
        <span className={styles.rowMeta}>
          {sportName(w.sport)}, {durationFigure(w.plannedDurationS).words}. Did it after all? Log it and it counts.
        </span>
      </span>
      <PlainButton variant="quiet" aria-label={`Log it: yesterday's ${sessionName(w.title, w.sport)}`} onPress={() => onLog(w.id)}>
        Log it
      </PlainButton>
    </div>
  )
}

/** Tomorrow, small: enough to plan the evening. */
export function TomorrowRows({ items, planned }: { items: readonly PlannedItem[]; planned: boolean }) {
  if (items.length === 0) {
    return (
      <li className={styles.row}>
        <span className={styles.rowLabel}>Tomorrow</span>
        <span className={styles.rowMain}>
          <span className={styles.rowTitle}>{planned ? 'Rest day' : 'Nothing planned yet'}</span>
        </span>
      </li>
    )
  }
  return (
    <>
      {items.map(({ workout: w }) => {
        const key = sportKey(w.sport)
        const f = durationFigure(w.plannedDurationS)
        return (
          <li key={w.id}>
            <Link to={`/athlete/workout/${w.id}`} className={styles.row}>
              <span className={styles.rowLabel}>Tomorrow</span>
              {key ? <SportMark sport={key} /> : null}
              <span className={styles.rowMain}>
                <span className={styles.rowTitle}>{sessionName(w.title, w.sport)}</span>
                <span className={styles.rowMeta}>
                  {sportName(w.sport)} · {f.words}
                  {w.keySession ? ' · Key session' : ''}
                </span>
              </span>
              <IconChevronRight size={20} className={styles.chev} />
            </Link>
          </li>
        )
      })}
    </>
  )
}
