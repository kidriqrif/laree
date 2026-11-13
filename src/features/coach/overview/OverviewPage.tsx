/*
 * C1 Overview: "Who needs me today?"
 *
 * Deviations from the dashboard pattern, on purpose:
 * - No KPI cards. The three counts that answer the question sit in one status line above the
 *   roster, in words (the task asks for plain English), because three cards would repeat what
 *   the roster already shows per athlete.
 * - One sparkline only: an 8-week Fitness trend beside the Fitness number, from 1280 px. Ramp
 *   already gives this week's direction; the trend shows whether that is a build or a blip.
 * - Warm colour only where a rule trips: Form overreaching, Ramp above 8, a check-in gap of
 *   3 days or more, and flags (caution for Watch, danger for Act). Everything else is ink.
 * - Columns by width: every column at 1440 px. From 1280 px Today drops out (the status line
 *   still counts today's sessions), because twelve columns do not fit beside the rail there.
 *   From 1024 px Phase, Fatigue and the trend also drop out (IA C1); all stay on the athlete
 *   summary. Under 1024 px the roster is a read-only stack. Last activity and recent team
 *   activities are not here: T8.1 does not ask for them and the kudos composer has no slot here.
 */
import { Component, useMemo, useRef, useSyncExternalStore } from 'react'
import type { FocusEvent, ReactNode } from 'react'
import { Link, useNavigate } from 'react-router'
import { useHotkeys, useHotkeysContext } from '../../../app/keyboard/index.ts'
import { useCoachReadOnly } from '../../../app/useCoachReadOnly.ts'
import { DASH, FORM_BAND_LABEL, Sparkline, fmtDay, fmtNumber, fmtSigned } from '../../../charts/index.ts'
import { currentDay } from '../../../data/selectors.ts'
import { useLaree } from '../../../data/store.ts'
import { flagValuesLine, RULES } from '../../../domain/flags.ts'
import type { Severity } from '../../../domain/flags.ts'
import { BAND_LABELS } from '../../../domain/metrics/compliance.ts'
import { formBand } from '../../../domain/metrics/fitness.ts'
import { weekdayIndex } from '../../../domain/time.ts'
import type { ComplianceBand, Sport } from '../../../domain/types.ts'
import { SportGlyph, StatusGlyph } from '../../../ui/core/index.ts'
import { SeverityGlyph } from '../../../ui/core/SeverityGlyph.tsx'
import type { SportKey, StatusKey } from '../../../ui/core/index.ts'
import { DataTable } from '../../../ui/data/index.ts'
import type { DataTableColumn } from '../../../ui/data/index.ts'
import { IconChevronRight, IconFlag, IconWarning } from '../../../ui/icons/index.ts'
import {
  DEFAULT_SORT,
  PHASE_LABEL,
  SEVERITY_LABEL,
  SORT_PREF,
  SORT_VALUE,
  TREND_WEEKS,
  attentionItems,
  formatSort,
  parseSort,
  rampAboveCaution,
  rosterEntries,
  sortEntries,
  statusPhrases,
  teamStatus,
} from './roster.ts'
import type { AttentionItem, RosterEntry, RosterSort, SortColumn, TeamStatus } from './roster.ts'
import styles from './OverviewPage.module.css'

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

/** A check-in gap this many days long gets the caution colour. */
const CHECKIN_CAUTION_DAYS = 3

const BAND_STATUS: Record<ComplianceBand, StatusKey> = {
  onPlan: 'on-plan',
  short: 'partial',
  under: 'partial',
  over: 'over',
  wellOver: 'over',
  missed: 'missed',
  unplanned: 'unplanned',
}

const SPORTS = new Set<Sport>(['swim', 'bike', 'run', 'strength'])
const isSportKey = (s: Sport): s is SportKey => SPORTS.has(s)

// ---------------------------------------------------------------- layout width

