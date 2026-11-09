import type { ReactNode } from 'react'
import {
  Axis,
  Bars,
  Bullet,
  ChartFrame,
  Curve,
  FORM_BAND_LABEL,
  Heatmap,
  PMC,
  Sparkline,
  TrackLap,
  ZoneBar,
  fmtDay,
  fmtDistance,
  fmtDuration,
  fmtMinutes,
  fmtMinutesWords,
  fmtNumber,
  fmtPace,
  fmtPercent,
  fmtSigned,
  fmtSpan,
  niceMax,
  niceTicks,
} from '../../../charts/index.ts'
import type { HeatCell, HeatLevel, HeatRow } from '../../../charts/index.ts'
import { Skeleton } from '../../../ui/core/index.ts'
import { selectAnalytics } from '../../../data/selectors.ts'
import { ATHLETES } from '../../../data/seed/people.ts'
import { ATHLETE_IDS } from '../../../data/seed/index.ts'
import { weekOfDay } from '../../../domain/time.ts'
import { POWER_CURVE, POWER_CURVE_BEFORE, ZONE_SECONDS, getSample } from './sample.ts'
import { Group, Helpers, Specimen, State } from './Specimen.tsx'
import styles from './KitPage.module.css'

const FROM = 'src/charts/index.ts'

const levelOf = (pct: number): HeatLevel => (pct < 40 ? 0 : pct < 70 ? 1 : pct < 90 ? 2 : pct <= 110 ? 3 : 4)
const LEGEND = [
  { level: 0 as const, label: 'Under 40%' },
  { level: 1 as const, label: '40 to 69%' },
  { level: 2 as const, label: '70 to 89%' },
  { level: 3 as const, label: '90 to 110%' },
  { level: 4 as const, label: 'Over 110%' },
]

const hoursFmt = (n: number) => `${fmtNumber(n, 1)} h`

function Box({ children }: { children: ReactNode }) {
  return <div className={styles.chartBox}>{children}</div>
}

