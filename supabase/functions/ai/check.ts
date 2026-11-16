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
 * The measured facts in a text: each number with its sign and the unit that follows it
 * ("12|km", "-12|%"), or alone ("3|") when no unit does. A time such as 5:30 is one number.
 * A minus counts as a sign only at the start of a number, not inside a range such as 10-12.
 */
export function facts(text: string): string[] {
  const out: string[] = []
  for (const m of text.matchAll(/(?:(?<![\p{L}\p{N}])([-\u2212+]))?(\d+(?:[.,:]\d+)*)\s*(%|\p{L}+)?/gu)) {
    const sign = m[1] === '-' || m[1] === '\u2212' ? '-' : ''
    const unit = m[3] ? (UNITS[m[3].toLowerCase()] ?? '') : ''
    out.push(`${sign}${(m[2] as string).replace(',', '.')}|${unit}`)
  }
  return out
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
 * and unit, none added, none dropped. Where a line holds two different values of the same kind
 * ("resting 60 bpm, maximum 180 bpm"), a rewording could swap them unseen, so that line must come
 * back word for word.
 */
export function sameFacts(from: string, to: string): boolean {
  const a = facts(from).sort()
  const b = facts(to).sort()
  if (a.length !== b.length || a.some((f, i) => f !== b[i])) return false
  return !ambiguous(a) || from.trim() === to.trim()
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