/** A media query as an external store, so the roster follows the window as it is resized. */
function mediaStore(query: string) {
  const list = (): MediaQueryList | undefined =>
    typeof window === 'undefined' ? undefined : window.matchMedia?.(query)
  return {
    subscribe(onChange: () => void): () => void {
      const m = list()
      m?.addEventListener('change', onChange)
      return () => m?.removeEventListener('change', onChange)
    },
    snapshot: (): boolean => list()?.matches ?? false,
  }
}

/** From 1280 px the roster adds Phase, Fatigue and the Fitness trend. */
const WIDE = mediaStore('(min-width: 1280px)')
/** From 1440 px it also adds Today. */
const FULL = mediaStore('(min-width: 1440px)')

type Width = 'base' | 'wide' | 'full'

function useWidth(): Width {
  const wide = useSyncExternalStore(WIDE.subscribe, WIDE.snapshot, () => false)
  const full = useSyncExternalStore(FULL.subscribe, FULL.snapshot, () => false)
  return full ? 'full' : wide ? 'wide' : 'base'
}

// ---------------------------------------------------------------- cells

/** A sparkline that fails to draw leaves a dash in its cell; the row still renders. */
class TrendBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false }

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true }
  }

  override render(): ReactNode {
    if (!this.state.failed) return this.props.children
    return (
      <span className={styles.muted}>
        {DASH}
        <span className="sr-only"> Trend could not be drawn.</span>
      </span>
    )
  }
}

const dash = (why: string) => (
  <span className={styles.muted}>
    {DASH}
    <span className="sr-only"> {why}</span>
  </span>
)

function AthleteCell({ e }: { e: RosterEntry }) {
  return (
    <span className={styles.athlete}>
      <span data-roster-row={e.id} className={styles.name}>
        {e.name}
      </span>
      {e.error ? <span className={styles.caution}>Data unreadable</span> : null}
    </span>
  )
}

function RaceCell({ e }: { e: RosterEntry }) {
  if (e.error) return dash('No data.')
  if (!e.race) return dash('No race planned.')
  return (
    <span className={styles.race}>
      <span className={styles.raceName}>{e.race.name}</span>
      <span className={styles.priority} aria-label={`Priority ${e.race.priority}`}>
        {e.race.priority}
      </span>
    </span>
  )
}

function DaysCell({ e }: { e: RosterEntry }) {
  if (e.daysToRace === null) return dash('No race planned.')
  if (e.daysToRace === 0) return <span>Race day</span>
  return <span>{fmtNumber(e.daysToRace)}</span>
}

function WeekCell({ e }: { e: RosterEntry }) {
  if (e.complianceShown === null || e.complianceBand === null) return dash('Nothing due yet this week.')
  return (
    <span className={styles.withGlyph} data-band={BAND_STATUS[e.complianceBand]}>
      <StatusGlyph status={BAND_STATUS[e.complianceBand]} size={12} />
      <span>{fmtNumber(e.complianceShown)}%</span>
      <span className="sr-only">, {BAND_LABELS[e.complianceBand].toLowerCase()}</span>
    </span>
  )
}

function TodayCell({ e }: { e: RosterEntry }) {
  if (!e.day) return dash('No data.')
  const [first, ...rest] = e.day.planned
  if (!first) return <span className={styles.muted}>{e.day.unplanned.length > 0 ? 'Unplanned' : 'Rest'}</span>
  const sport = first.workout.sport
  const band = first.evaluation?.band
  return (
    <span className={styles.today}>
      {isSportKey(sport) ? <SportGlyph sport={sport} size={14} /> : null}
      <span className={styles.todayTitle}>{first.workout.title}</span>
      {band ? (
        <span className={styles.withGlyph} data-band={BAND_STATUS[band]}>
          <StatusGlyph status={BAND_STATUS[band]} size={12} />
          <span className="sr-only">{BAND_LABELS[band]}</span>
        </span>
      ) : null}
      {rest.length > 0 ? <span className={styles.muted}>+{rest.length}</span> : null}
    </span>
  )
}

