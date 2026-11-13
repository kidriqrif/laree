import { lazy, Suspense, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { useHotkeys } from '../../../app/keyboard/index.ts'
import { ATHLETES, isAthleteId } from '../../../app/people.ts'
import { useCoachReadOnly } from '../../../app/useCoachReadOnly.ts'
import { fmtDay, Heatmap } from '../../../charts/index.ts'
import { currentDay } from '../../../data/selectors.ts'
import { useLaree } from '../../../data/store.ts'
import { RULES, summariseValues } from '../../../domain/flags.ts'
import type { FlagRecord } from '../../../domain/flags.ts'
import type { AthleteId, DayOffset } from '../../../domain/types.ts'
import { EmptyState } from '../../../ui/core/index.ts'
import { showUndoToast } from '../../../ui/overlay/index.ts'
import { KudosButtonSlot } from '../activity/KudosButtonSlot.tsx'
import { SegmentedControl } from '../../../ui/form/index.ts'
import {
  cellFor,
  filterFlags,
  flagActionUndo,
  isGridMetric,
  isStatusFilter,
  legendFor,
  METRICS,
  metricInfo,
  SEVERITY_LABEL,
  STATUS_FILTERS,
  STATUS_TEXT,
} from './model.ts'
import styles from './CheckIns.module.css'

const FlagDetailDrawer = lazy(() => import('./FlagDetailDrawer.tsx'))
const CheckInDetailDrawer = lazy(() => import('./CheckInDetailDrawer.tsx'))

const GRID_DAYS = 14
const NAME_BY_ID = Object.fromEntries(ATHLETES.map((a) => [a.id, a.name])) as Record<AthleteId, string>

/** How long ago a flag opened: "Today", "Yesterday" or "9 d ago". */
function age(day: DayOffset, today: DayOffset): string {
  const d = today - day
  return d <= 0 ? 'Today' : d === 1 ? 'Yesterday' : `${d} d ago`
}

/** C13. How is everyone coping: the 14-day check-in grid and the flag inbox. */
export default function CheckInsPage() {
  const [params, setParams] = useSearchParams()
  const readOnly = useCoachReadOnly()
  const data = useLaree((s) => s.data)
  const today = currentDay()

  const metricParam = params.get('metric')
  const metric = isGridMetric(metricParam) ? metricParam : 'sleep'
  const statusParam = params.get('status')
  const status = isStatusFilter(statusParam) ? statusParam : 'open'
  const athleteParam = params.get('athlete')
  const athleteFilter = isAthleteId(athleteParam) ? athleteParam : null
  const flagParam = params.get('flag')
  const checkInParam = params.get('checkin')

  const setParam = (key: string, value: string | null, keep = true) =>
    setParams(
      (p) => {
        const next = new URLSearchParams(p)
        if (value === null) next.delete(key)
        else next.set(key, value)
        return next
      },
      { replace: keep },
    )

  // ---- grid
  const info = metricInfo(metric)
  const columns = useMemo(
    () =>
      Array.from({ length: GRID_DAYS }, (_, i) => {
        const day = today - (GRID_DAYS - 1) + i
        return { key: String(day), label: fmtDay(day) }
      }),
    [today],
  )
  const rows = ATHLETES.map((a) => {
    const mine = data.checkIns.filter((c) => c.athleteId === a.id)
    return {
      key: a.id,
      label: a.name,
      cells: columns.map((col) =>
        cellFor(metric, mine.find((c) => c.day === Number(col.key)), mine, a.id),
      ),
    }
  })
  const legend = legendFor(info)

  // ---- inbox
  const allFlags: FlagRecord[] = ATHLETES.flatMap((a) => data.flagsState[a.id].flags)
  const flags = filterFlags(
    athleteFilter ? allFlags.filter((f) => f.athleteId === athleteFilter) : allFlags,
    status,
    today,
  )
  const navigate = useNavigate()
  const acknowledgeFlag = useLaree((s) => s.acknowledgeFlag)
  const [drawerMode, setDrawerMode] = useState<'view' | 'resolve' | 'note'>('view')
  const [sel, setSel] = useState(0)
  const selected = Math.min(sel, Math.max(0, flags.length - 1))
  const rowRefs = useRef<(HTMLButtonElement | null)[]>([])
  const move = (delta: number) => {
    if (flags.length === 0) return
    const next = Math.min(flags.length - 1, Math.max(0, selected + delta))
    setSel(next)
    rowRefs.current[next]?.focus()
  }
  const openFlag = (id: string, mode: 'view' | 'resolve' | 'note' = 'view') => {
    setDrawerMode(mode)
    setParam('flag', id, false)
  }
  const closeFlag = () => {
    setParam('flag', null, false)
    rowRefs.current[selected]?.focus()
  }
  const shownFlag = flagParam ? allFlags.find((f) => f.id === flagParam) : undefined
  const [ciAthlete, ciDay] = (checkInParam ?? '').split(':')
  const shownCheckIn = isAthleteId(ciAthlete) && Number.isFinite(Number(ciDay)) && ciDay ? { athleteId: ciAthlete, day: Number(ciDay) } : null

  useHotkeys(
    [
      { keys: 'j', description: 'Next flag', handler: () => move(1) },
      { keys: 'k', description: 'Previous flag', handler: () => move(-1) },
      {
        keys: 'Enter',
        description: 'Open the flag',
        handler: (e) => {
          const f = flags[selected]
          if (!f) return
          // A focused row button also fires click; stop it running twice.
          if (e.target instanceof HTMLButtonElement) return
          openFlag(f.id)
        },
      },
      {
        keys: 'a',
        description: 'Acknowledge the flag',
        enabled: !readOnly,
        handler: () => {
          const f = flags[selected]
          if (!f || f.status !== 'open') return
          const who = f.athleteId as AthleteId
          const undo = flagActionUndo(who, f.id, () => acknowledgeFlag(f.id, who, today))
          if (undo) showUndoToast('Flag acknowledged', undo)
        },
      },
      {
        keys: 'r',
        description: 'Resolve the flag',
        enabled: !readOnly,
        handler: () => {
          const f = flags[selected]
          if (f && f.status !== 'resolved') openFlag(f.id, 'resolve')
        },
      },
      {
        keys: 'n',
        description: 'Add a note to the flag',
        enabled: !readOnly,
        handler: () => {
          const f = flags[selected]
          if (f) openFlag(f.id, 'note')
        },
      },
      {
        keys: 'c',
        description: 'Open the calendar for this athlete',
        handler: () => {
          const f = flags[selected]
          if (f) void navigate(`/coach/calendar/${f.athleteId}`)
        },
      },
    ],
  )

  const emptyText =
    status === 'resolved'
      ? 'No flags resolved in the last 28 days.'
      : status === 'open'
        ? 'Nothing needs attention right now.'
        : 'No flags match this filter.'

  return (
    <section className={styles.page}>
      <header className={styles.header}>
        <h1>Check-ins</h1>
        <p className={styles.sub}>How everyone is coping, and what needs a look.</p>
      </header>

      <div className={styles.cols}>
        <section className={styles.gridPane} aria-labelledby="ci-grid-h">
          <div className={styles.paneHead}>
            <h2 id="ci-grid-h">Last 14 days</h2>
            <SegmentedControl
              ariaLabel="Metric"
              options={METRICS.map((m) => ({ id: m.id, label: m.label }))}
              value={metric}
              onChange={(id) => setParam('metric', id === 'sleep' ? null : id)}
            />
          </div>
          <Heatmap
            title={`${info.label}, last 14 days`}
            measure={info.label}
            columns={columns}
            rows={rows}
            legend={legend}
            onCellActivate={(rowKey: string, colKey: string) => setParam('checkin', `${rowKey}:${colKey}`, false)}
          />
          <p className={styles.muted}>A hollow cell means no check-in that day. It is not a zero.</p>
        </section>

        <section className={styles.inbox} aria-labelledby="ci-inbox-h">
          <div className={styles.paneHead}>
            <h2 id="ci-inbox-h">
              Flags <span className={styles.muted}>({flags.length})</span>
            </h2>
          </div>
          <div className={styles.filters}>
            <SegmentedControl
              ariaLabel="Flag status"
              options={STATUS_FILTERS.map((f) => ({ id: f.id, label: f.label }))}
              value={status}
              onChange={(id) => setParam('status', id === 'open' ? null : id)}
            />
            <SegmentedControl
              ariaLabel="Athlete"
              options={[{ id: 'all', label: 'All' }, ...ATHLETES.map((a) => ({ id: a.id, label: a.name }))]}
              value={athleteFilter ?? 'all'}
              onChange={(id) => setParam('athlete', id === 'all' ? null : id)}
            />
          </div>
          {flags.length === 0 ? (
            <EmptyState title={emptyText} headingLevel={3} />
          ) : (
            <ul className={styles.rows} aria-label={`${flags.length} flags`}>
              {flags.map((f, i) => (
                <li key={f.id}>
                  <button
                    type="button"
                    ref={(el) => {
                      rowRefs.current[i] = el
                    }}
                    className={styles.row}
                    data-severity={f.severity}
                    data-status={f.status}
                    aria-current={i === selected ? 'true' : undefined}
                    data-testid="inbox-row"
                    onFocus={() => setSel(i)}
                    onClick={() => openFlag(f.id)}
                  >
                    <span className={styles.sev} data-severity={f.severity}>
                      {SEVERITY_LABEL[f.severity]}
                    </span>
                    <span>{NAME_BY_ID[f.athleteId as AthleteId] ?? f.athleteId}</span>
                    <span className={styles.rowTitle}>
                      {RULES[f.ruleId].title}
                      <span className={styles.muted} data-numeric>
                        {' '}
                        {summariseValues(f.ruleId, f.valuesLatest).split(' · ')[0]}
                      </span>
                    </span>
                    <span className={styles.muted}>{age(f.openedDay, today)}</span>
                    <span>{STATUS_TEXT[f.status]}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <KudosPanel readOnly={readOnly} today={today} />

      <Suspense fallback={null}>
        {shownFlag ? (
          <FlagDetailDrawer
            key={shownFlag.id}
            athleteId={shownFlag.athleteId as AthleteId}
            flagId={shownFlag.id}
            initialMode={drawerMode}
            onClose={closeFlag}
            onOpenCheckIn={(a, d) => {
              setParams((p) => {
                const next = new URLSearchParams(p)
                next.delete('flag')
                next.set('checkin', `${a}:${d}`)
                return next
              })
            }}
          />
        ) : null}
        {shownCheckIn ? (
          <CheckInDetailDrawer
            key={`${shownCheckIn.athleteId}:${shownCheckIn.day}`}
            athleteId={shownCheckIn.athleteId}
            day={shownCheckIn.day}
            onClose={() => setParam('checkin', null, false)}
          />
        ) : null}
      </Suspense>
    </section>
  )
}

/** Recent team activities to praise, and the kudos already sent. */
function KudosPanel({ readOnly, today }: { readOnly: boolean; today: DayOffset }) {
  const activities = useLaree((s) => s.data.activities)
  const kudos = useLaree((s) => s.data.kudos)
  const recent = activities
    .filter((a) => a.day > today - 7 && a.day <= today)
    .toSorted((a, b) => b.day - a.day)
    .slice(0, 8)
  const sent = kudos.toSorted((a, b) => b.day - a.day).slice(0, 6)
  return (
    <section className={styles.gridPane} aria-labelledby="ci-kudos-h">
      <div className={styles.paneHead}>
        <h2 id="ci-kudos-h">Kudos</h2>
      </div>
      {recent.length === 0 ? (
        <EmptyState title="No activities in the last 7 days." headingLevel={3} />
      ) : (
        <table className={styles.sheet} aria-label="Recent activities">
          <thead>
            <tr>
              <th scope="col">Athlete</th>
              <th scope="col">Session</th>
              <th scope="col">Date</th>
              {readOnly ? null : (
                <th scope="col">
                  <span className="sr-only">Kudos</span>
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {recent.map((a) => (
              <tr key={a.id}>
                <td>{NAME_BY_ID[a.athleteId as AthleteId] ?? a.athleteId}</td>
                <td>{a.title}</td>
                <td className={styles.date}>{fmtDay(a.day)}</td>
                {readOnly ? null : (
                  <td className={styles.action}>
                    <KudosButtonSlot athleteId={a.athleteId as AthleteId} activityId={a.id} />
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <h3>Already sent</h3>
      {sent.length === 0 ? (
        <p className={styles.muted}>No kudos sent yet.</p>
      ) : (
        <table className={styles.sheet} aria-label="Kudos sent">
          <thead>
            <tr>
              <th scope="col">Athlete</th>
              <th scope="col">Message</th>
              <th scope="col">Date</th>
            </tr>
          </thead>
          <tbody>
            {sent.map((k) => (
              <tr key={k.id}>
                <td>{NAME_BY_ID[k.athleteId as AthleteId] ?? k.athleteId}</td>
                <td>{k.message ?? 'Nice work.'}</td>
                <td className={styles.date}>{fmtDay(k.day)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}
