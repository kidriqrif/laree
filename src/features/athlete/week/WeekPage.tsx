import { Component, useEffect, useMemo, useRef } from 'react'
import type { PointerEvent, ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useViewer } from '../../../app/viewer.ts'
import { TrackLap, fmtDay, fmtMinutesWords } from '../../../charts/index.ts'
import { currentDay, selectRaces, selectWeek } from '../../../data/selectors.ts'
import type { AthleteDay, PlannedItem } from '../../../data/selectors.ts'
import { useLaree } from '../../../data/store.ts'
import { lap } from '../../../domain/gamification.ts'
import type { GamificationInput } from '../../../domain/gamification.ts'
import { BAND_LABELS, band as bandOf, displayPct, roundHalfAway } from '../../../domain/metrics/compliance.ts'
import { currentWeek, relativeWeekLabel, weekRange, weekdayIndex } from '../../../domain/time.ts'
import type { Activity, ComplianceBand, Sport } from '../../../domain/types.ts'
import { Button, Chip, EmptyState, IconButton, SportChip, StatusChip } from '../../../ui/core/index.ts'
import type { SportKey, StatusKey } from '../../../ui/core/index.ts'
import { IconChevronLeft, IconChevronRight } from '../../../ui/icons/index.ts'
import { sessionName } from '../../shared/activity/format.ts'
import { WeeklyRecapPanel } from '../../shared/ai-panels/index.ts'
import styles from './WeekPage.module.css'

const MAX_AHEAD = 12
const SWIPE_PX = 60
const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

const BAND_STATUS: Record<ComplianceBand, StatusKey> = {
  onPlan: 'on-plan',
  short: 'partial',
  under: 'partial',
  over: 'over',
  wellOver: 'over',
  missed: 'missed',
  unplanned: 'unplanned',
}

/** A whole-number `?w=` value, or null for anything else. */
function parseOffset(raw: string | null): number | null {
  if (raw === null || !/^-?\d+$/.test(raw)) return null
  return Math.trunc(Number(raw))
}

function clampOffset(offset: number): number {
  return Math.max(1 - currentWeek(), Math.min(MAX_AHEAD, offset))
}

function SportTag({ sport }: { sport: Sport }) {
  const key: SportKey | null = sport === 'other' ? null : sport
  return key ? <SportChip sport={key} /> : <Chip>Other</Chip>
}

/** A chart that fails shows a notice in its own place. */
class TileBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  override render() {
    if (this.state.failed) {
      return <div className={styles.tile}>The lap could not be drawn. The rest of the week is below.</div>
    }
    return this.props.children
  }
}

function PlannedRow({ item }: { item: PlannedItem }) {
  const { workout, evaluation, activity } = item
  const to = activity && evaluation?.status === 'matched' ? `/athlete/activity/${activity.id}` : `/athlete/workout/${workout.id}`
  const band = evaluation?.band
  return (
    <li>
      <Link to={to} className={styles.item}>
        <SportTag sport={workout.sport} />
        <span className={styles.itemTitle}>{sessionName(workout.title, workout.sport)}</span>
        <span className={styles.itemMeta}>{fmtMinutesWords(workout.plannedDurationS / 60)}</span>
        {band ? <StatusChip status={BAND_STATUS[band]} label={BAND_LABELS[band]} /> : <Chip>Upcoming</Chip>}
      </Link>
    </li>
  )
}

function UnplannedRow({ activity }: { activity: Activity }) {
  return (
    <li>
      <Link to={`/athlete/activity/${activity.id}`} className={styles.item}>
        <SportTag sport={activity.sport} />
        <span className={styles.itemTitle}>{sessionName(activity.title, activity.sport)}</span>
        <span className={styles.itemMeta}>{fmtMinutesWords(activity.summary.durationS / 60)}</span>
        <StatusChip status="unplanned" />
      </Link>
    </li>
  )
}