function checkInWords(e: RosterEntry): string {
  if (e.checkedInToday) return 'Today'
  if (e.skippedToday) return 'Skipped today'
  if (e.daysSinceCheckIn === null) return 'None yet'
  if (e.daysSinceCheckIn === 1) return 'Yesterday'
  return `${e.daysSinceCheckIn} days ago`
}

function CheckInCell({ e }: { e: RosterEntry }) {
  if (e.error) return dash('No data.')
  const late = !e.checkedInToday && (e.daysSinceCheckIn === null || e.daysSinceCheckIn >= CHECKIN_CAUTION_DAYS)
  return (
    <span className={styles.checkIn} data-state={e.checkedInToday ? 'in' : late ? 'late' : 'missing'}>
      <span className={styles.dot} aria-hidden="true" />
      <span>{checkInWords(e)}</span>
    </span>
  )
}

function FitnessCell({ e, trend }: { e: RosterEntry; trend: boolean }) {
  if (e.fitness === null) return dash('No data.')
  return (
    <span className={styles.fitness}>
      {trend && e.trend.length > 0 ? (
        <TrendBoundary>
          <Sparkline
            values={e.trend}
            label={`${e.name}, Fitness, last ${TREND_WEEKS} weeks`}
            width={56}
            height={16}
            color="var(--series-fitness)"
            className={styles.spark}
          />
        </TrendBoundary>
      ) : null}
      <span>{fmtNumber(e.fitness)}</span>
    </span>
  )
}

function FormCell({ e }: { e: RosterEntry }) {
  if (e.form === null) return dash('No data.')
  const b = formBand(e.form)
  const warn = b === 'overreaching'
  return (
    <span className={styles.form} data-warn={warn || undefined}>
      {warn ? <IconWarning size={12} /> : null}
      <span className={styles.bandWord}>{FORM_BAND_LABEL[b]}</span>
      <span>{fmtSigned(e.form)}</span>
    </span>
  )
}

function rampArrow(ramp: number): { glyph: string; word: string } {
  const shown = fmtSigned(ramp, 1)
  if (shown.startsWith('+')) return { glyph: '↑', word: 'rising' }
  if (shown === fmtSigned(0, 1)) return { glyph: '→', word: 'flat' }
  return { glyph: '↓', word: 'falling' }
}

function RampCell({ e }: { e: RosterEntry }) {
  if (e.ramp === null) return dash('No data.')
  const warn = rampAboveCaution(e.ramp)
  const { glyph, word } = rampArrow(e.ramp)
  return (
    <span className={styles.ramp} data-warn={warn || undefined}>
      {warn ? <IconWarning size={12} /> : null}
      <span aria-hidden="true">{glyph}</span>
      <span>{fmtSigned(e.ramp, 1)}</span>
      <span className="sr-only">, {word}</span>
    </span>
  )
}

function FlagsCell({ e }: { e: RosterEntry }) {
  if (e.error) return dash('No data.')
  const top = e.flags[0]
  if (!top) return <span className="sr-only">None</span>
  return (
    <span className={styles.flags} data-severity={top.severity}>
      <SeverityGlyph severity={top.severity} />
      <span>{e.flags.length}</span>
      <span className="sr-only">
        {e.flags.length === 1 ? ' open flag' : ' open flags'}, most serious {SEVERITY_LABEL[top.severity]}
      </span>
    </span>
  )
}

/** A sortable column whose sort value is the roster's own (SORT_VALUE). */
function col(
  id: SortColumn,
  label: string,
  render: (e: RosterEntry) => ReactNode,
  extra: Partial<DataTableColumn<RosterEntry>> = {},
): DataTableColumn<RosterEntry> {
  return { id, label, value: SORT_VALUE[id], render, sortable: true, ...extra }
}

