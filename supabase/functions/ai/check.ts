// The checks the ai function makes on a provider's address and on its answer. Pure: no network,
// no Deno APIs, so the app's test runner covers them (check.test.ts).

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', 'host.docker.internal'])

/**
 * A provider gets its key and the draft only over HTTPS. The one exception is a mock on this
 * machine during local development, and only when AI_ALLOW_LOCAL_HTTP=1 says so.
 */
export function safeBaseUrl(baseUrl: string, allowLocalHttp: boolean): boolean {
  let url: URL
  try {
    url = new URL(baseUrl)
  } catch {
    return false
  }
  if (url.protocol === 'https:') return true
  return url.protocol === 'http:' && allowLocalHttp && LOCAL_HOSTS.has(url.hostname)
}

/** Units a summary may use, each under one name, so "7 h" and "7 hours" are the same fact. */
const UNITS: Record<string, string> = {
  '%': '%', percent: '%',
  km: 'km', kilometre: 'km', kilometres: 'km', kilometer: 'km', kilometers: 'km',
  m: 'm', metre: 'm', metres: 'm', meter: 'm', meters: 'm',
  h: 'h', hr: 'h', hrs: 'h', hour: 'h', hours: 'h',
  min: 'min', mins: 'min', minute: 'min', minutes: 'min',
  s: 's', sec: 's', secs: 's', second: 's', seconds: 's',
  bpm: 'bpm', beats: 'bpm', ms: 'ms', millisecond: 'ms', milliseconds: 'ms',
  w: 'w', watt: 'w', watts: 'w', kg: 'kg', kcal: 'kcal', rpm: 'rpm', tss: 'tss',
  session: 'session', sessions: 'session', day: 'day', days: 'day', week: 'week', weeks: 'week',
}

/**
 * Words that say what a number measures, or which way it went, each under one name: "Resting HR"
 * and "maximum heart rate" read differently even when the number and the unit are the same.
 */
const DESCRIBES: Record<string, string> = {}
for (const [name, words] of [
  ['resting', 'resting rest'],
  ['maximum', 'maximum max maximal peak highest top'],
  ['minimum', 'minimum lowest minimal'],
  ['average', 'average avg mean typical'],
  ['total', 'total overall'],
  ['baseline', 'baseline usual normal'],
  ['heart', 'heart hr pulse'],
  ['hrv', 'hrv variability'],
  ['sleep', 'sleep slept sleeping'],
  ['soreness', 'soreness sore'],
  ['mood', 'mood'],
  ['load', 'load'],
  ['fitness', 'fitness'],
  ['form', 'form'],
  ['distance', 'distance'],
  ['pace', 'pace'],
  ['power', 'power ftp'],
  ['threshold', 'threshold'],
  ['run', 'run runs ran running'],
  ['ride', 'ride rides rode riding bike biked biking cycling cycled'],
  ['swim', 'swim swims swam swimming'],
  ['planned', 'planned plan'],
  ['done', 'completed done logged actual'],
  ['missed', 'missed skipped'],
  ['key', 'key'],
  ['up', 'up higher more above increase increased increasing rose risen rising gained'],
  ['down', 'down lower less below decrease decreased decreasing fell fallen falling dropped drop'],
  ['not', 'not no never without none nothing wasn isn didn doesn don aren weren hasn haven'],
  ['last', 'last previous'],
  ['next', 'next coming'],
  ['monday', 'monday'],
  ['tuesday', 'tuesday'],
  ['wednesday', 'wednesday'],
  ['thursday', 'thursday'],
  ['friday', 'friday'],
  ['saturday', 'saturday'],
  ['sunday', 'sunday'],
] as const) {
  for (const w of words.split(' ')) DESCRIBES[w] = name
}

const TOKEN = /(?:(?<![\p{L}\p{N}])([-\u2212+]))?(\d+(?:[.,:]\d+)*)\s*(%|\p{L}+)?|(\p{L}+)/gu

