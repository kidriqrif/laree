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
 * The measured facts in a text: each number with the unit that follows it ("12|km", "60|min"),
 * or alone ("3|") when no unit does. A time such as 5:30 is one number.
 */
export function facts(text: string): string[] {
  const out: string[] = []
  for (const m of text.matchAll(/(\d+(?:[.,:]\d+)*)\s*(%|\p{L}+)?/gu)) {
    const unit = m[2] ? (UNITS[m[2].toLowerCase()] ?? '') : ''
    out.push(`${(m[1] as string).replace(',', '.')}|${unit}`)
  }
  return out
}

/**
 * The model may reword, never invent or swap: every number it writes must be in the draft with
 * the same unit. "60 km" is refused when the draft says "12 km" and "60 minutes".
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
  if (!Array.isArray(o.lines) || o.lines.length < 1 || o.lines.length > 4) return null
  if (!o.lines.every((l) => typeof l === 'string' && l.length > 0 && l.length <= 240)) return null
  const allowed = new Set(facts([draft.headline, ...draft.lines].join(' \n ')))
  const written = facts([o.headline, ...(o.lines as string[])].join(' \n '))
  if (written.some((f) => !allowed.has(f))) return null
  return { headline: o.headline, lines: o.lines as string[] }
}
