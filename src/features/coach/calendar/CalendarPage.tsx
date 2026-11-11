import { Suspense, lazy, useEffect, useMemo, useState } from 'react'
import { Button as AriaButton } from 'react-aria-components/Button'
import { useNavigate, useParams, useSearchParams } from 'react-router'
import { useCoachReadOnly } from '../../../app/useCoachReadOnly.ts'
import { useViewer } from '../../../app/viewer.ts'
import { ATHLETES, isAthleteId, personName } from '../../../app/people.ts'
import { useHotkeys } from '../../../app/keyboard/index.ts'
import { fmtDay, fmtDuration } from '../../../charts/index.ts'
import { currentDay, selectRaces, selectWeek } from '../../../data/selectors.ts'
import type { AthleteDay, PlannedItem } from '../../../data/selectors.ts'
import { useLaree } from '../../../data/store.ts'
import { displayPct } from '../../../domain/metrics/compliance.ts'
import { currentWeek, weekOfDay, weekRange } from '../../../domain/time.ts'
import type { AthleteId, ComplianceBand, DayOffset } from '../../../domain/types.ts'
import { Button, EmptyState, IconButton, SportGlyph, StatusGlyph } from '../../../ui/core/index.ts'
import type { SportKey, StatusKey } from '../../../ui/core/index.ts'
import { SegmentedControl } from '../../../ui/form/index.ts'
import { DragGrid } from '../../../ui/data/index.ts'
import type { DragGridColumn, DragGridMove } from '../../../ui/data/index.ts'
import { IconChevronLeft, IconChevronRight } from '../../../ui/icons/index.ts'
import { Dialog, showToast, showUndoToast } from '../../../ui/overlay/index.ts'
import { CalendarExport } from './CalendarExport.tsx'
import { SuggestSlot } from './SuggestSlot.tsx'
import styles from './CalendarPage.module.css'
import { latestUndo, newSession, undoIfLatest } from './sessionModel.ts'

const SessionEditor = lazy(() => import('./SessionEditor.tsx'))

const MAX_AHEAD = 26
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

const PAST_MESSAGE = "Past days can't take new sessions."

function parseOffset(raw: string | null): number | null {
  if (raw === null || !/^-?\d+$/.test(raw)) return null
  return Math.trunc(Number(raw))
}

const clampOffset = (offset: number): number => Math.max(1 - currentWeek(), Math.min(MAX_AHEAD, offset))

const dayLabel = (day: DayOffset): string => `${WEEKDAYS[((day % 7) + 7) % 7]} ${fmtDay(day)}`

const sum = (xs: readonly number[]): number => xs.reduce((a, b) => a + b, 0)
const km = (metres: number): string => (metres > 0 ? `${(metres / 1000).toFixed(1)} km` : '0 km')

function dayTotals(d: AthleteDay) {
  return {
    plannedS: sum(d.planned.map((p) => p.workout.plannedDurationS)),
    doneS: sum(d.activities.map((a) => a.summary.durationS)),
    plannedM: sum(d.planned.map((p) => p.workout.plannedDistanceM ?? 0)),
    doneM: sum(d.activities.map((a) => a.summary.distanceM ?? 0)),
    plannedLoad: sum(d.planned.map((p) => p.workout.plannedLoad)),
    doneLoad: sum(d.activities.map((a) => a.load.load)),
  }
}

function SessionChip({ item, onOpen }: { item: PlannedItem; onOpen: (id: string) => void }) {
  const { workout, evaluation, activity } = item
  const band = evaluation?.band
  const sport: SportKey | null = workout.sport === 'other' ? null : (workout.sport as SportKey)
  return (
    <span className={styles.chip}>
      <span className={styles.chipHead}>
        {sport ? <SportGlyph sport={sport} size={16} /> : null}
        <AriaButton className={styles.titleButton} onPress={() => onOpen(workout.id)}>
          {workout.title}
        </AriaButton>
        {workout.keySession ? <span className={styles.key}>Key</span> : null}
        {band ? (
          <span className={styles.status} title={band}>
            <StatusGlyph status={BAND_STATUS[band]} size={14} />
          </span>
        ) : null}
      </span>
      <span className={styles.chipMeta} data-numeric>
        {fmtDuration(workout.plannedDurationS)} planned, load {Math.round(workout.plannedLoad)}
        {activity ? `, done ${fmtDuration(activity.summary.durationS)}` : ''}
      </span>
    </span>
  )
}

