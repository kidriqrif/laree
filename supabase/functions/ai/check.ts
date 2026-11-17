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
 * Words a rewording may add although the draft does not have them: grammar, and nothing that says
 * what a number is, how it changed or what it means. Any other new word is refused, so a
 * relationship the check cannot read never slips in: a bound or estimate ("over", "about"), a
 * time ("this week", "before"), advice ("should"), a cause ("so"), a judgement ("great", "only").
 */
const NEUTRAL = new Set(
  (
    'a an the this that these those ' +
    'you your yours yourself it its they them their he she his her we our us i my me athlete athletes ' +
    'is was were are be been being am has have had having do does did ' +
    'of in on at by for from to into with ' +
    'and or as also too there here ' +
    'rate reading readings level value values number ' +
    's t d ll re ve m'
  ).split(' '),
)

/** A word and its plural or past form count as one: "session", "sessions"; "mark", "marked". */
const stem = (word: string): string => (word.length > 4 ? word.replace(/(?:ing|ed|es|s)$/, '') : word)

/**
 * The words of a text, lower case, without the units that follow a number: those are checked
 * with their number. A unit word on its own ("this week") is a word like any other.
 */
function wordsOf(text: string): string[] {
  const out: string[] = []
  for (const m of text.toLowerCase().matchAll(TOKEN)) {
    if (m[4] !== undefined) out.push(m[4])
    else if (m[3] && UNITS[m[3]] === undefined && m[3] !== '%') out.push(m[3])
  }
  return out
}

/**
 * Do `from` and `to` use the same words, grammar aside? `to` may add only neutral words, and must
 * keep every other word of `from`: a name ("Boston"), a session or a "missed" cannot be dropped.
 * A word counts as kept in another form of it ("sessions", "session") or as a word of the same
 * describing group ("rest" for "resting", "HR" for "heart").
 */
function sameWords(from: string, to: string): boolean {
  const covers = (text: string) => {
    const words = wordsOf(text)
    const stems = new Set(words.map(stem))
    const groups = new Set(words.map((w) => DESCRIBES[w]).filter(Boolean))
    return (w: string) => {
      const group = DESCRIBES[w]
      return stems.has(stem(w)) || (group !== undefined && groups.has(group))
    }
  }
  const inFrom = covers(from)
  const inTo = covers(to)
  const added = wordsOf(to).every((w) => NEUTRAL.has(w) || inFrom(w))
  const kept = wordsOf(from).every((w) => NEUTRAL.has(w) || inTo(w))
  return added && kept
}

/**
 * The describing words between the numbers, stretch by stretch: before the first number, between
 * each pair, after the last.
 */
function stretches(marked: readonly string[]): string[][] {
  const out: string[][] = [[]]
  for (const m of marked) {
    if (isFact(m)) out.push([])
    else out[out.length - 1]?.push(m)
  }
  return out
}

/** The text between each pair of numbers, as written, in lower case with spaces evened out. */
function betweenNumbers(text: string): string[] {
  const out: string[] = []
  let end = -1
  for (const m of text.matchAll(TOKEN)) {
    if (m[4] !== undefined) continue
    const start = m.index ?? 0
    if (end >= 0) out.push(text.slice(end, start).toLowerCase().replace(/\s+/g, ' ').trim())
    end = start + m[0].length
  }
  return out
}

/**
 * May `to` stand in for `from`? It must state exactly the same facts: every number with its sign
 * and unit, none added, none dropped. It may use only the draft's own words and neutral ones
 * (`NEUTRAL`), must keep every other word of the draft, and must keep the words that say what the
 * numbers measure (`DESCRIBES`), so
 * "resting heart rate 60 bpm" cannot become "maximum heart rate 60 bpm" nor "resting HR exceeded
 * 60 bpm". Where a line holds two different values of the same kind ("resting 60 bpm, maximum 180
 * bpm"), a rewording could swap them unseen, so that line must come back word for word. Which
 * describing word goes with which number is known only from where it stands, so the numbers keep
 * their order and each word its stretch. Words between two numbers could go with either, so the
 * text between them must stay exactly as it is. Whatever cannot be verified is refused.
 */
export function sameFacts(from: string, to: string): boolean {
  const a = marks(from)
  const b = marks(to)
  const fa = a.filter(isFact)
  const fb = b.filter(isFact)
  if (!sameItems(fa, fb)) return false
  if (ambiguous(fa)) return from.trim() === to.trim()
  if (!sameWords(from, to)) return false
  const words = a.filter((m) => !isFact(m))
  if (!sameItems(words, b.filter((m) => !isFact(m)))) return false
  if (words.length < 2 || fa.length === 0) return true
  if (fa.some((f, i) => f !== fb[i])) return false
  const sa = stretches(a)
  const sb = stretches(b)
  const last = sa.length - 1
  if (!sa.every((part, i) => sameItems(part, sb[i] ?? []))) return false
  // A stretch between two numbers that holds describing words: its text stays as written.
  const ra = betweenNumbers(from)
  const rb = betweenNumbers(to)
  return sa.every((part, i) => i === 0 || i === last || part.length === 0 || ra[i - 1] === rb[i - 1])
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