function columns(width: Width): DataTableColumn<RosterEntry>[] {
  const wide = width !== 'base'
  const full = width === 'full'
  const all: (DataTableColumn<RosterEntry> | null)[] = [
    col('athlete', 'Athlete', (e) => <AthleteCell e={e} />, { isRowHeader: true }),
    col('race', 'Next race', (e) => <RaceCell e={e} />),
    col('days', 'Days', (e) => <DaysCell e={e} />, { numeric: true }),
    wide ? col('phase', 'Phase', (e) => (e.phase ? PHASE_LABEL[e.phase] : dash('No phase.'))) : null,
    col('week', 'This week', (e) => <WeekCell e={e} />, { numeric: true }),
    full
      ? { id: 'today', label: 'Today', value: (e) => e.day?.planned.length ?? null, render: (e) => <TodayCell e={e} /> }
      : null,
    col('checkin', 'Check-in', (e) => <CheckInCell e={e} />),
    col('fitness', 'Fitness', (e) => <FitnessCell e={e} trend={wide} />, { numeric: true }),
    wide ? col('fatigue', 'Fatigue', (e) => (e.fatigue === null ? dash('No data.') : fmtNumber(e.fatigue)), { numeric: true }) : null,
    col('form', 'Form', (e) => <FormCell e={e} />, { numeric: true }),
    col('ramp', 'Ramp /wk', (e) => <RampCell e={e} />, { numeric: true }),
    col('flags', 'Flags', (e) => <FlagsCell e={e} />, { numeric: true }),
  ]
  return all.filter((c): c is DataTableColumn<RosterEntry> => c !== null)
}

// ---------------------------------------------------------------- read-only stack (under 1024 px)

function Stack({ entries }: { entries: RosterEntry[] }) {
  return (
    <ol className={styles.stack} aria-label="Team today">
      {entries.map((e) => (
        <li key={e.id} className={styles.card}>
          <Link to={`/coach/athlete/${e.id}`} className={styles.cardName} data-roster-row={e.id}>
            {e.name}
            <IconChevronRight size={14} />
          </Link>
          {e.error ? <p className={styles.caution}>Data unreadable</p> : null}
          <dl className={styles.facts}>
            <div>
              <dt>Next race</dt>
              <dd>
                <RaceCell e={e} /> <DaysCell e={e} />
                {e.daysToRace !== null && e.daysToRace > 0 ? ' days' : ''}
              </dd>
            </div>
            <div>
              <dt>This week</dt>
              <dd data-numeric>
                <WeekCell e={e} />
              </dd>
            </div>
            <div>
              <dt>Check-in</dt>
              <dd>
                <CheckInCell e={e} />
              </dd>
            </div>
            <div>
              <dt>Fitness</dt>
              <dd data-numeric>
                <FitnessCell e={e} trend={false} />
              </dd>
            </div>
            <div>
              <dt>Form</dt>
              <dd data-numeric>
                <FormCell e={e} />
              </dd>
            </div>
            <div>
              <dt>Ramp /wk</dt>
              <dd data-numeric>
                <RampCell e={e} />
              </dd>
            </div>
            <div>
              <dt>Flags</dt>
              <dd data-numeric>{e.flags.length === 0 ? '0' : <FlagsCell e={e} />}</dd>
            </div>
          </dl>
        </li>
      ))}
    </ol>
  )
}

// ---------------------------------------------------------------- status line and attention list

function StatusLine({ status }: { status: TeamStatus | null }) {
  if (!status) return <p className={styles.status}>Counts unavailable. The roster below is still current.</p>
  const words = statusPhrases(status)
  return (
    <p className={styles.status} data-testid="team-status">
      <span className={styles.phrase} data-on={status.openFlags > 0 || undefined} data-kind="flags">
        {status.openFlags > 0 ? <IconFlag size={14} /> : null}
        {words.flags}.
      </span>{' '}
      <span className={styles.phrase} data-on={status.missingCheckIns > 0 || undefined} data-kind="checkins">
        {words.checkIns}.
      </span>{' '}
      <span className={styles.phrase} data-kind="sessions">
        {words.sessions}.
      </span>
    </p>
  )
}

