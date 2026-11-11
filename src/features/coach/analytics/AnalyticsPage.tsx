import { Component, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router'
import { useCoachReadOnly } from '../../../app/useCoachReadOnly.ts'
import { useHotkeys } from '../../../app/keyboard/index.ts'
import { ATHLETES, isAthleteId } from '../../../app/people.ts'
import type { AthleteId } from '../../../app/people.ts'
import { useViewer } from '../../../app/viewer.ts'
import { currentDay, selectAnalytics, selectAthleteDay, thresholdOn } from '../../../data/selectors.ts'
import type { LareeData } from '../../../data/store.ts'
import { useLaree } from '../../../data/store.ts'
import { PLAN_LAST_WEEK } from '../../../data/seed/index.ts'
import { thresholdsOn } from '../../../data/seed/people.ts'
import { formBand } from '../../../domain/metrics/fitness.ts'
import type { ComplianceBand } from '../../../domain/types.ts'
import { relativeWeek, weekOfDay, weekRange } from '../../../domain/time.ts'
import { Curve, FORM_BAND_LABEL, Heatmap, PMC, Bars, ZoneBar, fmtDay, fmtNumber, fmtPace, fmtSigned } from '../../../charts/index.ts'
import type { BarDatum, HeatCell, HeatLevel, HeatRow } from '../../../charts/index.ts'
import { Card, Chip, Skeleton } from '../../../ui/core/index.ts'
import { SegmentedControl } from '../../../ui/form/index.ts'
import { digestOf, paceCurves, powerCurves, zoneSummary } from './digest.ts'
import type { ActivityDigest } from './digest.ts'
import styles from './AnalyticsPage.module.css'

export const RANGES = [
  { id: '4w', label: '4 weeks', weeks: 4 },
  { id: '8w', label: '8 weeks', weeks: 8 },
  { id: '16w', label: '16 weeks', weeks: 16 },
  { id: 'plan', label: 'Plan', weeks: 0 },
] as const
export type RangeId = (typeof RANGES)[number]['id']
const DEFAULT_RANGE: RangeId = '8w'
const PREF_KEY = 'analyticsRange'
const RAMP_CAUTION = 8
const isRange = (v: unknown): v is RangeId => RANGES.some((r) => r.id === v)

/** An error tile in place of one chart that failed to draw. */
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

const BAND_LEVEL: Record<ComplianceBand, HeatLevel> = {
  onPlan: 0,
  short: 1,
  over: 1,
  under: 2,
  wellOver: 3,
  missed: 4,
  unplanned: 1,
}
const BAND_GLYPH: Record<ComplianceBand, string> = {
  onPlan: '',
  short: '−',
  over: '+',
  under: '↓',
  wellOver: '↑',
  missed: '×',
  unplanned: '',
}
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function weekCell(pct: number | null): HeatCell | null {
  if (pct === null) return null
  const level: HeatLevel = pct >= 90 ? 0 : pct >= 80 ? 1 : pct >= 60 ? 2 : 3
  return { level, text: String(Math.round(pct)), label: `Week compliance ${Math.round(pct)}%` }
}

/** Digests of an athlete's detailed activities, worked out after first paint so the page opens at once. */
function useDigests(data: LareeData, athleteId: AthleteId, today: number): ActivityDigest[] | null {
  const [state, setState] = useState<{ key: string; digests: ActivityDigest[] } | null>(null)
  const activities = data.activities
  const thresholds = data.thresholds
  const key = `${athleteId}:${activities.length}:${thresholds.length}:${today}`
  useEffect(() => {
    const id = setTimeout(() => {
      const mine = activities.filter((a) => a.athleteId === athleteId && a.day <= today)
      const digests = mine.map((a) => digestOf(a, thresholdsOn(athleteId, a.day, thresholds)))
      setState({ key, digests })
    }, 0)
    return () => clearTimeout(id)
  }, [key, activities, thresholds, athleteId, today])
  return state && state.key === key ? state.digests : null
}

export default function AnalyticsPage() {
  const params = useParams()
  const [search] = useSearchParams()
  const navigate = useNavigate()
  const readOnly = useCoachReadOnly()
  const lastAthlete = useViewer((s) => s.coachAthleteId)
  const data = useLaree((s) => s.data)
  const setPref = useLaree((s) => s.setPref)
  const today = currentDay()
  const week = weekOfDay(today)

  const athleteId: AthleteId = isAthleteId(params.athleteId) ? params.athleteId : lastAthlete
  const pref = data.prefs[PREF_KEY]
  const rangeParam = search.get('range')
  const range: RangeId = isRange(rangeParam) ? rangeParam : isRange(pref) ? pref : DEFAULT_RANGE

  // The address shows whose analytics are on screen: write the default in after it resolves.
  const missingId = !isAthleteId(params.athleteId)
  const missingRange = !isRange(rangeParam)
  useEffect(() => {
    if (missingId || missingRange) {
      navigate(`/coach/analytics/${athleteId}?range=${range}`, { replace: true })
    }
  }, [missingId, missingRange, athleteId, range, navigate])

  const go = (nextAthlete: AthleteId, nextRange: RangeId) =>
    navigate(`/coach/analytics/${nextAthlete}?range=${nextRange}`)
  const changeRange = (id: string) => {
    if (!isRange(id)) return
    setPref(PREF_KEY, id)
    go(athleteId, id)
  }
  const step = (dir: 1 | -1) => {
    const i = ATHLETES.findIndex((a) => a.id === athleteId)
    const next = ATHLETES[(i + dir + ATHLETES.length) % ATHLETES.length]
    if (next) go(next.id, range)
  }
  useHotkeys(
    [
      { keys: '[', description: 'Previous athlete', handler: () => step(-1) },
      { keys: ']', description: 'Next athlete', handler: () => step(1) },
    ],
    { scope: 'page' },
  )

  const spec = RANGES.find((r) => r.id === range) ?? RANGES[1]
  const firstWeek = spec.weeks === 0 ? 1 : Math.max(1, week - spec.weeks + 1)
  const lastWeek = spec.weeks === 0 ? PLAN_LAST_WEEK : week
  const firstDay = weekRange(firstWeek).firstDay
  const name = ATHLETES.find((a) => a.id === athleteId)?.name ?? athleteId

  const analytics = selectAnalytics(data, athleteId, Math.max(lastWeek, week), today)
  const weeks = analytics.weekly.filter((w) => w.week >= firstWeek && w.week <= lastWeek)
  const nowPoint = analytics.fitness.find((p) => p.day === today)
  const earlier = analytics.fitness.find((p) => p.day === Math.max(firstDay, 0))
  const pmcLast = spec.weeks === 0 ? weekRange(PLAN_LAST_WEEK).lastDay : weekRange(week + 2).lastDay
  const pmcPoints = analytics.fitness.filter((p) => p.day >= firstDay && p.day <= pmcLast)
  const races = data.races
    .filter((r) => r.athleteId === athleteId && r.day >= firstDay && r.day <= pmcLast)
    .map((r) => ({ day: r.day, name: r.name, priority: r.priority }))

  const loadBars: BarDatum[] = weeks.map((w) => ({
    key: `w${w.week}`,
    label: fmtDay(weekRange(w.week).firstDay),
    value: Math.round(w.doneLoad),
    target: w.plannedLoad > 0 ? Math.round(w.plannedLoad) : null,
  }))

  // Compliance by week: days across, weeks down the page, finished weeks only.
  const compWeeks = weeks.filter((w) => w.week <= week)
  const complianceRows: HeatRow[] = [
    ...WEEKDAYS.map((label, di) => ({
      key: `d${di}`,
      label,
      cells: compWeeks.map((w): HeatCell | null => {
        const day = weekRange(w.week).firstDay + di
        const items = selectAthleteDay(data, athleteId, day, today).planned
        const scored = items.filter((i) => i.evaluation?.band)
        if (scored.length === 0) return null
        const worst = scored.reduce((a, b) =>
          BAND_LEVEL[b.evaluation?.band ?? 'onPlan'] > BAND_LEVEL[a.evaluation?.band ?? 'onPlan'] ? b : a,
        )
        const band = worst.evaluation?.band ?? 'onPlan'
        const pct = worst.evaluation?.compliance?.shownPct
        return {
          level: BAND_LEVEL[band],
          text: band === 'missed' ? '0' : pct === undefined ? '' : String(pct),
          glyph: BAND_GLYPH[band],
        }
      }),
    })),
    { key: 'week', label: 'Week', cells: compWeeks.map((w) => weekCell(w.compliance)) },
  ]
  const finished = compWeeks.filter((w) => w.compliance !== null)
  const meanCompliance = finished.length
    ? finished.reduce((t, w) => t + (w.compliance ?? 0), 0) / finished.length
    : null

  const digests = useDigests(data, athleteId, today)
  const hasFtp = thresholdOn(data, athleteId, 'ftp', today) !== undefined
  const zones = digests ? zoneSummary(digests, firstDay, Math.min(today, weekRange(lastWeek).lastDay)) : null
  const power = digests && hasFtp ? powerCurves(digests, today) : null
  const pace = digests ? paceCurves(digests, today) : null

  const ramp = nowPoint?.ramp ?? null
  const rampHigh = ramp !== null && ramp >= RAMP_CAUTION
  const band = nowPoint ? formBand(nowPoint.form) : null
  const warmingUp = today < 42

  return (
    <div className={styles.page} data-readonly={readOnly ? 'true' : undefined} data-athlete={athleteId}>
      <header className={styles.head}>
        <h1 className={styles.title}>Analytics</h1>
        <div className={styles.controls}>
          <SegmentedControl
            ariaLabel="Athlete"
            options={ATHLETES.map((a) => ({ id: a.id, label: a.name }))}
            value={athleteId}
            onChange={(id) => isAthleteId(id) && go(id, range)}
          />
          <SegmentedControl
            ariaLabel="Period"
            options={RANGES.map((r) => ({ id: r.id, label: r.label }))}
            value={range}
            onChange={changeRange}
          />
        </div>
      </header>

      <dl className={styles.stats} aria-label={`${name}, today`}>
        <div className={styles.stat}>
          <dt>Fitness</dt>
          <dd data-numeric>{nowPoint ? fmtNumber(nowPoint.fitness) : '–'}</dd>
          <p className={styles.base} data-numeric>
            {nowPoint && earlier ? `${fmtSigned(nowPoint.fitness - earlier.fitness)} over ${spec.weeks === 0 ? 'plan' : spec.label}` : ''}
          </p>
        </div>
        <div className={styles.stat}>
          <dt>Fatigue</dt>
          <dd data-numeric>{nowPoint ? fmtNumber(nowPoint.fatigue) : '–'}</dd>
        </div>
        <div className={styles.stat}>
          <dt>Form</dt>
          <dd data-numeric>{nowPoint ? fmtSigned(nowPoint.form) : '–'}</dd>
          {band ? <p className={styles.base}>{FORM_BAND_LABEL[band]}</p> : null}
        </div>
        <div className={styles.stat} data-caution={rampHigh ? 'true' : undefined}>
          <dt>Ramp</dt>
          <dd data-numeric>{ramp !== null ? `${fmtSigned(ramp, 1)} a week` : '–'}</dd>
          {rampHigh ? <Chip glyph="!">Above {RAMP_CAUTION} a week</Chip> : <p className={styles.base}>Caution at {RAMP_CAUTION}</p>}
        </div>
        <div className={styles.stat}>
          <dt>Compliance</dt>
          <dd data-numeric>{meanCompliance === null ? '–' : `${fmtNumber(meanCompliance)}%`}</dd>
          <p className={styles.base}>{finished.length} {finished.length === 1 ? 'week' : 'weeks'}</p>
        </div>
        <div className={styles.stat}>
          <dt>Polarisation</dt>
          <dd data-numeric>{zones ? (zones.polarisation.index === null ? '–' : fmtNumber(zones.polarisation.index, 2)) : '…'}</dd>
          <p className={styles.base}>{zones ? zones.polarisation.label : 'Working out'}</p>
        </div>
      </dl>

      <div className={styles.grid}>
        <Card className={`${styles.card} ${styles.wide}`}>
          <TileBoundary name="The Fitness chart">
            {pmcPoints.length > 0 ? (
              <PMC points={pmcPoints} today={today} races={races} title={`${name}: Fitness, Fatigue and Form`} height={300} />
            ) : (
              <p className={styles.note}>No Fitness to show for this period.</p>
            )}
            {warmingUp ? <p className={styles.note}>Under six weeks of data: Fitness is still warming up.</p> : null}
          </TileBoundary>
        </Card>

        <Card className={styles.card}>
          <TileBoundary name="The weekly load chart">
            {loadBars.some((b) => b.value > 0 || (b.target ?? 0) > 0) ? (
              <Bars
                data={loadBars}
                title={`${name}: weekly Load against plan`}
                measure="Load"
                valueHeading="Load"
                formatValue={(n) => fmtNumber(n)}
                height={220}
              />
            ) : (
              <p className={styles.note}>No weekly Load in this period.</p>
            )}
          </TileBoundary>
        </Card>

        <Card className={styles.card}>
          <TileBoundary name="The compliance chart">
            {compWeeks.length > 0 ? (
              <Heatmap
                title={`${name}: compliance by week`}
                measure="Compliance"
                columns={compWeeks.map((w) => ({ key: `w${w.week}`, label: fmtDay(weekRange(w.week).firstDay) }))}
                rows={complianceRows}
                legend={[
                  { level: 0, label: 'On plan' },
                  { level: 1, label: 'Short or over' },
                  { level: 2, label: 'Under' },
                  { level: 3, label: 'Well over' },
                  { level: 4, label: 'Missed' },
                ]}
                onCellActivate={(_row, col) => {
                  const w = Number(col.slice(1))
                  navigate(`/coach/calendar/${athleteId}?w=${relativeWeek(w)}`)
                }}
              />
            ) : (
              <p className={styles.note}>No finished weeks in this period.</p>
            )}
          </TileBoundary>
        </Card>

        <Card className={styles.card}>
          <TileBoundary name="The time in zones chart">
            {zones ? (
              zones.zonedS > 0 ? (
                <>
                  <ZoneBar seconds={zones.seconds} title={`${name}: time in zones`} height={36} />
                  <p className={styles.line} data-numeric>
                    Easy {zones.shares.easy}% · Middle {zones.shares.middle}% · Hard {zones.shares.hard}%
                    {' · '}
                    {zones.polarisation.label}
                    {zones.polarisation.index === null ? '' : ` (${fmtNumber(zones.polarisation.index, 2)})`}
                  </p>
                </>
              ) : (
                <p className={styles.note}>No time in zones in this period.</p>
              )
            ) : (
              <div aria-busy="true"><Skeleton height="4rem" /></div>
            )}
          </TileBoundary>
        </Card>

        <Card className={`${styles.card} ${styles.wide}`}>
          <div className={styles.curves}>
            <TileBoundary name="The power curve">
              {!hasFtp ? (
                <p className={styles.note}>{name} has no power data, so there is no power curve.</p>
              ) : power ? (
                power.season.length > 0 ? (
                  <Curve
                    title={`${name}: best power`}
                    points={power.season}
                    comparison={power.recent}
                    label="Season best"
                    comparisonLabel="Last 6 weeks"
                    height={240}
                  />
                ) : (
                  <p className={styles.note}>No rides with power yet.</p>
                )
              ) : (
                <div aria-busy="true"><Skeleton height="12rem" /></div>
              )}
            </TileBoundary>
            <TileBoundary name="The pace curve">
              {pace ? (
                pace.season.length > 0 ? (
                  <Curve
                    title={`${name}: best pace`}
                    points={pace.season}
                    comparison={pace.recent}
                    label="Season best"
                    comparisonLabel="Last 6 weeks"
                    formatValue={(v) => fmtPace(v, 'run')}
                    fromZero={false}
                    height={240}
                  />
                ) : (
                  <p className={styles.note}>{name} has no runs with distance data, so there is no pace curve.</p>
                )
              ) : (
                <div aria-busy="true"><Skeleton height="12rem" /></div>
              )}
            </TileBoundary>
          </div>
        </Card>
      </div>
    </div>
  )
}
