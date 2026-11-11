import { lazy, Suspense, useEffect, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { useHotkeys } from '../../../app/keyboard/index.ts'
import { ATHLETES, isAthleteId } from '../../../app/people.ts'
import { useCoachReadOnly } from '../../../app/useCoachReadOnly.ts'
import { useViewer } from '../../../app/viewer.ts'
import { Bars, fmtDay, fmtDistance, fmtDuration, fmtNumber, fmtSigned, PMC } from '../../../charts/index.ts'
import {
  currentDay,
  selectAthleteDay,
  selectFitnessSeries,
  selectFlagRecords,
  selectOpenFlags,
  selectRaces,
  selectWeek,
} from '../../../data/selectors.ts'
import { useLaree } from '../../../data/store.ts'
import { RULES, summariseValues } from '../../../domain/flags.ts'
import type { FlagRecord } from '../../../domain/flags.ts'
import { weekdayIndex, weekOfDay, weekRange } from '../../../domain/time.ts'
import type { Activity, AthleteId } from '../../../domain/types.ts'
import { buttonClass, Card, EmptyState, SPORT_LABEL } from '../../../ui/core/index.ts'
import { DataTable } from '../../../ui/data/index.ts'
import { SegmentedControl } from '../../../ui/form/index.ts'
import { FlagDrawerSlot } from './FlagDrawerSlot.tsx'
import { TileBoundary } from './TileBoundary.tsx'
import { formatThreshold, KIND_LABEL, EDITABLE_KINDS, SOURCE_LABEL, thresholdHistory, thresholdsLine } from './thresholds.ts'
import styles from './AthletePage.module.css'

const ThresholdsDialog = lazy(() => import('./ThresholdsDialog.tsx'))

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const
const SEVERITY_LABEL = { act: 'Act', watch: 'Watch', info: 'Info' } as const
const PHASE_LABEL = {
  base: 'Base',
  build: 'Build',
  peak: 'Peak',
  taper: 'Taper',
  race: 'Race week',
  recovery: 'Recovery',
} as const
const FLAG_PARAM = 'flag'
const HISTORY_DAYS = 112

export default function AthletePage() {
  const { athleteId } = useParams()
  if (!isAthleteId(athleteId)) {
    return (
      <section className={styles.page}>
        <EmptyState
          title="We can't find that athlete"
          description="Pick someone from Overview."
          action={
            <Link to="/coach/overview" className={buttonClass('primary')}>
              Go to Overview
            </Link>
          }
        />
      </section>
    )
  }
  // Keyed by athlete, so an open threshold editor closes when the route changes to someone else.
  return <AthleteSummary key={athleteId} athleteId={athleteId} />
}

function AthleteSummary({ athleteId }: { athleteId: AthleteId }) {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const readOnly = useCoachReadOnly()
  const setCoachAthlete = useViewer((s) => s.setCoachAthlete)
  const data = useLaree((s) => s.data)
  const [editing, setEditing] = useState(false)
  const today = currentDay()
  const person = ATHLETES.find((a) => a.id === athleteId)

  // This athlete is now the last one viewed.
  useEffect(() => setCoachAthlete(athleteId), [athleteId, setCoachAthlete])

  const step = (delta: number) => {
    const i = ATHLETES.findIndex((a) => a.id === athleteId)
    const next = ATHLETES[(i + delta + ATHLETES.length) % ATHLETES.length]
    if (next) navigate(`/coach/athlete/${next.id}`)
  }
  useHotkeys([
    { keys: '[', description: 'Previous athlete', handler: () => step(-1) },
    { keys: ']', description: 'Next athlete', handler: () => step(1) },
  ])

  // ---- flags: open first (most serious first), then acknowledged
  const open = selectOpenFlags(data, athleteId)
  const acknowledged = selectFlagRecords(data, athleteId, 'acknowledged')
  const flags: FlagRecord[] = [...open, ...acknowledged]
  const flagId = params.get(FLAG_PARAM)
  const shownFlag = flags.find((f) => f.id === flagId)
  const openFlag = (id: string) =>
    setParams((p) => {
      const next = new URLSearchParams(p)
      next.set(FLAG_PARAM, id)
      return next
    })
  const closeFlag = () =>
    setParams((p) => {
      const next = new URLSearchParams(p)
      next.delete(FLAG_PARAM)
      return next
    })

  // ---- header
  const races = selectRaces(data, athleteId)
  const aRace = races.find((r) => r.priority === 'A' && r.day >= today)
  const thisWeek = weekOfDay(today)
  const week = selectWeek(data, athleteId, thisWeek, today)
  const weeksToGo = aRace ? Math.max(0, Math.ceil((aRace.day - today) / 7)) : null

  // ---- fitness chart
  const series = selectFitnessSeries(data, athleteId, today)
  const now = series.find((p) => p.day === today)
  const lastDay = aRace ? aRace.day : today
  const points = series.filter((p) => p.day >= today - HISTORY_DAYS && p.day <= lastDay)

  // ---- strip of this week and the next 7 days
  const strip = []
  for (let d = weekRange(thisWeek).firstDay; d <= today + 7; d++) strip.push(selectAthleteDay(data, athleteId, d, today))

  // ---- volume against target
  const volume = []
  for (let w = Math.max(1, thisWeek - 11); w <= thisWeek; w++) {
    const s = selectWeek(data, athleteId, w, today)
    volume.push({
      key: `w${w}`,
      label: fmtDay(s.firstDay),
      value: Math.round((s.doneDurationS / 3600) * 10) / 10,
      target: s.target?.hoursTarget ?? null,
    })
  }

  // ---- recent activities
  const recent = data.activities
    .filter((a) => a.athleteId === athleteId && a.day <= today)
    .toSorted((a, b) => b.day - a.day || b.startMinute - a.startMinute)
    .slice(0, 8)
  const history = thresholdHistory(data, athleteId)
  const latestOf = (kind: (typeof EDITABLE_KINDS)[number]) => history.find((t) => t.kind === kind)

  return (
    <section className={styles.page} aria-labelledby="athlete-name">
      <header className={styles.header}>
        <div className={styles.headline}>
          <h1 id="athlete-name">{person?.name}</h1>
          <p className={styles.sub}>
            {person?.focus}
            {' · '}
            {aRace ? (
              <>
                {aRace.name}, {fmtDay(aRace.day)}, {weeksToGo} {weeksToGo === 1 ? 'week' : 'weeks'} to go
              </>
            ) : (
              <>
                No A race yet. <Link to={`/coach/season/${athleteId}`}>Open Season</Link>
              </>
            )}
            {week.phase ? ` · ${PHASE_LABEL[week.phase.kind]} phase` : ''}
          </p>
          <p className={styles.sub} data-numeric>
            {thresholdsLine(data, athleteId, today)}
          </p>
        </div>
        <div className={styles.toolbar}>
          <SegmentedControl
            ariaLabel="Athlete"
            options={ATHLETES.map((a) => ({ id: a.id, label: a.name }))}
            value={athleteId}
            onChange={(id) => navigate(`/coach/athlete/${id}`)}
          />
          <Link to={`/coach/calendar/${athleteId}`} className={buttonClass('primary')}>
            Open Calendar
          </Link>
          <Link to={`/coach/season/${athleteId}`} className={buttonClass('secondary')}>
            Season
          </Link>
          <Link to={`/coach/analytics/${athleteId}`} className={buttonClass('secondary')}>
            Analytics
          </Link>
        </div>
      </header>

      <div className={styles.grid}>
        <section className={styles.flags} aria-labelledby="flags-h">
          <h2 id="flags-h">
            Flags <span className={styles.count}>({flags.length})</span>
          </h2>
          {flags.length === 0 ? (
            <p className={styles.empty}>No open flags.</p>
          ) : (
            <ul className={styles.flagList} aria-label={`${flags.length} flags`}>
              {flags.map((f) => (
                <li key={f.id} className={styles.flag} data-severity={f.severity} data-testid="flag-card">
                  <div className={styles.flagHead}>
                    <h3>{RULES[f.ruleId].title}</h3>
                    <span className={styles.severity}>{SEVERITY_LABEL[f.severity]}</span>
                  </div>
                  <p className={styles.rule}>{RULES[f.ruleId].ruleText}</p>
                  <p className={styles.values} data-numeric>
                    {summariseValues(f.ruleId, f.valuesLatest)}
                  </p>
                  <p className={styles.explain}>{f.explanation}</p>
                  <div className={styles.flagFoot}>
                    <span>
                      Raised {fmtDay(f.openedDay)} · {f.status === 'open' ? 'Open' : 'Acknowledged'}
                    </span>
                    <button type="button" className={styles.link} onClick={() => openFlag(f.id)}>
                      Open flag<span className={styles.visuallyHidden}>: {RULES[f.ruleId].title}</span>
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className={styles.main}>
          <section aria-labelledby="week-h">
            <h2 id="week-h">This week and next 7 days</h2>
            <ol className={styles.strip}>
              {strip.map((d) => (
                <li key={d.day} className={styles.day} data-today={d.day === today ? 'true' : undefined}>
                  <span className={styles.dayName}>
                    {WEEKDAYS[weekdayIndex(d.day)]} {fmtDay(d.day)}
                  </span>
                  <span data-numeric>
                    {d.activities.length} done of {d.planned.length} planned
                  </span>
                </li>
              ))}
            </ol>
          </section>

          <section aria-labelledby="fit-h">
            <h2 id="fit-h">Fitness</h2>
            {now ? (
              <p className={styles.figures} data-numeric data-testid="fitness-figures">
                Fitness {fmtNumber(now.fitness)} · Fatigue {fmtNumber(now.fatigue)} · Form {fmtSigned(now.form)} ·
                Ramp {fmtSigned(now.ramp, 1)}
              </p>
            ) : null}
            <TileBoundary label="The fitness chart">
              <PMC
                points={points}
                today={today}
                races={races.map((r) => ({ day: r.day, name: r.name, priority: r.priority }))}
                title={`${person?.name}'s Fitness, Fatigue and Form`}
                height={260}
              />
            </TileBoundary>
            {aRace ? null : <p className={styles.empty}>No projection without an A race.</p>}
          </section>

          <section aria-labelledby="vol-h">
            <h2 id="vol-h">Volume against target</h2>
            <TileBoundary label="The volume chart">
              <Bars
                data={volume}
                title="Weekly hours"
                measure="Training hours"
                valueHeading="Hours"
                formatValue={(n) => `${fmtNumber(n, 1)} h`}
                height={200}
              />
            </TileBoundary>
          </section>

          <section aria-labelledby="act-h">
            <h2 id="act-h">Recent activities</h2>
            <Card flush>
              <DataTable<Activity>
                aria-label="Recent activities"
                rows={recent}
                getRowId={(a) => a.id}
                onRowAction={(a) => navigate(`/coach/activity/${a.id}`)}
                emptyState={<p className={styles.empty}>No activities in the last 30 days.</p>}
                columns={[
                  { id: 'day', label: 'Date', value: (a) => a.day, render: (a) => fmtDay(a.day) },
                  { id: 'sport', label: 'Sport', value: (a) => (a.sport === 'other' ? 'Other' : SPORT_LABEL[a.sport]) },
                  {
                    id: 'title',
                    label: 'Title',
                    isRowHeader: true,
                    value: (a) => a.title,
                    render: (a) => <Link to={`/coach/activity/${a.id}`}>{a.title}</Link>,
                  },
                  { id: 'dur', label: 'Time', numeric: true, value: (a) => a.summary.durationS, render: (a) => fmtDuration(a.summary.durationS) },
                  {
                    id: 'dist',
                    label: 'Distance',
                    numeric: true,
                    value: (a) => a.summary.distanceM ?? null,
                    render: (a) => (a.summary.distanceM === undefined ? '–' : fmtDistance(a.summary.distanceM, a.sport)),
                  },
                  { id: 'load', label: 'Load', numeric: true, value: (a) => a.load.load, render: (a) => fmtNumber(a.load.load) },
                ]}
              />
            </Card>
          </section>
        </div>

        <section className={styles.thresholds} aria-labelledby="th-h">
          <div className={styles.thHead}>
            <h2 id="th-h">Thresholds</h2>
            {readOnly ? null : (
              <button type="button" className={styles.link} onClick={() => setEditing(true)}>
                Edit thresholds
              </button>
            )}
          </div>
          <dl className={styles.thList}>
            {EDITABLE_KINDS.map((k) => (
              <div key={k}>
                <dt>{KIND_LABEL[k]}</dt>
                <dd data-numeric>{formatThreshold(k, latestOf(k)?.value)}</dd>
              </div>
            ))}
          </dl>
          <h3>History</h3>
          <table className={styles.history} aria-label="Threshold history">
            <thead>
              <tr>
                <th scope="col">From</th>
                <th scope="col">Threshold</th>
                <th scope="col">Value</th>
                <th scope="col">Source</th>
              </tr>
            </thead>
            <tbody>
              {history.map((t) => (
                <tr key={`${t.kind}:${t.effectiveFromDay}`} data-testid="threshold-row">
                  <td data-numeric>{fmtDay(t.effectiveFromDay)}</td>
                  <td>{KIND_LABEL[t.kind as (typeof EDITABLE_KINDS)[number]]}</td>
                  <td data-numeric>{formatThreshold(t.kind, t.value)}</td>
                  <td>{SOURCE_LABEL[t.source]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>

      {shownFlag ? <FlagDrawerSlot athleteId={athleteId} flagId={shownFlag.id} onClose={closeFlag} /> : null}
      {editing ? (
        <Suspense fallback={null}>
          <ThresholdsDialog key={athleteId} athleteId={athleteId} isOpen onClose={() => setEditing(false)} />
        </Suspense>
      ) : null}
    </section>
  )
}