const SEVERITY_ORDER: Severity[] = ['act', 'watch', 'info']

function Attention({ items }: { items: AttentionItem[] }) {
  const today = currentDay()
  if (items.length === 0) return <p className={styles.empty}>Nothing needs you. No open flags or missed key sessions.</p>
  return (
    <ul className={styles.attention}>
      {items.map((item) =>
        item.kind === 'flag' ? (
          <li key={item.flag.id}>
            <Link to={`/coach/athlete/${item.athleteId}?flag=${item.flag.id}`} className={styles.attnRow}>
              <span className={styles.flags} data-severity={item.flag.severity}>
                <SeverityGlyph severity={item.flag.severity} />
                {SEVERITY_LABEL[item.flag.severity]}
              </span>
              <span className={styles.attnWho}>{item.name}</span>
              <span className={styles.attnWhat}>{RULES[item.flag.ruleId].title}</span>
              <span className={styles.attnData} data-mono>
                {flagValuesLine(item.flag, 'latest', today, fmtDay)}
              </span>
              <span className={styles.muted}>Raised {fmtDay(item.flag.openedDay)}</span>
            </Link>
          </li>
        ) : (
          <li key={item.workout.id}>
            <Link to={`/coach/calendar/${item.athleteId}`} className={styles.attnRow}>
              <span className={styles.withGlyph} data-band="missed">
                <StatusGlyph status="missed" size={12} />
                Missed
              </span>
              <span className={styles.attnWho}>{item.name}</span>
              <span className={styles.attnWhat}>Key session: {item.workout.title}</span>
              <span className={styles.attnData} />
              <span className={styles.muted}>{fmtDay(item.workout.day)}</span>
            </Link>
          </li>
        ),
      )}
    </ul>
  )
}

// ---------------------------------------------------------------- keyboard

/** The athlete a focused element belongs to: a roster row, a cell in it, or a stack link. */
function idOf(el: Element): string | null {
  const own = el.closest('[data-roster-row]')
  if (own) return own.getAttribute('data-roster-row')
  return el.closest('[role="row"]')?.querySelector('[data-roster-row]')?.getAttribute('data-roster-row') ?? null
}

/** The focusable thing per athlete, in screen order: table rows, or the stack's links. */
function rosterItems(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>('[data-roster-row]')].map(
    (marker) => marker.closest<HTMLElement>('[role="row"]') ?? marker,
  )
}

// ---------------------------------------------------------------- page

