// AI text for Laree (docs/dev/backend.md "AI"). Rules decide what a summary says; a model only
// rewrites the wording. The request carries the rule-based draft, never raw health data, names or
// notes. Providers are any OpenAI-compatible APIs, tried in order (secret AI_PROVIDERS).
import { asCaller, asService, cors, reply } from '../_shared/http.ts'

interface Provider {
  name: string
  baseUrl: string
  model: string
  /** Name of the secret that holds this provider's key. */
  keyEnv: string
}

interface Draft {
  feature: 'recap' | 'checkin'
  athleteId: string
  headline: string
  lines: string[]
}

const DAILY_LIMIT = 40
const TIMEOUT_MS = 20_000
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const DEFAULT_PROVIDERS: Provider[] = [
  { name: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1', model: 'meta-llama/llama-3.3-70b-instruct:free', keyEnv: 'OPENROUTER_API_KEY' },
  { name: 'Groq', baseUrl: 'https://api.groq.com/openai/v1', model: 'llama-3.3-70b-versatile', keyEnv: 'GROQ_API_KEY' },
  { name: 'Google', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', model: 'gemini-2.0-flash', keyEnv: 'GEMINI_API_KEY' },
]

function providers(): Provider[] {
  const raw = Deno.env.get('AI_PROVIDERS')
  if (!raw) return DEFAULT_PROVIDERS
  try {
    const list = JSON.parse(raw) as Provider[]
    return list.filter((p) => p && typeof p.baseUrl === 'string' && typeof p.model === 'string' && typeof p.keyEnv === 'string')
  } catch {
    console.error('AI_PROVIDERS is not valid JSON; using the default providers')
    return DEFAULT_PROVIDERS
  }
}

function parseDraft(body: unknown): Draft | null {
  if (typeof body !== 'object' || body === null) return null
  const b = body as Record<string, unknown>
  const lines = b['lines']
  if (b['feature'] !== 'recap' && b['feature'] !== 'checkin') return null
  if (typeof b['athleteId'] !== 'string' || !UUID.test(b['athleteId'])) return null
  if (typeof b['headline'] !== 'string' || b['headline'].length > 200) return null
  if (!Array.isArray(lines) || lines.length > 6 || !lines.every((l) => typeof l === 'string' && l.length <= 400)) return null
  return { feature: b['feature'], athleteId: b['athleteId'], headline: b['headline'], lines: lines as string[] }
}

const SYSTEM = (feature: Draft['feature']) =>
  [
    'You rewrite short training summaries for an endurance-sport training app.',
    feature === 'recap'
      ? 'The reader is the athlete. Write to them as "you".'
      : 'The reader is the coach. Write about "the athlete".',
    'Keep every fact and every number exactly as given. Add no new facts, numbers, dates, advice, diagnosis or medical claims.',
    'Plain, warm British English. Short sentences.',
    'Reply with JSON only: {"headline": string of at most 90 characters, "lines": array of 1 to 4 strings of at most 200 characters each}.',
  ].join(' ')

const numbers = (text: string): string[] => text.match(/\d+(?:[.,]\d+)?/g) ?? []

/** The model may reword, never invent: every number it writes must be in the draft. */
function checkOutput(raw: string, draft: Draft): { headline: string; lines: string[] } | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw.replace(/^```(?:json)?\s*|\s*```$/g, ''))
  } catch {
    return null
  }
  const o = parsed as { headline?: unknown; lines?: unknown }
  if (typeof o.headline !== 'string' || o.headline.length === 0 || o.headline.length > 120) return null
  if (!Array.isArray(o.lines) || o.lines.length < 1 || o.lines.length > 4) return null
  if (!o.lines.every((l) => typeof l === 'string' && l.length > 0 && l.length <= 240)) return null
  const allowed = new Set(numbers([draft.headline, ...draft.lines].join(' ')))
  const written = numbers([o.headline, ...(o.lines as string[])].join(' '))
  if (written.some((n) => !allowed.has(n))) return null
  return { headline: o.headline, lines: o.lines as string[] }
}

type Outcome =
  | { kind: 'ok'; headline: string; lines: string[]; tokensIn: number | null; tokensOut: number | null }
  | { kind: 'invalid'; tokensIn: number | null; tokensOut: number | null }
  | { kind: 'unavailable' }

async function ask(p: Provider, key: string, draft: Draft): Promise<Outcome> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(`${p.baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      signal: ctrl.signal,
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: p.model,
        temperature: 0.2,
        max_tokens: 400,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM(draft.feature) },
          { role: 'user', content: JSON.stringify({ headline: draft.headline, lines: draft.lines }) },
        ],
      }),
    })
    if (!res.ok) return { kind: 'unavailable' }
    const body = (await res.json()) as {
      choices?: { message?: { content?: string } }[]
      usage?: { prompt_tokens?: number; completion_tokens?: number }
    }
    const tokensIn = body.usage?.prompt_tokens ?? null
    const tokensOut = body.usage?.completion_tokens ?? null
    const checked = checkOutput(body.choices?.[0]?.message?.content ?? '', draft)
    return checked ? { kind: 'ok', ...checked, tokensIn, tokensOut } : { kind: 'invalid', tokensIn, tokensOut }
  } catch {
    return { kind: 'unavailable' }
  } finally {
    clearTimeout(timer)
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return reply(405, { ok: false, reason: 'method' })

  const caller = asCaller(req)
  const { data: who } = await caller.auth.getUser()
  if (!who.user) return reply(401, { ok: false, reason: 'signed-out' })

  const draft = parseDraft(await req.json().catch(() => null))
  if (!draft) return reply(400, { ok: false, reason: 'bad-request' })

  const { data: allowed, error } = await caller.rpc('ai_allowed', { athlete: draft.athleteId })
  if (error || allowed !== true) return reply(403, { ok: false, reason: 'not-allowed' })

  const service = asService()
  const since = new Date(Date.now() - 86_400_000).toISOString()
  const { count } = await service
    .from('ai_runs')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', who.user.id)
    .gte('created_at', since)
  if ((count ?? 0) >= DAILY_LIMIT) return reply(429, { ok: false, reason: 'daily-limit' })

  const log = (p: Provider, status: string, tokensIn: number | null, tokensOut: number | null) =>
    service.from('ai_runs').insert({
      user_id: who.user.id,
      athlete_id: draft.athleteId,
      feature: draft.feature,
      provider: p.name.slice(0, 40),
      model: p.model.slice(0, 120),
      status,
      input_tokens: tokensIn,
      output_tokens: tokensOut,
    })

  let tried = false
  for (const p of providers()) {
    const key = Deno.env.get(p.keyEnv)
    if (!key) continue
    tried = true
    const out = await ask(p, key, draft)
    if (out.kind === 'unavailable') continue
    await log(p, out.kind === 'ok' ? 'ok' : 'invalid', out.tokensIn, out.tokensOut)
    if (out.kind === 'ok') return reply(200, { ok: true, headline: out.headline, lines: out.lines, provider: p.name, model: p.model })
  }
  return reply(tried ? 502 : 503, { ok: false, reason: tried ? 'unavailable' : 'not-configured' })
})