/**
 * A text's facts and describing words, in order: each number with its sign and the unit that
 * follows it ("12|km", "-12|%"), or alone ("3|") when no unit does, and each describing word by
 * its name ("resting"). A time such as 5:30 is one number. A minus counts as a sign only at the
 * start of a number, not inside a range such as 10-12.
 */
export function marks(text: string): string[] {
  const out: string[] = []
  for (const m of text.matchAll(TOKEN)) {
    const word = (m[4] ?? m[3])?.toLowerCase()
    if (m[4] === undefined) {
      const sign = m[1] === '-' || m[1] === '\u2212' ? '-' : ''
      const unit = m[3] ? (UNITS[m[3].toLowerCase()] ?? '') : ''
      out.push(`${sign}${(m[2] as string).replace(',', '.')}|${unit}`)
      // A word after a number that is not its unit can still say what the number is: "3 runs".
      if (unit) continue
    }
    const named = word === undefined ? undefined : DESCRIBES[word]
    if (named) out.push(named)
  }
  return out
}

const isFact = (mark: string): boolean => mark.includes('|')

/** The measured facts in a text, in order: the numbers of `marks`. */
export function facts(text: string): string[] {
  return marks(text).filter(isFact)
}

const sameItems = (a: readonly string[], b: readonly string[]): boolean => {
  const x = a.toSorted()
  const y = b.toSorted()
  return x.length === y.length && x.every((v, i) => v === y[i])
}

/** Two different values of the same kind in one line: which is which cannot be checked from the numbers. */
function ambiguous(lineFacts: readonly string[]): boolean {
  const byUnit = new Map<string, string>()
  for (const f of lineFacts) {
    const unit = f.slice(f.indexOf('|'))
    const seen = byUnit.get(unit)
    if (seen !== undefined && seen !== f) return true
    byUnit.set(unit, f)
  }
  return false
}

/**
 * May `to` stand in for `from`? It must state exactly the same facts: every number with its sign
 * and unit, none added, none dropped. It must keep the words that say what the numbers measure
 * (`DESCRIBES`), so "resting heart rate 60 bpm" cannot become "maximum heart rate 60 bpm". Where
 * a line holds two different values of the same kind ("resting 60 bpm, maximum 180 bpm"), a
 * rewording could swap them unseen, so that line must come back word for word. Where it holds
 * several different values and several describing words, which word goes with which number is
 * known only from their order, so that order must stay. Whatever cannot be verified is refused.
 */
export function sameFacts(from: string, to: string): boolean {
  const a = marks(from)
  const b = marks(to)
  const fa = a.filter(isFact)
  if (!sameItems(fa, b.filter(isFact))) return false
  if (ambiguous(fa)) return from.trim() === to.trim()
  const words = a.filter((m) => !isFact(m))
  if (!sameItems(words, b.filter((m) => !isFact(m)))) return false
  return new Set(fa).size < 2 || words.length < 2 || a.join(' ') === b.join(' ')
}

/**
 * The model may reword, never invent, drop or swap. Its answer must have the draft's shape, line
 * for line, and each line must state the same facts as the draft's line at that position. So a
 * number cannot move to another line, and "60 km" is refused when the draft says "12 km" and
 * "60 minutes". Anything that cannot be verified is refused: the rule-based draft then stays.
 */
export function checkOutput(raw: string, draft: { headline: string; lines: string[] }): { headline: string; lines: string[] } | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw.replace(/^```(?:json)?\s*|\s*```$/g, ''))
  } catch {
    return null
  }
  if (typeof parsed !== 'object' || parsed === null) return null
  const o = parsed as { headline?: unknown; lines?: unknown }
  if (typeof o.headline !== 'string' || o.headline.length === 0 || o.headline.length > 120) return null
  if (!Array.isArray(o.lines) || o.lines.length !== draft.lines.length) return null
  if (!o.lines.every((l) => typeof l === 'string' && l.length > 0 && l.length <= 240)) return null
  const lines = o.lines as string[]
  if (!sameFacts(draft.headline, o.headline)) return null
  if (!draft.lines.every((line, i) => sameFacts(line, lines[i] as string))) return null
  return { headline: o.headline, lines }
}
