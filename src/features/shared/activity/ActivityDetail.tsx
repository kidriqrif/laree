import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { ATHLETES } from '../../../app/people.ts'
import { useViewer } from '../../../app/viewer.ts'
import { fmtDistance, fmtDuration, fmtNumber, fmtPace, Sparkline, ZoneBar } from '../../../charts/index.ts'
import { selectActivityCoachNote, selectKudosForActivity } from '../../../data/selectors.ts'
import { streamFor } from '../../../data/seed/index.ts'
import type { ActivityStream } from '../../../data/seed/index.ts'
import { thresholdsOn } from '../../../data/seed/people.ts'
import { useLaree } from '../../../data/store.ts'
import { sessionCompliance } from '../../../domain/metrics/compliance.ts'
import { timeInZones } from '../../../domain/metrics/zones.ts'
import type { Activity, ComplianceBand } from '../../../domain/types.ts'
import type { LoadThresholds } from '../../../domain/metrics/load.ts'
import { Button, Card, EmptyState, SportMark, StatusChip } from '../../../ui/core/index.ts'
import { Rating, TextField } from '../../../ui/form/index.ts'
import {
  BAND_LABELS,
  CONFIDENCE_LABEL,
  fmtClock,
  fmtWeekdayDate,
  METHOD_LABEL,
  SOURCE_LABEL,
  statusOf,
} from './format.ts'
import styles from './ActivityDetail.module.css'

export interface ActivityDetailProps {
  activityId: string
  viewer: 'athlete' | 'coach'
}

const RPE_NAMES = ['Very easy', 'Easy', 'Easy', 'Moderate', 'Moderate', 'Hard', 'Hard', 'Very hard', 'Very hard', 'Maximal']

function sampled(values: readonly number[] | undefined, points = 120): number[] | null {
  if (!values || values.length === 0) return null
  const size = Math.max(1, Math.ceil(values.length / points))
  const out: number[] = []
  for (let i = 0; i < values.length; i += size) {
    const chunk = values.slice(i, i + size)
    out.push(chunk.reduce((a, b) => a + b, 0) / chunk.length)
  }
  return out
}

/** Seconds in zones 1 to 5 from the stream, by the best system the athlete has a threshold for. */
function zoneSeconds(a: Activity, stream: ActivityStream, th: LoadThresholds): number[] | null {
  let secs: number[] | null = null
  if (a.sport === 'bike' && stream.powerW && th.ftp) secs = timeInZones('power', stream.powerW, th.ftp)
  else if (a.sport === 'run' && stream.speedMps && th.thresholdPaceSPerKm)
    secs = timeInZones('runPace', stream.speedMps, 1000 / th.thresholdPaceSPerKm)
  else if (a.sport === 'swim' && stream.speedMps && th.cssSPer100m)
    secs = timeInZones('swim', stream.speedMps, 100 / th.cssSPer100m)
  else if (th.lthr) secs = timeInZones('heartRate', stream.hrBpm, th.lthr)
  if (!secs) return null
  const five = secs.slice(0, 5)
  five[4] = (five[4] ?? 0) + secs.slice(5).reduce((x, y) => x + y, 0)
  return five
}

interface Row {
  label: string
  value: string
}

function metricRows(a: Activity): Row[] {
  const s = a.summary
  const rows: (Row | null)[] = [
    { label: 'Duration', value: fmtDuration(s.durationS) },
    s.movingTimeS !== s.durationS ? { label: 'Moving time', value: fmtDuration(s.movingTimeS) } : null,
    s.distanceM !== undefined ? { label: 'Distance', value: fmtDistance(s.distanceM, a.sport) } : null,
    s.elevationGainM !== undefined ? { label: 'Elevation gain', value: `${fmtNumber(s.elevationGainM)} m` } : null,
    s.avgSpeedMps !== undefined
      ? { label: a.sport === 'bike' ? 'Average speed' : 'Average pace', value: fmtPace(s.avgSpeedMps, a.sport) }
      : null,
    s.avgHr !== undefined ? { label: 'Average heart rate', value: `${fmtNumber(s.avgHr)} bpm` } : null,
    s.maxHr !== undefined ? { label: 'Maximum heart rate', value: `${fmtNumber(s.maxHr)} bpm` } : null,
    s.avgPowerW !== undefined ? { label: 'Average power', value: `${fmtNumber(s.avgPowerW)} W` } : null,
    s.weightedPowerW !== undefined ? { label: 'Weighted power', value: `${fmtNumber(s.weightedPowerW)} W` } : null,
    s.intensity !== undefined ? { label: 'Intensity', value: fmtNumber(s.intensity, 2) } : null,
    s.cadence !== undefined
      ? { label: 'Cadence', value: `${fmtNumber(s.cadence)} ${a.sport === 'run' ? 'spm' : 'rpm'}` }
      : null,
  ]
  return rows.filter((r): r is Row => r !== null)
}

