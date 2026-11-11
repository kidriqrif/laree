import { seededStream } from '../../../data/seed/index.ts'
import { buildCurve, POWER_WINDOWS_S, RUN_DISTANCES_M } from '../../../domain/metrics/curves.ts'
import type { ActivityBests } from '../../../domain/metrics/curves.ts'
import type { LoadThresholds } from '../../../domain/metrics/load.ts'
import { streamDigest } from '../../../domain/metrics/streamDigest.ts'
import { collapseToThreeZones, polarisationIndex } from '../../../domain/metrics/zones.ts'
import type { PolarisationResult } from '../../../domain/metrics/zones.ts'
import type { Activity, DayOffset, StreamDigest } from '../../../domain/types.ts'

/** What the analytics page needs from one activity's detailed stream. Worked out once, then reused. */
export interface ActivityDigest extends StreamDigest {
  id: string
  day: DayOffset
  startMinute: number
  sport: Activity['sport']
  durationS: number
}

interface CacheEntry {
  digest: ActivityDigest
  source: Activity['source']
  /** The stored digest the entry was built from, compared by reference. */
  stored: StreamDigest | undefined
}

/** One entry per activity id and threshold set. A hit is used only while the activity still matches it. */
const cache = new Map<string, CacheEntry>()

const NO_STREAM: StreamDigest = { zones: null, power: null, run: null }

/** True when the cached digest was built from this same activity, not an older log under the same id. */
function fresh(e: CacheEntry, a: Activity): boolean {
  const d = e.digest
  return (
    e.source === a.source &&
    e.stored === a.streamDigest &&
    d.day === a.day &&
    d.startMinute === a.startMinute &&
    d.sport === a.sport &&
    d.durationS === a.summary.durationS
  )
}

export function digestOf(a: Activity, th: LoadThresholds): ActivityDigest {
  const key = `${a.id}|${th.ftp ?? ''}|${th.thresholdPaceSPerKm ?? ''}|${th.cssSPer100m ?? ''}|${th.lthr ?? ''}`
  const hit = cache.get(key)
  if (hit && fresh(hit, a)) return hit.digest
  // Seeded activities make their stream on demand. An imported file keeps the digest it was given on import.
  const stream = seededStream(a)
  const detail = stream ? streamDigest(a.sport, stream, th) : (a.streamDigest ?? NO_STREAM)
  const digest: ActivityDigest = {
    id: a.id,
    day: a.day,
    startMinute: a.startMinute,
    sport: a.sport,
    durationS: a.summary.durationS,
    zones: detail.zones,
    power: detail.power,
    run: detail.run,
  }
  cache.set(key, { digest, source: a.source, stored: a.streamDigest })
  return digest
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