function DayRow({ day, today, raceNames, notPlanned }: { day: AthleteDay; today: number; raceNames: string[]; notPlanned: boolean }) {
  const empty = day.planned.length === 0 && day.unplanned.length === 0
  return (
    <li className={styles.day} data-today={day.day === today}>
      <h2 className={styles.dayHead}>
        <span>{WEEKDAYS[weekdayIndex(day.day)]}</span>
        <span className={styles.dayMeta}>{fmtDay(day.day)}</span>
        <span className={styles.marks}>
          {day.day === today ? <Chip>Today</Chip> : null}
          {raceNames.map((n) => (
            <Chip key={n}>Race day: {n}</Chip>
          ))}
          {day.checkIn ? <Chip>Checked in</Chip> : null}
        </span>
      </h2>
      {empty ? (
        // An empty day in a week Coach has not planned yet is not a rest day.
        <p className={styles.rest}>{notPlanned ? 'Not planned yet' : 'Rest'}</p>
      ) : (
        <ul className={styles.items}>
          {day.planned.map((p) => (
            <PlannedRow key={p.workout.id} item={p} />
          ))}
          {day.unplanned.map((a) => (
            <UnplannedRow key={a.id} activity={a} />
          ))}
        </ul>
      )}
    </li>
  )
}

export default function WeekPage() {
  const athleteId = useViewer((s) => s.athleteId)
  const data = useLaree((s) => s.data)
  const [params, setParams] = useSearchParams()
  const today = currentDay()
  const nowWeek = currentWeek()

  const offset = clampOffset(parseOffset(params.get('w')) ?? 0)
  const week = nowWeek + offset
  const { firstDay, lastDay } = weekRange(week)

  // A bad or out-of-range value is dropped or clamped and the address rewritten.
  const hasW = params.has('w')
  const canonical = offset === 0 ? null : String(offset)
  useEffect(() => {
    if (hasW && params.get('w') !== canonical) {
      const next = new URLSearchParams(params)
      if (canonical === null) next.delete('w')
      else next.set('w', canonical)
      setParams(next, { replace: true })
    }
  }, [hasW, canonical, params, setParams])

  const summary = useLaree((s) => selectWeek(s.data, athleteId, week, today))
  const races = useLaree((s) => selectRaces(s.data, athleteId))

  const lapState = useMemo(() => {
    const input: GamificationInput = {
      athleteId,
      today,
      planned: data.planned.filter((w) => w.athleteId === athleteId),
      activities: data.activities.filter((a) => a.athleteId === athleteId),
      checkIns: data.checkIns.filter((c) => c.athleteId === athleteId),
      kudos: data.kudos.filter((k) => k.athleteId === athleteId),
      thresholds: data.thresholds,
      races: data.races,
      phases: data.phases.filter((p) => p.athleteId === athleteId),
      excuses: data.excuses,
    }
    return lap(input, week)
  }, [data, athleteId, today, week])

  const go = (to: number) => {
    const next = new URLSearchParams(params)
    const o = clampOffset(to)
    if (o === 0) next.delete('w')
    else next.set('w', String(o))
    setParams(next, { replace: true })
  }

  const start = useRef<{ x: number; y: number } | null>(null)
  const onDown = (e: PointerEvent) => {
    start.current = { x: e.clientX, y: e.clientY }
  }
  const onUp = (e: PointerEvent) => {
    const s = start.current
    start.current = null
    if (!s) return
    const dx = e.clientX - s.x
    const dy = e.clientY - s.y
    if (Math.abs(dx) < SWIPE_PX || Math.abs(dx) < 2 * Math.abs(dy)) return
    go(offset + (dx < 0 ? 1 : -1))
  }

  const label = relativeWeekLabel(offset)
  const range = `${fmtDay(firstDay)} to ${fmtDay(lastDay)}`
  const isPast = lastDay < today
  const isFuture = firstDay > today
  const hasActivities = summary.days.some((d) => d.activities.length > 0)

  const sportRows = useMemo(() => {
    const m = new Map<Sport, { planned: number; done: number }>()
    const row = (s: Sport) => {
      let r = m.get(s)
      if (!r) {
        r = { planned: 0, done: 0 }
        m.set(s, r)
      }
      return r
    }
    for (const d of summary.days) {
      for (const p of d.planned) row(p.workout.sport).planned += p.workout.plannedDurationS
      for (const a of d.activities) row(a.sport).done += a.summary.durationS
    }
    return [...m.entries()]
  }, [summary])

  const notes = summary.days.flatMap((d) =>
    d.planned.flatMap((p) => (p.workout.coachNote ? [{ id: p.workout.id, text: p.workout.coachNote }] : [])),
  )

  const pct = summary.compliance === null ? null : roundHalfAway(summary.compliance, 1)
  const target = summary.target
  const kind = summary.phase?.kind
  const phaseName = kind ? `${kind.charAt(0).toUpperCase()}${kind.slice(1)} phase` : null

  return (
    <div className={styles.page} onPointerDown={onDown} onPointerUp={onUp}>
      <header className={styles.head}>
        <IconButton aria-label="Previous week" onPress={() => go(offset - 1)} isDisabled={offset <= 1 - nowWeek}>
          <IconChevronLeft />
        </IconButton>
        <div className={styles.headText}>
          <h1 className={styles.title}>
            {label}
            <span className="sr-only">, </span>
            <span className={styles.range}>{range}</span>
          </h1>
          {phaseName ? <span className={styles.phase}>{phaseName}</span> : null}
        </div>
        <IconButton aria-label="Next week" onPress={() => go(offset + 1)} isDisabled={offset >= MAX_AHEAD}>
          <IconChevronRight />
        </IconButton>
      </header>
      <output className={styles.sr} aria-live="polite">
        Showing {label.toLowerCase()}, {range}
      </output>
      {offset !== 0 ? (
        <Button variant="quiet" className={styles.back} onPress={() => go(0)}>
          This week
        </Button>
      ) : null}

      <div className={styles.lap}>
        <TileBoundary>
          <TrackLap lap={lapState} size="full" />
        </TileBoundary>
      </div>

      {summary.unplanned && isFuture ? (
        <EmptyState title="Coach hasn't planned this week yet." headingLevel={2} />
      ) : summary.unplanned && isPast && !hasActivities ? (
        <EmptyState title="No activities this week." headingLevel={2} />
      ) : null}

      <ol className={styles.days} aria-label="Days of the week">
        {summary.days.map((d) => (
          <DayRow
            key={d.day}
            day={d}
            today={today}
            raceNames={races.filter((r) => r.day === d.day).map((r) => r.name)}
            notPlanned={summary.unplanned && d.day >= today}
          />
        ))}
      </ol>

      <section className={styles.totals} aria-labelledby="week-totals">
        <h2 id="week-totals" className={styles.totalsHead}>
          <span>Week total</span>
          {isPast && pct !== null ? (
            <StatusChip status={BAND_STATUS[bandOf(pct)]} label={`${displayPct(pct)}%: ${BAND_LABELS[bandOf(pct)]}`} />
          ) : null}
        </h2>
        <dl className={styles.figures}>
          <div>
            <dt>Time done</dt>
            <dd data-testid="time-done">{fmtMinutesWords(summary.doneDurationS / 60)}</dd>
            <small data-testid="time-target">
              {target ? `Target ${fmtMinutesWords(target.hoursTarget * 60)}` : 'No target set'}
              {summary.plannedDurationS > 0 ? `, planned ${fmtMinutesWords(summary.plannedDurationS / 60)}` : ''}
            </small>
          </div>
          <div>
            <dt>Load done</dt>
            <dd data-testid="load-done">{Math.round(summary.doneLoad)}</dd>
            <small data-testid="load-target">
              {target ? `Target ${Math.round(target.loadTarget)}` : 'No target set'}
              {summary.plannedLoad > 0 ? `, planned ${Math.round(summary.plannedLoad)}` : ''}
            </small>
          </div>
        </dl>
        {sportRows.length > 0 ? (
          <ul className={styles.sports} aria-label="Time by sport, done against planned">
            {sportRows.map(([sport, r]) => (
              <li key={sport}>
                <SportTag sport={sport} />
                <span>
                  {fmtMinutesWords(r.done / 60)} of {fmtMinutesWords(r.planned / 60)}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      {notes.length > 0 ? (
        <section className={styles.totals} aria-labelledby="week-notes">
          <h2 id="week-notes" className={styles.totalsHead}>
            Coach&apos;s note
          </h2>
          <ul className={styles.notes}>
            {notes.map((n) => (
              <li key={n.id}>{n.text}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {isPast ? <WeeklyRecapPanel athleteId={athleteId} weekStartDay={firstDay} /> : null}
    </div>
  )
}
