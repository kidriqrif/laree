import { streamFor } from '../../../data/seed/index.ts'
import type { ActivityStream } from '../../../data/seed/index.ts'
import {
  buildCurve,
  POWER_WINDOWS_S,
  RUN_DISTANCES_M,
  bestPowerCurve,
  bestRunCurve,
} from '../../../domain/metrics/curves.ts'
import type { ActivityBests } from '../../../domain/metrics/curves.ts'
import type { LoadThresholds } from '../../../domain/metrics/load.ts'
import {
  collapseToThreeZones,
  polarisationIndex,
  timeInZones,
} from '../../../domain/metrics/zones.ts'
import type { PolarisationResult } from '../../../domain/metrics/zones.ts'
import type { Activity, DayOffset } from '../../../domain/types.ts'

/** What the analytics page needs from one activity's detailed stream. Worked out once, then reused. */
export interface ActivityDigest {
  id: string
  day: DayOffset
  startMinute: number
  sport: Activity['sport']
  durationS: number
  /** Seconds in zones 1 to 5, or null when there is no stream or no threshold. */
  zones: number[] | null
  /** Best mean power per window in seconds, for rides with power. */
  power: Record<number, number | null> | null
  /** Best time in seconds per run distance key. */
  run: Record<string, number | null> | null
}

const cache = new Map<string, ActivityDigest>()

function fiveZones(a: Activity, stream: ActivityStream, th: LoadThresholds): number[] | null {
  let secs: number[] | null = null
  if (a.sport === 'bike' && stream.powerW && th.ftp) secs = timeInZones('power', stream.powerW, th.ftp)
  else if (a.sport === 'run' && stream.speedMps && th.thresholdPaceSPerKm)
    secs = timeInZones('runPace', stream.speedMps, 1000 / th.thresholdPaceSPerKm)
  else if (a.sport === 'swim' && stream.speedMps && th.cssSPer100m)
    secs = timeInZones('swim', stream.speedMps, 100 / th.cssSPer100m)
  else if (th.lthr) secs = timeInZones('heartRate', stream.hrBpm, th.lthr)
  if (!secs) return null
  const five = secs.slice(0, 5)
  while (five.length < 5) five.push(0)
  five[4] = (five[4] ?? 0) + secs.slice(5).reduce((x, y) => x + y, 0)
  return five
}

export function digestOf(a: Activity, th: LoadThresholds): ActivityDigest {
  const key = `${a.id}|${th.ftp ?? ''}|${th.thresholdPaceSPerKm ?? ''}|${th.cssSPer100m ?? ''}|${th.lthr ?? ''}`
  const hit = cache.get(key)
  if (hit) return hit
  const stream = a.source === 'manual' ? null : streamFor(a.id)
  const out: ActivityDigest = {
    id: a.id,
    day: a.day,
    startMinute: a.startMinute,
    sport: a.sport,
    durationS: a.summary.durationS,
    zones: stream ? fiveZones(a, stream, th) : null,
    power: stream && a.sport === 'bike' && stream.powerW ? bestPowerCurve(stream.powerW) : null,
    run:
      stream && a.sport === 'run' && stream.distanceM
        ? Object.fromEntries(
            Object.entries(bestRunCurve(stream.distanceM)).map(([k, v]) => [k, v ? v.timeS : null]),
          )
        : null,
  }
  cache.set(key, out)
  return out
}

export interface ZoneSummary {
  seconds: number[]
  zonedS: number
  totalS: number
  /** Share of zoned time in easy, middle and hard bands, as whole percentages. */
  shares: { easy: number; middle: number; hard: number }
  polarisation: PolarisationResult
}

/** Time in zones across the activities that fall in [firstDay, lastDay]. */
export function zoneSummary(digests: readonly ActivityDigest[], firstDay: DayOffset, lastDay: DayOffset): ZoneSummary {
  const seconds = [0, 0, 0, 0, 0]
  let totalS = 0
  for (const d of digests) {
    if (d.day < firstDay || d.day > lastDay) continue
    totalS += d.durationS
    d.zones?.forEach((s, i) => {
      seconds[i] = (seconds[i] ?? 0) + s
    })
  }
  const three = collapseToThreeZones(seconds)
  const zonedS = three.easy + three.middle + three.hard
  const pct = (n: number) => (zonedS > 0 ? Math.round((n / zonedS) * 100) : 0)
  return {
    seconds,
    zonedS,
    totalS,
    shares: { easy: pct(three.easy), middle: pct(three.middle), hard: pct(three.hard) },
    polarisation: polarisationIndex(three, totalS),
  }
}

export interface EffortPoint {
  seconds: number
  value: number
}

export interface EffortCurves {
  season: EffortPoint[]
  recent: EffortPoint[]
}

const RECENT_DAYS = 42

function curvePair(
  items: ActivityBests[],
  keys: readonly string[],
  direction: 'max' | 'min',
  today: DayOffset,
  toPoint: (key: string, value: number) => EffortPoint,
): EffortCurves {
  const toPoints = (rows: ActivityBests[]) => {
    const curve = buildCurve(rows, keys, direction, 'season', today, 0)
    return keys.flatMap((k) => {
      const p = curve[k]
      return p ? [toPoint(k, p.value)] : []
    })
  }
  return {
    season: toPoints(items),
    recent: toPoints(items.filter((i) => i.day > today - RECENT_DAYS)),
  }
}

/** Season-best and last-six-weeks power curves from rides with power. */
export function powerCurves(digests: readonly ActivityDigest[], today: DayOffset): EffortCurves {
  const items: ActivityBests[] = digests
    .filter((d) => d.power)
    .map((d) => ({
      activityId: d.id,
      day: d.day,
      startMinute: d.startMinute,
      values: Object.fromEntries(Object.entries(d.power ?? {}).map(([k, v]) => [k, v])),
    }))
  return curvePair(
    items,
    POWER_WINDOWS_S.map(String),
    'max',
    today,
    (k, v) => ({ seconds: Number(k), value: v }),
  )
}

/** Season-best and last-six-weeks pace curves (speed against time) from runs with a distance stream. */
export function paceCurves(digests: readonly ActivityDigest[], today: DayOffset): EffortCurves {
  const items: ActivityBests[] = digests
    .filter((d) => d.run)
    .map((d) => ({ activityId: d.id, day: d.day, startMinute: d.startMinute, values: d.run ?? {} }))
  return curvePair(items, Object.keys(RUN_DISTANCES_M), 'min', today, (k, timeS) => ({
    seconds: timeS,
    value: (RUN_DISTANCES_M as Record<string, number>)[k]! / timeS,
  }))
}
