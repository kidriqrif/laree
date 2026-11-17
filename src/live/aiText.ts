/**
 * Live AI text: the rule-based summary goes to the ai Edge Function, which has a model reword it.
 * Results are cached on the device by the draft's content, so a page visit does not call again.
 */
import type { AiCheckInOutput, AiRecapOutput } from '../ai/types.ts'
import { supabase } from './session.ts'

type TextOut = Extract<AiRecapOutput | AiCheckInOutput, { status: 'ok' }>

interface Polished {
  headline: string
  lines: string[]
  provider: string
  model: string
}

const CACHE_KEY = 'laree:live:ai'
/** Changes whenever any tab clears the cache. Tabs share it, so each sees the others' sign-outs. */
const EPOCH_KEY = 'laree:live:ai:epoch'
const CACHE_SIZE = 60

function hash(text: string): string {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619)
  return (h >>> 0).toString(36)
}

function readCache(): Record<string, Polished> {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) ?? '{}') as Record<string, Polished>
  } catch {
    return {}
  }
}

function writeCache(key: string, value: Polished): void {
  try {
    const entries = Object.entries(readCache()).filter(([k]) => k !== key)
    entries.push([key, value])
    localStorage.setItem(CACHE_KEY, JSON.stringify(Object.fromEntries(entries.slice(-CACHE_SIZE))))
  } catch {
    // No storage: the text is fetched again next time.
  }
}

/** Bumped whenever the cache is cleared: an answer asked for before that must not be kept or shown. */
let generation = 0

/** The device-wide mark of the last clearing, in any tab. Null when storage cannot be read. */
function epoch(): string | null {
  try {
    return localStorage.getItem(EPOCH_KEY) ?? ''
  } catch {
    return null
  }
}

/**
 * Forget the AI wording kept on this device (on sign-out and account deletion). A request still
 * on its way, in this tab or another, then neither keeps nor shows its answer. False when the
 * wording could not be removed, or other tabs could not be told: an answer on its way there may
 * then still be kept.
 *
 * The mark goes first, then the removal, each tried on its own: a request that writes after the
 * removal sees the new mark when it checks again (`polish`), and removes its write.
 */
export function clearPolishedCache(): boolean {
  generation++
  let told = true
  try {
    localStorage.setItem(EPOCH_KEY, crypto.randomUUID())
  } catch {
    // A full storage: other tabs are not told. The removal below is still tried.
    told = false
  }
  try {
    localStorage.removeItem(CACHE_KEY)
    return told
  } catch {
    return false
  }
}

const apply = <T extends TextOut>(out: T, p: Polished): T => ({
  ...out,
  headline: p.headline,
  lines: p.lines,
  text: [p.headline, ...p.lines].join(' '),
  label: 'AI summary',
  model: `${p.model} via ${p.provider}`,
})

/** The reworded summary, or null when AI is not available (the rule-based text then stays). */
export async function polish<T extends TextOut>(out: T): Promise<T | null> {
  const key = `${out.feature}:${out.athleteId}:${hash([out.headline, ...out.lines].join('\n'))}`
  const cached = readCache()[key]
  if (cached) return apply(out, cached)
  const asked = generation
  const askedEpoch = epoch()
  const { data, error } = await supabase().functions.invoke('ai', {
    body: { feature: out.feature, athleteId: out.athleteId, headline: out.headline, lines: out.lines },
  })
  const body = data as ({ ok: true } & Polished) | { ok: false } | null
  if (error || !body?.ok) return null
  // Signed out or deleted while the request was on its way: the answer belongs to nobody here.
  // Storage is shared between tabs, so this also sees a sign-out made in another tab.
  const stale = () => asked !== generation || askedEpoch !== epoch()
  if (stale()) return null
  const p: Polished = { headline: body.headline, lines: body.lines, provider: body.provider, model: body.model }
  writeCache(key, p)
  // Another tab can clear between the check above and the write. It sets its mark before it
  // removes, so the mark has changed by now if it did: take the write back.
  if (stale()) {
    try {
      localStorage.removeItem(CACHE_KEY)
    } catch {
      // Nothing more can be done here; the clearing tab removes it too.
    }
    return null
  }
  return apply(out, p)
}
