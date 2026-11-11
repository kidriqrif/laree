import { Link } from 'react-router'
import { useViewer } from '../../../app/viewer.ts'
import { currentDay, earnedAwards, selectFitnessSeries, selectProgress, selectWeek } from '../../../data/selectors.ts'
import { useLaree } from '../../../data/store.ts'
import { BADGE_KEYS } from '../../../domain/gamification.ts'
import type { BadgeKey } from '../../../domain/gamification.ts'
import { weekOfDay } from '../../../domain/time.ts'
import { Bars, Sparkline, fmtDay, fmtNumber } from '../../../charts/index.ts'
import type { BarDatum } from '../../../charts/index.ts'
import { BibCard, Card, Chip, EmptyState } from '../../../ui/core/index.ts'
import { ChartBoundary } from './ChartBoundary.tsx'
import {
  BADGES,
  FITNESS_EXPLAINER,
  badgeFace,
  badgeLine,
  countdownRace,
  countdownText,
  countdownWeeks,
  formSentence,
  streakHeadline,
  streakSoFar,
  trendSentence,
} from './copy.ts'
import styles from './ProgressPage.module.css'

const WINDOW_WEEKS = 16
const hoursText = (n: number) => `${fmtNumber(n, 1)} h`

const STATUS_TEXT = {
  counted: 'Counted towards your streak',
  below: 'Below 80%',
  excused: 'Excused by Coach. Your streak waited.',
  noPlan: 'No plan. Your streak waited.',
} as const

