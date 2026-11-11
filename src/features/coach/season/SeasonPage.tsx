import { Component, lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { useHotkeys } from '../../../app/keyboard/index.ts'
import { ATHLETES, isAthleteId } from '../../../app/people.ts'
import type { AthleteId } from '../../../app/people.ts'
import { useCoachReadOnly } from '../../../app/useCoachReadOnly.ts'
import { useViewer } from '../../../app/viewer.ts'
import { PLAN_LAST_WEEK } from '../../../data/seed/index.ts'
import { currentDay, selectRaces, selectWeek } from '../../../data/selectors.ts'
import { useLaree } from '../../../data/store.ts'
import { Bars, fmtDay, fmtNumber } from '../../../charts/index.ts'
import type { BarDatum } from '../../../charts/index.ts'
import { weeklyTargets } from '../../../domain/plan.ts'
import { currentWeek, weekOfDay, weekRange } from '../../../domain/time.ts'
import type { Phase, Race } from '../../../domain/types.ts'
import { Button, Card, EmptyState } from '../../../ui/core/index.ts'
import { DataTable } from '../../../ui/data/index.ts'
import type { DataTableColumn } from '../../../ui/data/index.ts'
import { PhaseSlider, SegmentedControl } from '../../../ui/form/index.ts'
import { ConfirmDialog, showUndoToast } from '../../../ui/overlay/index.ts'
import { PHASE_LABEL } from './fill.ts'
import styles from './SeasonPage.module.css'

const RaceDialog = lazy(() => import('./RaceDialog.tsx'))
const FillDialog = lazy(() => import('./FillDialog.tsx'))

export const EMPTY_SEASON = 'No races yet. Add the A race first. Laree builds the phases back from it.'

const PRIORITY_TEXT = { A: 'A race', B: 'B race', C: 'C race' } as const
const SPORT_LABEL: Record<Race['sport'], string> = {
  triathlon: 'Triathlon',
  bike: 'Bike',
  run: 'Run',
  swim: 'Swim',
  strength: 'Strength',
  other: 'Other',
}
const DEFAULT_SPORT: Record<AthleteId, Race['sport']> = { amir: 'triathlon', danial: 'run', irfan: 'bike' }

/** An error tile in place of the chart if it fails to draw. */
class TileBoundary extends Component<{ name: string; children: ReactNode }, { failed: boolean }> {
  override state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  override render() {
    if (this.state.failed) {
      return (
        <div className={styles.errorTile} role="alert">
          {this.props.name} could not be drawn. The rest of the page is fine.
        </div>
      )
    }
    return this.props.children
  }
}

function distancesText(r: Race): string {
  if (r.distancesKm.length === 0) return 'No distance'
  const parts = r.distancesKm.map((d) => `${fmtNumber(d)}`).join(' / ')
  return `${parts} km${r.climbingM ? `, ${fmtNumber(r.climbingM)} m climbing` : ''}`
}

function goalText(s: number | undefined): string {
  if (!s) return 'No goal'
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  return `${h}:${String(m).padStart(2, '0')}`
}

function toGo(r: Race, nowWeek: number): string {
  const n = weekOfDay(r.day) - nowWeek
  if (n === 0) return 'This week'
  if (n === 1) return '1 week'
  return n > 1 ? `${n} weeks` : 'Done'
}

const contiguous = (phases: readonly Phase[]) => phases.every((p, i) => i === 0 || p.firstWeek === (phases[i - 1]?.lastWeek ?? 0) + 1)

/** The base the targets were built from, found by asking the domain function for the same week at a known base. */
function inferBase(phases: readonly Phase[]): { load: number; hours: number } | undefined {
  for (const p of phases) {
    const t = p.weeklyTargets[0]
    if (!t) continue
    const unit = weeklyTargets(p.kind, t.week, t.week, 1000, 1000)[0]
    if (unit && unit.loadTarget > 0 && unit.hoursTarget > 0) {
      return { load: (t.loadTarget * 1000) / unit.loadTarget, hours: (t.hoursTarget * 1000) / unit.hoursTarget }
    }
  }
  return undefined
}

interface WeekRow {
  id: string
  week: number
  phase: string
  hours: number
  load: number
  actual: number | null
  down: boolean
}

type Notice =
  | { kind: 'text'; text: string }
  | { kind: 'filled'; label: string; count: number; week: number }
  | { kind: 'undone' }

/** A different athlete is a different page: remount so the selection and any notice start clean. */
export default function SeasonPage() {
  const params = useParams()
  const lastAthlete = useViewer((s) => s.coachAthleteId)
  const id: AthleteId = isAthleteId(params.athleteId) ? params.athleteId : lastAthlete
  return <SeasonBody key={id} />
}

function SeasonBody() {
  const params = useParams()
  const navigate = useNavigate()
  const readOnly = useCoachReadOnly()
  const lastAthlete = useViewer((s) => s.coachAthleteId)
  const data = useLaree((s) => s.data)
  const setPhases = useLaree((s) => s.setPhases)
  const derivePhasesFromRace = useLaree((s) => s.derivePhasesFromRace)
  const addRace = useLaree((s) => s.addRace)
  const undo = useLaree((s) => s.undo)
  const today = currentDay()
  const nowWeek = currentWeek()

  const athleteId: AthleteId = isAthleteId(params.athleteId) ? params.athleteId : lastAthlete
  const athlete = ATHLETES.find((a) => a.id === athleteId)
  const name = athlete?.name ?? athleteId
  const missingId = !isAthleteId(params.athleteId)
  useEffect(() => {
    if (missingId) navigate(`/coach/season/${athleteId}`, { replace: true })
  }, [missingId, athleteId, navigate])

  const [raceDialog, setRaceDialog] = useState<{ race?: Race } | null>(null)
  const [fillWeeks, setFillWeeks] = useState<number[] | null>(null)
  const [confirmDerive, setConfirmDerive] = useState(false)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const races = selectRaces(data, athleteId)
  const phases = useMemo(
    () => data.phases.filter((p) => p.athleteId === athleteId).toSorted((a, b) => a.firstWeek - b.firstWeek),
    [data.phases, athleteId],
  )
  const aRace = races.find((r) => r.priority === 'A' && weekOfDay(r.day) >= nowWeek - 1) ?? races.findLast((r) => r.priority === 'A')
  const aWeek = aRace ? weekOfDay(aRace.day) : null
  const lined = aWeek !== null && phases.some((p) => p.kind === 'race' && p.firstWeek <= aWeek && aWeek <= p.lastWeek)
  const needsDerive = aRace !== undefined && !lined

  const lastWeek = Math.max(PLAN_LAST_WEEK, ...phases.map((p) => p.lastWeek))
  const rows: WeekRow[] = useMemo(() => {
    const first = phases[0]?.firstWeek
    if (first === undefined) return []
    const out: WeekRow[] = []
    for (const p of phases) {
      for (const t of p.weeklyTargets) {
        out.push({
          id: String(t.week),
          week: t.week,
          phase: PHASE_LABEL[p.kind],
          hours: t.hoursTarget,
          load: t.loadTarget,
          actual: t.week <= nowWeek ? Math.round(selectWeek(data, athleteId, t.week, today).doneLoad) : null,
          down: t.downWeek === true,
        })
      }
    }
    return out.toSorted((a, b) => a.week - b.week)
  }, [phases, data, athleteId, today, nowWeek])

  const bars: BarDatum[] = rows.map((r) => ({
    key: `w${r.week}`,
    label: fmtDay(weekRange(r.week).firstDay),
    value: r.actual ?? 0,
    target: r.load,
  }))

  // The store's undo stack only holds plan changes, so Season keeps its own for phases and races.
  const seasonUndo = useRef<{ athleteId: AthleteId; races: Race[]; phases: Phase[] }[]>([])
  const restoring = useRef(false)
  useEffect(() => {
    const slice = (d: { races: Race[]; phases: Phase[] }) => ({
      races: d.races.filter((r) => r.athleteId === athleteId),
      phases: d.phases.filter((p) => p.athleteId === athleteId),
    })
    const same = <T,>(a: T[], b: T[]) => a.length === b.length && a.every((x, i) => x === b[i])
    return useLaree.subscribe((state, prev) => {
      if (restoring.current) return
      if (state.data.races === prev.data.races && state.data.phases === prev.data.phases) return
      const before = slice(prev.data)
      const after = slice(state.data)
      if (same(before.races, after.races) && same(before.phases, after.phases)) return
      seasonUndo.current.push({ athleteId, ...before })
      if (seasonUndo.current.length > 30) seasonUndo.current.shift()
    })
  }, [athleteId])
  const undoSeason = (): boolean => {
    const i = seasonUndo.current.findLastIndex((e) => e.athleteId === athleteId)
    const entry = seasonUndo.current[i]
    if (!entry) return false
    seasonUndo.current.splice(i, 1)
    restoring.current = true
    try {
      useLaree.setState((s) => ({
        data: {
          ...s.data,
          races: [...s.data.races.filter((r) => r.athleteId !== athleteId), ...entry.races],
          phases: [...s.data.phases.filter((p) => p.athleteId !== athleteId), ...entry.phases],
        },
      }))
    } finally {
      restoring.current = false
    }
    return true
  }

  const step = (dir: 1 | -1) => {
    const i = ATHLETES.findIndex((a) => a.id === athleteId)
    const next = ATHLETES[(i + dir + ATHLETES.length) % ATHLETES.length]
    if (next) navigate(`/coach/season/${next.id}`)
  }
  const selectedFuture = [...selected].map(Number).filter((w) => w >= nowWeek && rows.some((r) => r.week === w)).sort((a, b) => a - b)
  const canFill = !readOnly && selectedFuture.length > 0
  useHotkeys(
    [
      { keys: '[', description: 'Previous athlete', handler: () => step(-1) },
      { keys: ']', description: 'Next athlete', handler: () => step(1) },
      { keys: 'n', description: 'Add race', handler: () => setRaceDialog({}), enabled: !readOnly },
      {
        keys: 'Ctrl+z',
        description: 'Undo the last change',
        handler: () => {
          // A Season edit (phases or races) first; otherwise a plan change made for this athlete.
          if (undoSeason()) {
            setNotice({ kind: 'text', text: `Undone. ${name}'s season is back as it was.` })
            return
          }
          const top = useLaree.getState().undoStack.at(-1)
          if (top && top.athleteIds.includes(athleteId)) {
            undo()
            setNotice({ kind: 'undone' })
            return
          }
          setNotice({ kind: 'text', text: 'Nothing to undo here.' })
        },
        enabled: !readOnly,
      },
      { keys: 'f', description: 'Fill selected weeks from the library', handler: () => canFill && setFillWeeks(selectedFuture), enabled: canFill },
    ],
    { scope: 'page' },
  )

  const derive = () => {
    if (!aRace) return
    // Size the targets to what the athlete has actually been doing, when there is a record of it.
    const recent = [1, 2, 3, 4]
      .map((n) => nowWeek - n)
      .filter((w) => w >= 1)
      .map((w) => selectWeek(data, athleteId, w, today))
    const load = recent.reduce((s, w) => s + w.doneLoad, 0) / (recent.length || 1)
    const hours = recent.reduce((s, w) => s + w.doneDurationS / 3600, 0) / (recent.length || 1)
    const made = derivePhasesFromRace(aRace.id, load > 0 && hours > 0 ? { baseLoad: Math.round(load), baseHours: Math.round(hours * 2) / 2 } : {})
    setNotice({ kind: 'text', text: made.length > 0 ? `Phases built back from ${aRace.name}.` : 'No phases could be built from that race.' })
  }

  const onPhaseWeeks = (weeks: number[]) => {
    const first = phases[0]?.firstWeek
    if (first === undefined) return
    const base = inferBase(phases)
    let at = first
    const next: Phase[] = phases.map((p, i) => {
      const a = at
      const b = a + (weeks[i] ?? 1) - 1
      at = b + 1
      return {
        ...p,
        id: `${athleteId}-${p.kind}-${a}`,
        firstWeek: a,
        lastWeek: b,
        weeklyTargets: weeklyTargets(p.kind, a, b, base?.load, base?.hours),
      }
    })
    setPhases(athleteId, next)
  }

  const raceColumns: DataTableColumn<Race>[] = [
    { id: 'name', label: 'Race', value: (r) => r.name, sortable: true, render: (r) => <strong>{r.name}</strong> },
    { id: 'priority', label: 'Priority', value: (r) => r.priority, render: (r) => <span data-priority={r.priority}>{PRIORITY_TEXT[r.priority]}</span> },
    { id: 'date', label: 'Date', value: (r) => r.day, sortable: true, render: (r) => fmtDay(r.day) },
    { id: 'sport', label: 'Sport', value: (r) => SPORT_LABEL[r.sport] },
    { id: 'distance', label: 'Distances', value: (r) => distancesText(r) },
    { id: 'goal', label: 'Goal', numeric: true, value: (r) => goalText(r.goalTimeS) },
    { id: 'togo', label: 'To go', numeric: true, value: (r) => toGo(r, nowWeek) },
  ]
  const weekColumns: DataTableColumn<WeekRow>[] = [
    {
      id: 'week',
      label: 'Week',
      value: (r) => r.week,
      sortable: true,
      render: (r) => (
        <>
          Week {r.week}
          {r.week === nowWeek ? ' (this week)' : ''}
          {r.down ? ' (down)' : ''}
        </>
      ),
    },
    { id: 'phase', label: 'Phase', value: (r) => r.phase },
    { id: 'hours', label: 'Target hours', numeric: true, value: (r) => r.hours, render: (r) => fmtNumber(r.hours) },
    { id: 'load', label: 'Target Load', numeric: true, value: (r) => r.load, render: (r) => fmtNumber(r.load) },
    { id: 'actual', label: 'Actual Load', numeric: true, value: (r) => r.actual, render: (r) => (r.actual === null ? '–' : fmtNumber(r.actual)) },
  ]

  const onSelect = (keys: unknown) => {
    if (keys === 'all') setSelected(new Set(rows.map((r) => r.id)))
    else if (keys instanceof Set) setSelected(new Set([...keys].map(String)))
  }

  const title = `Season for ${name}`
  const onlyBC = races.length > 0 && !races.some((r) => r.priority === 'A')

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <h1 className={styles.title}>Season</h1>
        <div className={styles.controls}>
          <SegmentedControl
            ariaLabel="Athlete"
            options={ATHLETES.map((a) => ({ id: a.id, label: a.name }))}
            value={athleteId}
            onChange={(id) => isAthleteId(id) && navigate(`/coach/season/${id}`)}
          />
          {readOnly ? null : (
            <>
              <Button variant="secondary" isDisabled={!canFill} onPress={() => setFillWeeks(selectedFuture)}>
                Fill from library
              </Button>
              <Button variant={races.some((r) => r.priority === 'A') ? 'secondary' : 'primary'} onPress={() => setRaceDialog({})}>
                Add race
              </Button>
            </>
          )}
        </div>
      </header>

      {notice ? (
        <output className={styles.notice}>
          {notice.kind === 'text' ? <span>{notice.text}</span> : null}
          {notice.kind === 'undone' ? <span>Undone. The calendar is back as it was.</span> : null}
          {notice.kind === 'filled' ? (
            <>
              <span>
                {notice.count} {notice.count === 1 ? 'session' : 'sessions'} added to {name}&rsquo;s plan.
              </span>
              <Button
                variant="quiet"
                onPress={() => {
                  const top = useLaree.getState().undoStack.at(-1)
                  if (top?.label === notice.label) {
                    undo()
                    setNotice({ kind: 'undone' })
                  } else {
                    setNotice({ kind: 'text', text: 'That change is no longer the latest one, so it was left alone.' })
                  }
                }}
              >
                Undo
              </Button>
              <Link
                className={styles.noticeLink}
                to={`/coach/calendar/${athleteId}${notice.week - nowWeek === 0 ? '' : `?w=${notice.week - nowWeek}`}`}
              >
                Open the calendar
              </Link>
            </>
          ) : null}
        </output>
      ) : null}

      {races.length === 0 ? (
        <EmptyState
          title={EMPTY_SEASON}
          action={
            readOnly ? undefined : (
              <Button variant="primary" onPress={() => setRaceDialog({})}>
                Add race
              </Button>
            )
          }
          hint={readOnly ? undefined : 'Press N'}
        />
      ) : (
        <>
          {needsDerive && aRace && !readOnly ? (
            <div className={styles.derive}>
              <span>
                {phases.length === 0 ? 'No phases yet.' : `The phases do not run to ${aRace.name}.`}
              </span>
              <Button variant="primary" onPress={() => (phases.length === 0 ? derive() : setConfirmDerive(true))}>
                {`Derive phases from ${aRace.name}`}
              </Button>
            </div>
          ) : null}
          {onlyBC ? <p className={styles.partial}>Add an A race to derive phases.</p> : null}

          <Card className={styles.card}>
            <h2 className={styles.h2}>{title}</h2>
            {phases.length === 0 ? (
              <p className={styles.partial}>{onlyBC ? 'No phases yet.' : 'No phases yet. Derive them from the A race.'}</p>
            ) : (
              <>
                <ol className={styles.band} aria-label="Phase band" style={{ gridTemplateColumns: `repeat(${lastWeek}, minmax(0, 1fr))` }}>
                  {phases.map((p) => (
                    <li
                      key={p.id}
                      className={styles.phase}
                      data-kind={p.kind}
                      data-now={p.firstWeek <= nowWeek && nowWeek <= p.lastWeek ? true : undefined}
                      style={{ gridColumn: `${p.firstWeek} / ${p.lastWeek + 1}` }}
                    >
                      <span className={styles.phaseName}>{PHASE_LABEL[p.kind]}</span>
                      <span className={styles.phaseWeeks}>
                        {p.firstWeek === p.lastWeek ? `Week ${p.firstWeek}` : `Weeks ${p.firstWeek} to ${p.lastWeek}`}
                      </span>
                    </li>
                  ))}
                </ol>
                <ol className={styles.markers} aria-label="Races on the timeline" style={{ gridTemplateColumns: `repeat(${lastWeek}, minmax(0, 1fr))` }}>
                  {races.map((r) => {
                    const w = weekOfDay(r.day)
                    if (w < 1 || w > lastWeek) return null
                    return (
                      <li key={r.id} className={styles.marker} data-priority={r.priority} style={{ gridColumn: `${w} / ${w + 1}` }}>
                        <span aria-hidden="true">{r.priority}</span>
                        <span className="sr-only">{`${PRIORITY_TEXT[r.priority]}: ${r.name}, week ${w}`}</span>
                      </li>
                    )
                  })}
                </ol>
                <p className={styles.note}>This week is week {nowWeek}. Every fourth week is a down week.</p>

                {readOnly ? (
                  <ul className={styles.phaseList}>
                    {phases.map((p) => (
                      <li key={p.id}>
                        {PHASE_LABEL[p.kind]}: weeks {p.firstWeek} to {p.lastWeek}
                      </li>
                    ))}
                  </ul>
                ) : contiguous(phases) && phases.length > 1 ? (
                  <PhaseSlider
                    label="Phase lengths"
                    hint="Arrow keys move the selected end of a phase by one week."
                    phases={phases.map((p) => ({ id: p.id, label: PHASE_LABEL[p.kind] }))}
                    weeks={phases.map((p) => p.lastWeek - p.firstWeek + 1)}
                    onChange={onPhaseWeeks}
                  />
                ) : null}
                {!readOnly && !needsDerive && aRace ? (
                  <div>
                    <Button variant="quiet" onPress={() => setConfirmDerive(true)}>
                      Derive phases again
                    </Button>
                  </div>
                ) : null}

                <TileBoundary name="The weekly Load chart">
                  <Bars
                    title="Weekly Load against target"
                    measure="Actual Load"
                    valueHeading="Actual Load"
                    data={bars}
                    formatValue={(n) => fmtNumber(n)}
                    height={180}
                  />
                </TileBoundary>
              </>
            )}
          </Card>

          <div className={styles.tables}>
            <section className={styles.section} aria-labelledby="races-h">
              <h2 id="races-h" className={styles.h2}>
                Races
              </h2>
              <DataTable
                aria-label={`Races for ${name}`}
                columns={raceColumns}
                rows={races}
                getRowId={(r) => r.id}
                defaultSort={{ column: 'date', direction: 'ascending' }}
                {...(readOnly ? {} : { onRowAction: (r: Race) => setRaceDialog({ race: r }) })}
                {...(readOnly
                  ? {}
                  : {
                      rowActions: (r: Race) => (
                        <Button variant="quiet" onPress={() => setRaceDialog({ race: r })} aria-label={`Edit ${r.name}`}>
                          Edit
                        </Button>
                      ),
                    })}
              />
            </section>
            <section className={styles.section} aria-labelledby="targets-h">
              <h2 id="targets-h" className={styles.h2}>
                Weekly targets
              </h2>
              {rows.length === 0 ? (
                <p className={styles.partial}>Targets appear once there are phases.</p>
              ) : (
                <>
                  {readOnly ? null : <p className={styles.note}>Select weeks from this week on, then choose Fill from library.</p>}
                  <DataTable
                    aria-label={`Weekly targets for ${name}`}
                    columns={weekColumns}
                    rows={rows}
                    getRowId={(r) => r.id}
                    maxHeight="26rem"
                    {...(readOnly
                      ? {}
                      : { selectionMode: 'multiple' as const, selectedKeys: selected, onSelectionChange: onSelect })}
                  />
                </>
              )}
            </section>
          </div>
        </>
      )}

      <Suspense fallback={null}>
        {raceDialog && !readOnly ? (
          <RaceDialog
            key={raceDialog.race?.id ?? 'new'}
            isOpen
            onOpenChange={(open) => !open && setRaceDialog(null)}
            athleteId={athleteId}
            race={raceDialog.race}
            defaultSport={DEFAULT_SPORT[athleteId]}
            onSaved={(r, isNew) => {
              if (r.priority === 'A') {
                setNotice({ kind: 'text', text: `${isNew ? 'Added' : 'Saved'} ${r.name} as the A race.` })
              } else {
                setNotice({
                  kind: 'text',
                  text: `${isNew ? 'Added' : 'Saved'} ${r.name} as a ${PRIORITY_TEXT[r.priority]} in week ${weekOfDay(r.day)}. The phases did not move.`,
                })
              }
            }}
            onDeleted={(r) => {
              const { id: _id, ...rest } = r
              showUndoToast(`Deleted ${r.name}`, () => {
                addRace(rest)
              })
            }}
          />
        ) : null}
        {fillWeeks && !readOnly ? (
          <FillDialog
            isOpen
            onOpenChange={(open) => !open && setFillWeeks(null)}
            athleteId={athleteId}
            athleteName={name}
            weeks={fillWeeks}
            onApplied={({ label, count, firstWeek }) => setNotice({ kind: 'filled', label, count, week: firstWeek })}
          />
        ) : null}
      </Suspense>

      <ConfirmDialog
        isOpen={confirmDerive}
        onOpenChange={setConfirmDerive}
        thing="the current phases"
        description={aRace ? `Laree builds new phases back from ${aRace.name}. Your edits to the phase lengths are replaced.` : undefined}
        confirmLabel="Derive phases"
        cancelLabel="Keep them"
        destructive={false}
        onConfirm={derive}
      />
    </div>
  )
}
