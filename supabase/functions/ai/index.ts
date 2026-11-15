// AI text for Laree (docs/dev/backend.md "AI"). Rules decide what a summary says; a model only
// rewrites the wording. The request carries the rule-based draft, never raw health data, names or
// notes. Providers are any OpenAI-compatible APIs, tried in order (secret AI_PROVIDERS).
import { asCaller, asService, cors, reply } from '../_shared/http.ts'
import { checkOutput, safeBaseUrl } from './check.ts'

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
  let list: Provider[]
  try {
    list = JSON.parse(raw) as Provider[]
  } catch {
    console.error('AI_PROVIDERS is not valid JSON; using the default providers')
    return DEFAULT_PROVIDERS
  }
  if (!Array.isArray(list)) {
    console.error('AI_PROVIDERS is not a list; using the default providers')
    return DEFAULT_PROVIDERS
  }
  const allowLocalHttp = Deno.env.get('AI_ALLOW_LOCAL_HTTP') === '1'
  return list.filter((p) => {
    if (!p || typeof p.name !== 'string' || typeof p.baseUrl !== 'string' || typeof p.model !== 'string' || typeof p.keyEnv !== 'string') return false
    if (safeBaseUrl(p.baseUrl, allowLocalHttp)) return true
    console.error(`AI provider ${p.name} is skipped: its address is not HTTPS`)
    return false
  })
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

  // Nothing to call: say so without using up a place.
  const chain = providers().flatMap((p) => {
    const key = Deno.env.get(p.keyEnv)
    return key ? [{ p, key }] : []
  })
  if (chain.length === 0) return reply(503, { ok: false, reason: 'not-configured' })

  // Take a place in the daily allowance before any provider is called: two requests at once
  // cannot both take the last one, and a request counts even when no provider answers.
  const service = asService()
  const { data: runId, error: reserveError } = await service.rpc('reserve_ai_run', {
    p_user: who.user.id,
    p_athlete: draft.athleteId,
    p_feature: draft.feature,
    p_limit: DAILY_LIMIT,
  })
  if (reserveError) return reply(503, { ok: false, reason: 'unavailable' })
  if (runId === null) return reply(429, { ok: false, reason: 'daily-limit' })

  const record = async (p: Provider | null, status: string, tokensIn: number | null, tokensOut: number | null) => {
    const { error: recordError } = await service
      .from('ai_runs')
      .update({
        provider: (p?.name ?? '').slice(0, 40),
        model: (p?.model ?? '').slice(0, 120),
        status,
        input_tokens: tokensIn,
        output_tokens: tokensOut,
      })
      .eq('id', runId)
    if (recordError) console.error(`ai_runs ${runId} could not be updated: ${recordError.message}`)
  }

  let last: Provider | null = null
  let lastStatus = 'unavailable'
  let tokensIn: number | null = null
  let tokensOut: number | null = null
  const add = (sum: number | null, n: number | null) => (n === null ? sum : (sum ?? 0) + n)
  for (const { p, key } of chain) {
    const out = await ask(p, key, draft)
    if (out.kind === 'unavailable') continue
    last = p
    lastStatus = out.kind
    tokensIn = add(tokensIn, out.tokensIn)
    tokensOut = add(tokensOut, out.tokensOut)
    if (out.kind === 'ok') {
      await record(p, 'ok', tokensIn, tokensOut)
      return reply(200, { ok: true, headline: out.headline, lines: out.lines, provider: p.name, model: p.model })
    }
  }
  await record(last, lastStatus, tokensIn, tokensOut)
  return reply(502, { ok: false, reason: 'unavailable' })
})