export default function ProgressPage() {
  const athleteId = useViewer((s) => s.athleteId)
  const data = useLaree((s) => s.data)
  const today = currentDay()
  const week = weekOfDay(today)

  const progress = selectProgress(data, athleteId, today)
  const series = selectFitnessSeries(data, athleteId, today)
  const awards = earnedAwards(data, athleteId, today).toSorted((a, b) => b.earnedDay - a.earnedDay)
  const races = data.races.filter((r) => r.athleteId === athleteId && r.day >= today).toSorted((a, b) => a.day - b.day)
  const hero = countdownRace(races, today)
  const others = races.filter((r) => r.id !== hero?.id)

  // Fitness over the last 16 weeks, completed days only.
  const startDay = Math.max(0, today - WINDOW_WEEKS * 7)
  const past = series.filter((p) => p.day >= startDay && p.day <= today)
  const first = past[0]
  const last = past.at(-1)
  const weeksSpan = Math.max(1, Math.round((today - startDay) / 7))
  const raceDayPoint = hero ? series.find((p) => p.day === hero.day) : undefined

  // Volume: hours done against the hours target, last 16 weeks.
  const firstWeek = Math.max(1, week - WINDOW_WEEKS + 1)
  const volume = (() => {
    const out: BarDatum[] = []
    for (let w = firstWeek; w <= week; w++) {
      const s = selectWeek(data, athleteId, w, today)
      out.push({
        key: `w${w}`,
        label: fmtDay(s.firstDay),
        value: s.doneDurationS / 3600,
        target: s.target ? s.target.hoursTarget : s.plannedDurationS > 0 ? s.plannedDurationS / 3600 : null,
      })
    }
    return out
  })()
  const recent = volume.slice(-5, -1)
  const recentDone = recent.reduce((t, b) => t + b.value, 0)
  const recentTarget = recent.reduce((t, b) => t + (b.target ?? 0), 0)

  const earnedKeys = new Set<BadgeKey>(awards.map((a) => a.key))
  const locked = BADGE_KEYS.filter((k) => !earnedKeys.has(k))
  const activityIds = new Set(data.activities.filter((a) => a.athleteId === athleteId).map((a) => a.id))
  const streak = progress.streak
  const soFar = streakSoFar(streak)
  const weeksText = hero ? countdownWeeks(hero, today) : null

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Progress</h1>

      {hero ? (
        <section className={styles.section} aria-labelledby="pr-race">
          <h2 id="pr-race" className={styles.heading}>Race</h2>
          <Card className={styles.race}>
            <p className={styles.countdown} data-testid="countdown">{countdownText(hero, today)}</p>
            <p className={styles.muted}>
              {fmtDay(hero.day)}, priority <Chip>{hero.priority}</Chip>
              {weeksText ? ` · ${weeksText}` : ''}
            </p>
            {others.length > 0 ? (
              <ul className={styles.races} aria-label="Other races">
                {others.map((r) => (
                  <li key={r.id}>
                    {r.name}, {fmtDay(r.day)}, priority {r.priority}
                  </li>
                ))}
              </ul>
            ) : null}
          </Card>
        </section>
      ) : null}

      <section className={styles.section} aria-labelledby="pr-fit">
        <h2 id="pr-fit" className={styles.heading}>Fitness</h2>
        <Card>
          {first && last ? (
            <>
              <p className={styles.sentence} data-testid="trend">{trendSentence(last.fitness, first.fitness, weeksSpan)}</p>
              <p className={styles.muted}>{FITNESS_EXPLAINER}</p>
              <ChartBoundary name="Fitness">
                <div className={styles.spark}>
                  <Sparkline
                    values={past.map((p) => p.fitness)}
                    label={`Fitness, last ${weeksSpan} weeks`}
                    height={72}
                    color="var(--series-fitness)"
                  />
                </div>
              </ChartBoundary>
              {today < 42 ? <p className={styles.muted}>Fitness takes about six weeks to settle, so read this loosely for now.</p> : null}
              {hero && raceDayPoint ? (
                <p className={styles.muted}>
                  If the plan goes as written, Fitness reaches {fmtNumber(raceDayPoint.fitness)} by race day.
                </p>
              ) : null}
              {progress.form ? <p className={styles.muted}>{formSentence(progress.form.form)}</p> : null}
            </>
          ) : (
            <p className={styles.muted}>There is no Fitness to show yet. Log a session and it will start to build.</p>
          )}
        </Card>
      </section>

      <section className={styles.section} aria-labelledby="pr-vol">
        <h2 id="pr-vol" className={styles.heading}>Volume</h2>
        <Card>
          {volume.some((b) => b.value > 0 || (b.target ?? 0) > 0) ? (
            <>
              <p className={styles.sentence}>
                Last {recent.length} finished weeks: {hoursText(recentDone)} done, {hoursText(recentTarget)} planned.
              </p>
              <ChartBoundary name="volume">
                <Bars data={volume} title="Weekly hours against target" measure="Hours" valueHeading="Hours" formatValue={hoursText} height={180} />
              </ChartBoundary>
              <Link className={styles.link} to="/athlete/week">Open this week</Link>
            </>
          ) : (
            <p className={styles.muted}>No weeks to show yet.</p>
          )}
        </Card>
      </section>

      <section className={styles.section} aria-labelledby="pr-streak">
        <h2 id="pr-streak" className={styles.heading}>Streak</h2>
        <Card>
          <p className={styles.sentence} data-testid="streak">{streakHeadline(streak)}</p>
          <p className={styles.muted}>Best: {streak.best} {streak.best === 1 ? 'week' : 'weeks'}</p>
          {soFar ? <p className={styles.muted}>{soFar}</p> : null}
          <ol className={styles.weeks} aria-label="Weeks so far">
            {streak.weeks.map((w) => (
              <li key={w.week} className={styles.wk} data-status={w.status}>
                <span className="sr-only">
                  Week {w.week}: {w.status === 'below' && w.wc !== null ? `${Math.round(w.wc)}% this week` : STATUS_TEXT[w.status]}
                </span>
              </li>
            ))}
          </ol>
          <p className={styles.muted}>Filled is a week that counted. An open box is a week under 80%. A dashed box paused the streak.</p>
        </Card>
      </section>

      <section className={styles.section} aria-labelledby="pr-badges">
        <h2 id="pr-badges" className={styles.heading}>Badges</h2>
        {awards.length === 0 ? (
          <EmptyState title="No badges yet" description="Badges come from real milestones, like your first 100 km week." />
        ) : (
          <ul className={styles.shelf} aria-label="Earned badges">
            {awards.map((a) => {
              const info = BADGES[a.key]
              return (
                <li key={a.id} className={styles.badge} data-badge={a.key}>
                  <div className={styles.tapeWrap}>
                    <BibCard
                      as="div"
                      figure={badgeFace(a, data.races)}
                      caption={info.name}
                      stub={<span>{fmtDay(a.earnedDay)}</span>}
                    />
                    <span className={styles.tape} aria-hidden="true">
                      <span className={styles.tapeL} />
                      <span className={styles.tapeR} />
                    </span>
                  </div>
                  <p className={styles.line}>{badgeLine(a)}</p>
                  {activityIds.has(a.sourceItemId) ? (
                    <Link className={styles.link} to={`/athlete/activity/${a.sourceItemId}`}>Open the activity</Link>
                  ) : null}
                </li>
              )
            })}
          </ul>
        )}
        {locked.length > 0 ? (
          <Card className={styles.locked}>
            <h3 className={styles.sub}>Still to earn</h3>
            <ul aria-label="Badges not yet earned">
              {locked.map((k) => (
                <li key={k} data-locked={k}>
                  <strong>{BADGES[k].name}</strong>
                  <span className={styles.muted}>{BADGES[k].how}</span>
                </li>
              ))}
            </ul>
          </Card>
        ) : null}
      </section>
    </div>
  )
}