export function ChartsGroup() {
  const { data, today, fitness, progress, weekly, races } = getSample()
  const lastWeek = Math.max(2, weekOfDay(today) - 1)
  const weeks = Array.from({ length: 6 }, (_, i) => lastWeek - 5 + i).filter((w) => w >= 1)
  const heatRows: HeatRow[] = ATHLETE_IDS.map((id) => {
        const series = selectAnalytics(data, id, lastWeek, today).weekly
        return {
          key: id,
          label: ATHLETES.find((a) => a.id === id)?.name ?? id,
          cells: weeks.map((w): HeatCell | null => {
            const c = series.find((p) => p.week === w)?.compliance
            return c == null ? null : { level: levelOf(c), text: `${Math.round(c)}%`, label: `Week ${w}: ${Math.round(c)}% of plan` }
          }),
        }
      })

  const bars = weekly.slice(-6).map((p) => ({
    key: `w${p.week}`,
    label: `W${p.week}`,
    value: Math.round(p.doneHours * 10) / 10,
    target: Math.round(p.plannedHours * 10) / 10,
  }))
  const spark = fitness.filter((p) => p.day <= today).slice(-42).map((p) => p.fitness)
  const lap = progress.lap

  return (
    <Group
      title="Charts"
      importPath={FROM}
      intro="Every chart has a title, a one-line summary for screen readers and a data table behind it. Colour never carries meaning alone. Hover and focus on charts are interactive only: points and cells take focus with the keyboard."
    >
      <Specimen name="PMC (Fitness chart)" covers={['PMC', 'FORM_BAND_LABEL']} from={FROM} wide note={`Fitness, Fatigue and Form, with the plan projected forward. Form bands: ${Object.values(FORM_BAND_LABEL).join(', ')}.`}>
        <State label="Default" wide>
          <Box>
            <PMC points={fitness} today={today} races={races} title="Amir: Fitness, Fatigue and Form" />
          </Box>
        </State>
        <State label="Empty" wide>
          <Box>
            <PMC points={[]} today={today} title="Fitness chart with no data" />
          </Box>
        </State>
      </Specimen>

      <Specimen name="Bars" covers={['Bars']} from={FROM} wide>
        <State label="Default (hours against plan)" wide>
          <Box>
            <Bars data={bars} title="Weekly hours, done against planned" measure="hours" formatValue={hoursFmt} sport="run" />
          </Box>
        </State>
        <State label="Empty" wide>
          <Box>
            <Bars data={[]} title="Weekly hours, no weeks yet" measure="hours" />
          </Box>
        </State>
      </Specimen>

      <Specimen name="Bullet" covers={['Bullet']} from={FROM} wide>
        <State label="Under plan" wide>
          <Box>
            <Bullet title="Run load this week" actual={140} target={220} bands={[{ to: 110, label: 'Low' }, { to: 198, label: 'On plan' }, { to: 264, label: 'Over' }]} />
          </Box>
        </State>
        <State label="Over plan" wide>
          <Box>
            <Bullet title="Bike load this week" actual={280} target={220} bands={[{ to: 110, label: 'Low' }, { to: 198, label: 'On plan' }, { to: 264, label: 'Over' }]} />
          </Box>
        </State>
      </Specimen>

      <Specimen name="Sparkline" covers={['Sparkline']} from={FROM}>
        <State label="Default">
          <Sparkline values={spark} label="Fitness over six weeks" width={160} height={32} />
        </State>
        <State label="With gaps">
          <Sparkline values={[40, 42, null, 45, 47, null, 50]} label="Resting heart rate with missed mornings" width={160} height={32} />
        </State>
        <State label="Empty">
          <Sparkline values={[]} label="No readings yet" width={160} height={32} />
        </State>
      </Specimen>

      <Specimen name="ZoneBar" covers={['ZoneBar']} from={FROM} wide>
        <State label="Default" wide>
          <Box>
            <ZoneBar seconds={ZONE_SECONDS} title="Time in zones, tempo run" />
          </Box>
        </State>
        <State label="Empty" wide>
          <Box>
            <ZoneBar seconds={[]} title="No zone data" />
          </Box>
        </State>
      </Specimen>

      <Specimen name="Heatmap" covers={['Heatmap']} from={FROM} wide note="Cells are buttons: arrow keys move between them, Enter opens one.">
        <State label="Default" wide>
          <Box>
            <Heatmap
              title="Weekly compliance by athlete"
              columns={weeks.map((w) => ({ key: `w${w}`, label: `W${w}` }))}
              rows={heatRows}
              legend={LEGEND}
              measure="Percent of planned Load"
              onCellActivate={() => {}}
            />
          </Box>
        </State>
        <State label="Empty" wide>
          <Box>
            <Heatmap title="No weeks yet" columns={[]} rows={[]} />
          </Box>
        </State>
      </Specimen>

      <Specimen name="Curve" covers={['Curve', 'fmtSpan']} from={FROM} wide>
        <State label="Default, against an earlier block" wide>
          <Box>
            <Curve
              points={POWER_CURVE}
              comparison={POWER_CURVE_BEFORE}
              title="Best Weighted power by duration"
              label="This block"
              comparisonLabel="Last block"
              formatValue={(v) => `${Math.round(v)} W`}
              formatAxis={fmtSpan}
            />
          </Box>
        </State>
        <State label="Empty" wide>
          <Box>
            <Curve points={[]} title="Best power, no rides yet" />
          </Box>
        </State>
      </Specimen>

      <Specimen name="TrackLap" covers={['TrackLap']} from={FROM} wide note="The athlete's week as a lap of the track: one lane per sport, the infield number is the share of the plan done.">
        <State label="Full">
          <TrackLap lap={lap} size="full" />
        </State>
        <State label="Compact">
          <TrackLap lap={lap} size="compact" />
        </State>
      </Specimen>

      <Specimen name="ChartFrame and Axis" covers={['ChartFrame', 'Axis']} from={FROM} wide note="The frame supplies the title, summary and data table that every chart above is built on. Axis draws ticks inside an svg.">
        <State label="Default" wide>
          <ChartFrame
            title="Long runs, last four weeks"
            summary="Longest run each week: 14, 16, 12 and 18 kilometres."
            table={{ columns: ['Week', 'Longest run (km)'], rows: [['W14', 14], ['W15', 16], ['W16', 12], ['W17', 18]] }}
          >
            <svg viewBox="0 0 240 70" width="100%" role="presentation">
              <g transform="translate(28 4)">
                <Axis orient="left" length={44} grid={190} ticks={[{ pos: 44, label: '0' }, { pos: 22, label: '10' }, { pos: 0, label: '20' }]} />
                <g transform="translate(0 44)">
                  <Axis orient="bottom" length={190} line ticks={[{ pos: 20, label: 'W14' }, { pos: 76, label: 'W15' }, { pos: 132, label: 'W16' }, { pos: 170, label: 'W17' }]} />
                </g>
              </g>
            </svg>
          </ChartFrame>
        </State>
        <State label="Loading" wide>
          <div aria-busy="true" style={{ display: 'grid', gap: 'var(--space-2)', inlineSize: '100%' }}>
            <Skeleton width="40%" />
            <Skeleton height="8rem" />
          </div>
        </State>
      </Specimen>

      <Helpers
        from={FROM}
        items={[
          ['useSize', 'Hook: the width of an element, so a chart can fill its box.'],
          ['MINUS', '− (true minus sign)'],
          ['DASH', '– (shown when a value is missing)'],
          ['fmtNumber', `fmtNumber(1234.5, 1) = ${fmtNumber(1234.5, 1)}`],
          ['fmtSigned', `fmtSigned(-4) = ${fmtSigned(-4)}`],
          ['fmtPercent', `fmtPercent(82) = ${fmtPercent(82)}`],
          ['fmtMinutes', `fmtMinutes(95) = ${fmtMinutes(95)}`],
          ['fmtDuration', `fmtDuration(3930) = ${fmtDuration(3930)}`],
          ['fmtMinutesWords', `fmtMinutesWords(95) = ${fmtMinutesWords(95)}`],
          ['fmtPace', `fmtPace(3.33, "run") = ${fmtPace(3.33, 'run')}`],
          ['fmtDistance', `fmtDistance(12000, "run") = ${fmtDistance(12000, 'run')}`],
          ['fmtDay', `fmtDay(today) = ${fmtDay(today)}`],
          ['finite', 'Returns a fallback for NaN or infinity.'],
          ['margin', 'Fills in a chart margin box.'],
          ['maxOf', 'Largest value, ignoring gaps.'],
          ['minOf', 'Smallest value, ignoring gaps.'],
          ['linear', 'A linear scale from a domain to a pixel range.'],
          ['at', 'Reads a scale, safe for missing values.'],
          ['band', 'A band scale for bars.'],
          ['niceTicks', `niceTicks(0, 87) = ${niceTicks(0, 87).join(', ')}`],
          ['niceMax', `niceMax(87) = ${niceMax(87)}`],
          ['thin', 'Keeps at most N items, evenly spaced.'],
        ]}
      />
    </Group>
  )
}