function bigRows(a: Activity): Row[] {
  const s = a.summary
  const out: Row[] = [{ label: 'Duration', value: fmtDuration(s.durationS) }]
  if (s.distanceM !== undefined) out.push({ label: 'Distance', value: fmtDistance(s.distanceM, a.sport) })
  if (s.avgSpeedMps !== undefined && a.sport !== 'bike')
    out.push({ label: 'Average pace', value: fmtPace(s.avgSpeedMps, a.sport) })
  else if (s.avgPowerW !== undefined) out.push({ label: 'Average power', value: `${fmtNumber(s.avgPowerW)} W` })
  else if (s.avgSpeedMps !== undefined) out.push({ label: 'Average speed', value: fmtPace(s.avgSpeedMps, a.sport) })
  if (s.avgHr !== undefined) out.push({ label: 'Average heart rate', value: `${fmtNumber(s.avgHr)} bpm` })
  return out.slice(0, 4)
}

function EffortNotes({ activity, editable }: { activity: Activity; editable: boolean }) {
  const logActivity = useLaree((s) => s.logActivity)
  const [editing, setEditing] = useState(false)
  const [rpe, setRpe] = useState<number | null>(activity.rpe ?? null)
  const [notes, setNotes] = useState(activity.notes ?? '')
  const has = activity.rpe !== undefined || Boolean(activity.notes)

  const save = () => {
    const next: Activity = { ...activity }
    if (rpe !== null) next.rpe = rpe
    else delete next.rpe
    const trimmed = notes.trim()
    if (trimmed) next.notes = trimmed
    else delete next.notes
    logActivity(next)
    setEditing(false)
  }

  return (
    <section aria-labelledby="effort-h" className={styles.section}>
      <h2 id="effort-h" className={styles.h2}>
        Effort and notes
      </h2>
      {editing && editable ? (
        <form
          className={styles.form}
          onSubmit={(e) => {
            e.preventDefault()
            save()
          }}
        >
          <Rating label="Session effort" max={10} value={rpe} onChange={setRpe} valueNames={RPE_NAMES} showEnds />
          <TextField label="Notes" value={notes} onChange={setNotes} />
          <div className={styles.row}>
            <Button type="submit" variant="primary">
              Save
            </Button>
            <Button variant="quiet" onPress={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <>
          {has ? (
            <>
              {activity.rpe !== undefined ? (
                <p className={styles.line}>
                  Effort {activity.rpe} of 10, {RPE_NAMES[activity.rpe - 1]?.toLowerCase()}
                </p>
              ) : null}
              {activity.notes ? <p className={styles.line}>{activity.notes}</p> : null}
            </>
          ) : (
            <p className={styles.muted}>{editable ? 'No effort or notes yet.' : 'The athlete has not added effort or notes.'}</p>
          )}
          {editable ? (
            <Button variant={has ? 'quiet' : 'primary'} onPress={() => setEditing(true)}>
              {has ? 'Edit effort and notes' : 'Add effort and notes'}
            </Button>
          ) : null}
        </>
      )}
    </section>
  )
}

function Charts({ activity, th }: { activity: Activity; th: LoadThresholds }) {
  const stream = useMemo(() => (activity.source === 'manual' ? null : streamFor(activity.id)), [activity.id, activity.source])
  if (!stream) {
    return (
      <p className={styles.muted}>
        {activity.source === 'manual'
          ? 'Quick logs have no detail data. Import the file to see charts.'
          : 'No detail data is stored for this activity.'}
      </p>
    )
  }
  const main = activity.sport === 'bike' && stream.powerW ? stream.powerW : stream.speedMps
  const mainSeries = sampled(main)
  const hr = sampled(stream.hrBpm)
  const zones = zoneSeconds(activity, stream, th)
  const power = activity.sport === 'bike' && stream.powerW
  return (
    <div className={styles.charts}>
      {mainSeries ? (
        <div>
          <h3 className={styles.h3}>{power ? 'Power' : activity.sport === 'bike' ? 'Speed' : 'Pace'}</h3>
          <Sparkline
            values={mainSeries}
            height={96}
            label={power ? 'Power over the session' : 'Pace over the session'}
            formatValue={(n) => (power ? `${fmtNumber(n)} W` : fmtPace(n, activity.sport))}
          />
        </div>
      ) : null}
      {hr ? (
        <div>
          <h3 className={styles.h3}>Heart rate</h3>
          <Sparkline values={hr} height={72} label="Heart rate over the session" formatValue={(n) => `${fmtNumber(n)} bpm`} />
        </div>
      ) : null}
      {zones ? <ZoneBar seconds={zones} title="Time in zones" /> : null}
    </div>
  )
}

/** The shared view of one activity, for the athlete (A8) and the coach (C17). */
export function ActivityDetail({ activityId, viewer }: ActivityDetailProps) {
  const viewerAthlete = useViewer((s) => s.athleteId)
  const data = useLaree((s) => s.data)
  const activity = data.activities.find((a) => a.id === activityId)
  if (!activity || (viewer === 'athlete' && activity.athleteId !== viewerAthlete)) {
    return (
      <EmptyState
        headingLevel={2}
        title="Activity not found"
        description="This activity is not in the log. It may have been removed."
        action={
          <Link to={viewer === 'coach' ? '/coach/overview' : '/athlete/today'} className={styles.link}>
            {viewer === 'coach' ? 'Go to Overview' : 'Go to Today'}
          </Link>
        }
      />
    )
  }

  const planned = activity.matchedWorkoutId ? data.planned.find((w) => w.id === activity.matchedWorkoutId) : undefined
  const compliance = planned ? sessionCompliance(planned, activity) : undefined
  const band: ComplianceBand = planned ? (activity.complianceBand ?? compliance?.band ?? 'onPlan') : 'unplanned'
  const bandText =
    planned && compliance && band !== 'unplanned'
      ? `${BAND_LABELS[band]}, ${compliance.shownPct}% of planned`
      : BAND_LABELS[band]
  const th = thresholdsOn(activity.athleteId, activity.day, data.thresholds)
  const kudos = selectKudosForActivity(data, activity.id)
  const coachNote = selectActivityCoachNote(data, activity.id)
  const athleteName = ATHLETES.find((p) => p.id === activity.athleteId)?.name ?? activity.athleteId
  const checkIn = data.checkIns.find((c) => c.athleteId === activity.athleteId && c.day === activity.day)
  const isCoach = viewer === 'coach'
  const sport = activity.sport === 'other' ? 'strength' : activity.sport
  const big = bigRows(activity)

  return (
    <article className={styles.page} aria-labelledby="activity-title">
      <header className={styles.head}>
        <p className={styles.meta}>
          <SportMark sport={sport} showLabel />
          <span>
            {fmtWeekdayDate(activity.day)}, {fmtClock(activity.startMinute)}
          </span>
          {isCoach ? <span>{athleteName}</span> : null}
        </p>
        <h1 id="activity-title" className={styles.title}>
          {activity.title}
        </h1>
        <p className={styles.band}>
          <StatusChip status={statusOf(band)} label={bandText} />
        </p>
        <p className={styles.load}>
          <span className={styles.loadFig}>Load {fmtNumber(activity.load.load)}</span>
          <span>
            {METHOD_LABEL[activity.load.method]}, {CONFIDENCE_LABEL[activity.load.confidence].toLowerCase()}
          </span>
        </p>
      </header>

      <dl className={styles.big}>
        {big.map((r) => (
          <div key={r.label}>
            <dt>{r.label}</dt>
            <dd>{r.value}</dd>
          </div>
        ))}
      </dl>

      {kudos.length > 0 ? (
        <Card as="section" aria-label="Kudos from Coach" className={styles.kudos}>
          <h2 className={styles.h2}>Kudos from Coach</h2>
          {kudos.map((k) => (
            <p key={k.id} className={styles.line}>
              {k.message ?? 'Nice work.'}
            </p>
          ))}
        </Card>
      ) : null}
      {coachNote ? (
        <Card as="section" aria-label="Coach's comment" className={styles.kudos}>
          <h2 className={styles.h2}>Coach&rsquo;s comment</h2>
          <p className={styles.line}>{coachNote}</p>
        </Card>
      ) : null}

      <section aria-labelledby="charts-h" className={styles.section}>
        <h2 id="charts-h" className={styles.h2}>
          Charts
        </h2>
        <Charts activity={activity} th={th} />
      </section>

      <EffortNotes key={`${activity.id}:${activity.rpe ?? ''}:${activity.notes ?? ''}`} activity={activity} editable={!isCoach} />

      {isCoach && checkIn ? (
        <section aria-labelledby="ci-h" className={styles.section}>
          <h2 id="ci-h" className={styles.h2}>
            That morning
          </h2>
          <p className={styles.line}>
            Slept {fmtNumber(checkIn.sleepHours, 1)} h, soreness {checkIn.soreness} of 5, mood {checkIn.mood} of 5.
            {checkIn.note ? ` ${checkIn.note}` : ''}
          </p>
        </section>
      ) : null}

      <section aria-labelledby="plan-h" className={styles.section}>
        <h2 id="plan-h" className={styles.h2}>
          Matched session
        </h2>
        {planned && compliance ? (
          <>
            <p className={styles.line}>
              {viewer === 'athlete' ? (
                <Link to={`/athlete/workout/${planned.id}`} className={styles.link}>
                  {planned.title}
                </Link>
              ) : (
                planned.title
              )}
            </p>
            <table className={styles.table}>
              <caption className="sr-only">Planned against done</caption>
              <thead>
                <tr>
                  <th scope="col">Measure</th>
                  <th scope="col">Planned</th>
                  <th scope="col">Done</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th scope="row">Duration</th>
                  <td>{fmtDuration(planned.plannedDurationS)}</td>
                  <td>{fmtDuration(activity.summary.durationS)}</td>
                </tr>
                {planned.plannedDistanceM !== undefined ? (
                  <tr>
                    <th scope="row">Distance</th>
                    <td>{fmtDistance(planned.plannedDistanceM, planned.sport)}</td>
                    <td>{fmtDistance(activity.summary.distanceM, activity.sport)}</td>
                  </tr>
                ) : null}
                <tr>
                  <th scope="row">Load</th>
                  <td>{fmtNumber(planned.plannedLoad)}</td>
                  <td>{fmtNumber(activity.load.load)}</td>
                </tr>
              </tbody>
            </table>
            {compliance.note ? <p className={styles.muted}>{compliance.note}.</p> : null}
          </>
        ) : (
          <p className={styles.muted}>Not matched to a planned session.</p>
        )}
      </section>

      <section aria-labelledby="nums-h" className={styles.section}>
        <h2 id="nums-h" className={styles.h2}>
          All numbers
        </h2>
        <table className={styles.table}>
          <caption className="sr-only">Activity numbers</caption>
          <tbody>
            {metricRows(activity).map((r) => (
              <tr key={r.label}>
                <th scope="row">{r.label}</th>
                <td>{r.value}</td>
              </tr>
            ))}
            <tr>
              <th scope="row">Source</th>
              <td>{SOURCE_LABEL[activity.source]}</td>
            </tr>
          </tbody>
        </table>
      </section>

      {(
        <div className={styles.share}>
          <Button variant="secondary" isDisabled aria-describedby="strava-why">
            Share to Strava
          </Button>
          <p id="strava-why" className={styles.muted}>
            Strava is outbound only: Laree can send to it but never reads from it, and this prototype does not connect to it.
          </p>
        </div>
      )}
    </article>
  )
}