export default function OverviewPage() {
  const data = useLaree((s) => s.data)
  const rawSort = useLaree((s) => s.data.prefs[SORT_PREF])
  const setPref = useLaree((s) => s.setPref)
  const readOnly = useCoachReadOnly()
  const width = useWidth()
  const navigate = useNavigate()
  const { singleKeysEnabled } = useHotkeysContext()
  const root = useRef<HTMLDivElement>(null)
  const lastId = useRef<string | null>(null)
  const today = currentDay()

  const entries = useMemo(() => rosterEntries(data, today), [data, today])
  const status = useMemo(() => {
    try {
      return teamStatus(data, today)
    } catch {
      return null
    }
  }, [data, today])
  const attention = useMemo(() => attentionItems(data, entries, today), [data, entries, today])
  const sort = parseSort(rawSort)
  const sorted = useMemo(() => sortEntries(entries, sort), [entries, sort])
  const cols = useMemo(() => columns(width), [width])

  // Enter on a row reaches both the key layer (key down) and the table's row action (key up):
  // open once.
  const opened = useRef<string | null>(null)
  const open = (id: string) => {
    if (opened.current === id) return
    opened.current = id
    void navigate(`/coach/athlete/${id}`)
  }
  const setSort = (next: RosterSort) => setPref(SORT_PREF, formatSort(next))

  const move = (step: 1 | -1) => {
    const node = root.current
    if (!node) return
    const items = rosterItems(node)
    const active = document.activeElement
    const at = active ? items.findIndex((el) => el.contains(active)) : -1
    let next: HTMLElement | undefined
    if (at === -1) {
      next = items.find((el) => idOf(el) === lastId.current) ?? (step === 1 ? items[0] : items.at(-1))
    } else {
      next = items[Math.min(items.length - 1, Math.max(0, at + step))]
    }
    next?.focus()
  }

  useHotkeys([
    { keys: 'j', description: 'Next athlete in the roster', handler: () => move(1) },
    { keys: 'k', description: 'Previous athlete in the roster', handler: () => move(-1) },
    {
      keys: 'Enter',
      description: 'Open the focused athlete',
      handler: (event) => {
        const target = event.target instanceof HTMLElement ? event.target : null
        const id = target && root.current?.contains(target) ? idOf(target) : null
        if (id) {
          open(id)
          return
        }
        // Nothing focused: open the athlete last focused in the roster.
        if (!target || target === document.body || target.id === 'main') {
          if (lastId.current) open(lastId.current)
          return
        }
        // React Aria controls act on Enter themselves (on key up). A plain link or button lost its
        // default to the key layer, so press it here.
        if (!target.closest('[data-rac]') && target.matches('a[href], button, summary')) target.click()
      },
    },
  ])

  const remember = (event: FocusEvent<HTMLDivElement>) => {
    const id = idOf(event.target)
    if (id) lastId.current = id
  }

  const date = `${WEEKDAYS[weekdayIndex(today)] ?? ''} ${fmtDay(today)}`
  const severityCount = (s: Severity) => attention.filter((a) => a.kind === 'flag' && a.flag.severity === s).length

  return (
    <div className={styles.page} ref={root} onFocus={remember}>
      <header className={styles.header}>
        <h1>Overview</h1>
        <p className={styles.date}>{date}</p>
      </header>

      <StatusLine status={status} />

      <section className={styles.section} aria-labelledby="overview-roster">
        <h2 id="overview-roster" data-label className={styles.rule}>
          Team today
        </h2>
        {readOnly ? (
          <Stack entries={sorted} />
        ) : (
          <DataTable<RosterEntry>
            aria-label="Team today"
            columns={cols}
            rows={sorted}
            getRowId={(e) => e.id}
            sort={sort}
            onSortChange={(d) => {
              if (typeof d.column === 'string' && d.column in SORT_VALUE) {
                setSort({ column: d.column as SortColumn, direction: d.direction })
              }
            }}
            onRowAction={(e) => open(e.id)}
            emptyState="No athletes yet."
            className={styles.table}
          />
        )}
        {singleKeysEnabled && !readOnly ? (
          <p className={styles.hint}>
            <kbd>j</kbd> <kbd>k</kbd> move <span aria-hidden="true">·</span> <kbd>Enter</kbd> opens{' '}
            <span aria-hidden="true">·</span> <kbd>?</kbd> all keys
          </p>
        ) : null}
      </section>

      <section className={styles.section} aria-labelledby="overview-attention">
        <h2 id="overview-attention" data-label className={styles.rule}>
          Needs attention
          {attention.length > 0 ? (
            <span className={styles.ruleCount}>
              {SEVERITY_ORDER.map((s) => (severityCount(s) > 0 ? `${severityCount(s)} ${SEVERITY_LABEL[s]}` : null))
                .filter(Boolean)
                .join(' · ')}
            </span>
          ) : null}
        </h2>
        <Attention items={attention} />
      </section>
    </div>
  )
}

export { DEFAULT_SORT }