interface Conflict {
  id: string
  day: DayOffset
  otherId: string
}

/** The row that holds keyboard focus, as its session id and the day its column shows. */
function focusedSession(): { id: string; row: Element; button: HTMLElement } | null {
  const row = document.activeElement?.closest('[role="row"]')
  const button = row?.querySelector<HTMLElement>('button[data-item-id]')
  const id = button?.dataset.itemId
  return row && button && id ? { id, row, button } : null
}

export default function CalendarPage() {
  const params = useParams()
  const navigate = useNavigate()
  const [search, setSearch] = useSearchParams()
  const readOnly = useCoachReadOnly()
  const lastAthlete = useViewer((s) => s.coachAthleteId)
  const setCoachAthlete = useViewer((s) => s.setCoachAthlete)
  const [editing, setEditing] = useState<string | null>(null)
  const [conflict, setConflict] = useState<Conflict | null>(null)
  const [focusDay, setFocusDay] = useState<DayOffset | null>(null)

  const athleteId: AthleteId = isAthleteId(params['athleteId']) ? params['athleteId'] : lastAthlete
  const rawOffset = parseOffset(search.get('w'))
  const offset = clampOffset(rawOffset ?? 0)
  const week = currentWeek() + offset
  const today = currentDay()
  const { firstDay, lastDay } = weekRange(week)

  // Keep the address and the remembered athlete in step with what is on screen.
  useEffect(() => {
    if (params['athleteId'] !== athleteId) {
      void navigate({ pathname: `/coach/calendar/${athleteId}`, search: search.toString() ? `?${search}` : '' }, { replace: true })
    }
    if (useViewer.getState().coachAthleteId !== athleteId) setCoachAthlete(athleteId)
  }, [params, athleteId, navigate, search, setCoachAthlete])
  useEffect(() => {
    if (search.has('w') && (rawOffset === null || rawOffset !== offset || offset === 0)) {
      setSearch(
        (prev) => {
          const next = new URLSearchParams(prev)
          if (offset === 0) next.delete('w')
          else next.set('w', String(offset))
          return next
        },
        { replace: true },
      )
    }
  }, [search, rawOffset, offset, setSearch])

  const summary = useLaree((s) => selectWeek(s.data, athleteId, week, today))
  const races = useLaree((s) => selectRaces(s.data, athleteId))
  const plannedAll = useLaree((s) => s.data.planned)
  const name = personName(athleteId)

  const setOffset = (next: number) =>
    setSearch(
      (prev) => {
        const p = new URLSearchParams(prev)
        const clamped = clampOffset(next)
        if (clamped === 0) p.delete('w')
        else p.set('w', String(clamped))
        return p
      },
      { replace: true },
    )
  const goAthlete = (id: AthleteId) => void navigate({ pathname: `/coach/calendar/${id}`, search: search.toString() ? `?${search}` : '' })
  const stepAthlete = (by: 1 | -1) => {
    const ids = ATHLETES.map((a) => a.id)
    const i = ids.indexOf(athleteId)
    const next = ids[(i + by + ids.length) % ids.length]
    if (next) goAthlete(next)
  }

  const columns: DragGridColumn[] = useMemo(
    () =>
      summary.days.map((d) => ({
        key: String(d.day),
        label: dayLabel(d.day),
        items: d.planned.map((p) => ({
          id: p.workout.id,
          label: p.workout.title,
          content: <SessionChip item={p} onOpen={setEditing} />,
        })),
      })),
    [summary],
  )

  // ---- moving
  const moved = (title: string, day: DayOffset) => {
    const step = latestUndo()
    showUndoToast(`${title} moved to ${dayLabel(day)}.`, () => undoIfLatest(step))
  }

  const handleMove = (m: DragGridMove) => {
    const w = plannedAll.find((p) => p.id === m.itemId)
    if (!w) return
    const day = Number(m.to)
    if (m.from === m.to) {
      const ids = summary.days.find((d) => d.day === day)?.planned.map((p) => p.workout.id) ?? []
      const rest = ids.filter((id) => id !== m.itemId)
      rest.splice(Math.max(0, Math.min(m.index, rest.length)), 0, m.itemId)
      if (rest.join() === ids.join()) return
      useLaree.getState().applyPlanChanges(
        rest.map((id, order) => ({ kind: 'move' as const, id, day, order })),
        `Reordered ${dayLabel(day)}`,
      )
      return
    }
    if (day < today) {
      showToast(PAST_MESSAGE)
      return
    }
    const other = summary.days.find((d) => d.day === day)?.planned[0]
    if (other) {
      setConflict({ id: w.id, day, otherId: other.workout.id })
      return
    }
    useLaree.getState().moveWorkout(w.id, day)
    moved(w.title, day)
  }

  const resolveConflict = (how: 'swap' | 'both') => {
    const c = conflict
    setConflict(null)
    if (!c) return
    const a = plannedAll.find((p) => p.id === c.id)
    const b = plannedAll.find((p) => p.id === c.otherId)
    if (!a) return
    if (how === 'both' || !b) {
      useLaree.getState().moveWorkout(a.id, c.day)
      moved(a.title, c.day)
      return
    }
    useLaree.getState().applyPlanChanges(
      [
        { kind: 'move', id: a.id, day: c.day },
        { kind: 'move', id: b.id, day: a.day },
      ],
      `Swapped ${a.title} and ${b.title}`,
    )
    const step = latestUndo()
    showUndoToast(`Swapped ${a.title} and ${b.title}.`, () => undoIfLatest(step))
  }

  const addSession = (day: DayOffset) => {
    if (day < today) {
      showToast(PAST_MESSAGE)
      return
    }
    const w = newSession(plannedAll, athleteId, day)
    useLaree.getState().applyPlanChanges([{ kind: 'add', workout: w }], `Added ${w.title}`)
    setEditing(w.id)
  }

  const columnDayOfFocus = (): DayOffset | null => {
    const label = document.activeElement?.closest('section[aria-label]')?.getAttribute('aria-label')
    return summary.days.find((d) => dayLabel(d.day) === label)?.day ?? null
  }

  useHotkeys(
    [
      {
        keys: 'm',
        description: 'Move the focused session. Arrow keys choose the day, Enter drops, Esc cancels.',
        enabled: !readOnly,
        handler: () => {
          const f = focusedSession()
          if (!f) return
          f.button.focus()
          f.button.click()
        },
      },
      {
        keys: 'e',
        description: 'Edit the focused session',
        enabled: !readOnly,
        handler: () => {
          const f = focusedSession()
          if (f) setEditing(f.id)
        },
      },
      {
        keys: 'Enter',
        description: 'Open the focused session',
        enabled: !readOnly,
        handler: (event) => {
          const f = document.activeElement?.getAttribute('role') === 'row' ? focusedSession() : null
          if (!f) return
          event.preventDefault()
          setEditing(f.id)
        },
      },
      {
        keys: 'n',
        description: 'New session on the focused day',
        enabled: !readOnly,
        handler: (event) => {
          event.preventDefault()
          addSession(columnDayOfFocus() ?? focusDay ?? Math.max(today, firstDay))
        },
      },
      { keys: 't', description: 'Jump to this week', handler: () => setOffset(0) },
      { keys: ',', description: 'Previous week', handler: () => setOffset(offset - 1) },
      { keys: '.', description: 'Next week', handler: () => setOffset(offset + 1) },
      { keys: '[', description: 'Previous athlete', handler: () => stepAthlete(-1) },
      { keys: ']', description: 'Next athlete', handler: () => stepAthlete(1) },
      {
        keys: 'Ctrl+z',
        description: 'Undo the last change',
        enabled: !readOnly,
        handler: () => {
          const last = useLaree.getState().undoStack.at(-1)
          if (!last) {
            showToast('Nothing to undo.')
            return
          }
          if (!last.athleteIds.includes(athleteId)) {
            const who = ATHLETES.find((a) => a.id === last.athleteIds[0])?.name ?? 'another athlete'
            showToast(`The last change was to ${who}'s plan. Open their calendar to undo it.`)
            return
          }
          useLaree.getState().undo()
          showToast(`Undone: ${last.label}.`)
        },
      },
    ],
  )

  // ---- totals
  const totals = summary.days.map(dayTotals)
  const weekPlannedM = sum(totals.map((t) => t.plannedM))
  const weekDoneM = sum(totals.map((t) => t.doneM))
  const raceA = races.find((r) => r.priority === 'A' && r.day >= firstDay)
  const weeksToRace = raceA ? weekOfDay(raceA.day) - week : null
  const rangeText = `${fmtDay(firstDay)} to ${fmtDay(lastDay)}`
  const isEmpty = summary.unplanned && summary.days.every((d) => d.activities.length === 0)
  const conflictOther = conflict ? plannedAll.find((p) => p.id === conflict.otherId) : undefined
  const conflictMoving = conflict ? plannedAll.find((p) => p.id === conflict.id) : undefined

  return (
    <section className={styles.page} data-screen="C3">
      <header className={styles.header}>
        <div className={styles.titleBlock}>
          <h1 className={styles.title}>Calendar</h1>
          <p className={styles.sub} data-numeric>
            {name}, week of {rangeText}
            {summary.phase ? `, ${summary.phase.kind} phase` : ''}
            {summary.target?.downWeek ? ', down week' : ''}
            {weeksToRace !== null && raceA ? `, ${weeksToRace} ${weeksToRace === 1 ? 'week' : 'weeks'} to ${raceA.name}` : ''}
          </p>
        </div>
        <div className={styles.toolbar}>
          <SegmentedControl
            ariaLabel="Athlete"
            options={ATHLETES.map((a) => ({ id: a.id, label: a.name }))}
            value={athleteId}
            onChange={(id) => {
              if (isAthleteId(id)) goAthlete(id)
            }}
          />
          <div className={styles.weekNav}>
            <IconButton aria-label="Previous week" onPress={() => setOffset(offset - 1)}>
              <IconChevronLeft aria-hidden="true" />
            </IconButton>
            <Button variant="secondary" onPress={() => setOffset(0)} isDisabled={offset === 0}>
              Today
            </Button>
            <IconButton aria-label="Next week" onPress={() => setOffset(offset + 1)}>
              <IconChevronRight aria-hidden="true" />
            </IconButton>
          </div>
          {readOnly ? null : (
            <Button variant="primary" onPress={() => addSession(columnDayOfFocus() ?? Math.max(today, firstDay))}>
              Add session
            </Button>
          )}
          <CalendarExport athleteId={athleteId} weekStartDay={firstDay} selectedWorkoutId={editing ?? undefined} />
          <SuggestSlot athleteId={athleteId} weekStartDay={lastDay + 1} />
        </div>
      </header>

      {isEmpty ? (
        <EmptyState
          illustration={false}
          title="No sessions this week"
          description={readOnly ? 'Nothing is planned or done in this week.' : 'Add a session, or build workouts in the Library.'}
          action={
            readOnly ? undefined : (
              <Button variant="secondary" onPress={() => addSession(Math.max(today, firstDay))}>
                Add a session
              </Button>
            )
          }
          hint={readOnly ? undefined : 'Press N'}
          headingLevel={2}
        />
      ) : null}

      {readOnly ? (
        <ol className={styles.stack} aria-label="Sessions by day">
          {summary.days.map((d, i) => (
            <li key={d.day} className={styles.stackDay}>
              <h2 className={styles.stackHeading}>{dayLabel(d.day)}</h2>
              {d.planned.length === 0 ? <p className={styles.muted}>Nothing planned</p> : null}
              <ul className={styles.stackList}>
                {d.planned.map((p) => (
                  <li key={p.workout.id}>
                    <SessionChip item={p} onOpen={setEditing} />
                  </li>
                ))}
              </ul>
              <p className={styles.muted} data-numeric>
                Planned {fmtDuration(totals[i]?.plannedS ?? 0)}, done {fmtDuration(totals[i]?.doneS ?? 0)}
              </p>
            </li>
          ))}
        </ol>
      ) : (
        <div className={styles.board} onFocusCapture={() => setFocusDay(columnDayOfFocus())}>
          <DragGrid
            aria-label={`${name}'s sessions by day`}
            className={styles.grid}
            columns={columns}
            onMove={handleMove}
            moveLabel="Move"
            emptyLabel="Rest"
          />
        </div>
      )}

      <table className={styles.totals} aria-label="Planned and done totals">
        <thead>
          <tr>
            <th scope="col">
              <span className="sr-only">Measure</span>
            </th>
            {summary.days.map((d) => (
              <th key={d.day} scope="col" data-today={d.day === today || undefined}>
                {WEEKDAYS[((d.day % 7) + 7) % 7]?.slice(0, 3)}
              </th>
            ))}
            <th scope="col">Week</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <th scope="row">Planned time</th>
            {totals.map((t, i) => (
              <td key={i} data-numeric>
                {fmtDuration(t.plannedS)}
              </td>
            ))}
            <td data-numeric data-testid="week-planned-time">
              {fmtDuration(summary.plannedDurationS)}
            </td>
          </tr>
          <tr>
            <th scope="row">Done time</th>
            {totals.map((t, i) => (
              <td key={i} data-numeric>
                {fmtDuration(t.doneS)}
              </td>
            ))}
            <td data-numeric data-testid="week-done-time">
              {fmtDuration(summary.doneDurationS)}
            </td>
          </tr>
          <tr>
            <th scope="row">Planned distance</th>
            {totals.map((t, i) => (
              <td key={i} data-numeric>
                {km(t.plannedM)}
              </td>
            ))}
            <td data-numeric>{km(weekPlannedM)}</td>
          </tr>
          <tr>
            <th scope="row">Done distance</th>
            {totals.map((t, i) => (
              <td key={i} data-numeric>
                {km(t.doneM)}
              </td>
            ))}
            <td data-numeric>{km(weekDoneM)}</td>
          </tr>
          <tr>
            <th scope="row">Planned load</th>
            {totals.map((t, i) => (
              <td key={i} data-numeric>
                {Math.round(t.plannedLoad)}
              </td>
            ))}
            <td data-numeric data-testid="week-planned-load">
              {Math.round(summary.plannedLoad)}
            </td>
          </tr>
          <tr>
            <th scope="row">Done load</th>
            {totals.map((t, i) => (
              <td key={i} data-numeric>
                {Math.round(t.doneLoad)}
              </td>
            ))}
            <td data-numeric data-testid="week-done-load">
              {Math.round(summary.doneLoad)}
            </td>
          </tr>
          <tr>
            <th scope="row">Compliance</th>
            <td colSpan={7} className={styles.muted}>
              {summary.target
                ? `Target ${Math.round(summary.target.loadTarget)} load, ${summary.target.hoursTarget} h`
                : 'No target set'}
            </td>
            <td data-numeric>{summary.compliance === null ? 'None due' : `${displayPct(summary.compliance)}%`}</td>
          </tr>
        </tbody>
      </table>

      {editing ? (
        <Suspense fallback={null}>
          <SessionEditor key={editing} workoutId={editing} readOnly={readOnly} onClose={() => setEditing(null)} />
        </Suspense>
      ) : null}

      <Dialog
        isOpen={conflict !== null}
        onOpenChange={(open) => {
          if (!open) setConflict(null)
        }}
        title={conflict ? `${dayLabel(conflict.day)} already has a session` : 'Day already has a session'}
        footer={
          <>
            <Button variant="quiet" onPress={() => setConflict(null)}>
              Cancel
            </Button>
            <Button variant="secondary" onPress={() => resolveConflict('both')}>
              Keep both
            </Button>
            <Button variant="primary" onPress={() => resolveConflict('swap')}>
              Swap
            </Button>
          </>
        }
      >
        <p>
          {conflictMoving?.title ?? 'This session'} can go on the same day as {conflictOther?.title ?? 'the other session'}, or the two can
          swap days.
        </p>
      </Dialog>
    </section>
  )
}
