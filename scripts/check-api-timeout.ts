/**
 * The sync relies on one bound: a write made through the API cannot stay open longer than the
 * `authenticated` role's statement timeout (8 s; see the migration and src/live/sync). The role
 * setting alone does not prove that: the API must have loaded it. This asks the running local
 * stack, as a signed-in user, to run a statement that takes longer, and expects the database to
 * cancel it. Run after `npm run db:start`: `npm run check:api-timeout`.
 */
import { execFileSync } from 'node:child_process'
import { createHmac, randomUUID } from 'node:crypto'

const LIMIT_S = 8
// `supabase` is on the PATH under `npm run`, and in CI through setup-cli.
const status = JSON.parse(execFileSync('supabase', ['status', '-o', 'json'], { encoding: 'utf8' })) as Record<string, string>
const { API_URL, DB_URL, JWT_SECRET, PUBLISHABLE_KEY, ANON_KEY } = status
if (!API_URL || !DB_URL || !JWT_SECRET) throw new Error('The local stack is not running: npm run db:start')

const b64 = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url')
const now = Math.floor(Date.now() / 1000)
const unsigned = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ role: 'authenticated', aud: 'authenticated', sub: randomUUID(), iat: now, exp: now + 300 })}`
const token = `${unsigned}.${createHmac('sha256', JWT_SECRET).update(unsigned).digest('base64url')}`

const sql = (statement: string) => execFileSync('psql', [DB_URL, '-v', 'ON_ERROR_STOP=1', '-qAtc', statement], { encoding: 'utf8' })
const name = `timeout_probe_${randomUUID().replaceAll('-', '').slice(0, 12)}`

// A function that only this check uses, removed again below.
sql(`create function public.${name}() returns void language sql as 'select pg_sleep(${LIMIT_S * 2})';
     grant execute on function public.${name}() to authenticated;
     notify pgrst, 'reload schema';`)
try {
  // Give the API a moment to see the new function.
  await new Promise((resolve) => setTimeout(resolve, 2000))
  const started = Date.now()
  const res = await fetch(`${API_URL}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: { apikey: PUBLISHABLE_KEY ?? ANON_KEY ?? '', Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: '{}',
  })
  const seconds = (Date.now() - started) / 1000
  const body = (await res.json().catch(() => null)) as { code?: string } | null
  if (body?.code !== '57014' || seconds > LIMIT_S + 3) {
    console.error(`Expected the API to cancel the statement after ${LIMIT_S} s (code 57014). Got HTTP ${res.status}, code ${body?.code ?? 'none'}, after ${seconds.toFixed(1)} s.`)
    process.exitCode = 1
  } else {
    console.log(`API statement timeout is in effect: cancelled after ${seconds.toFixed(1)} s (limit ${LIMIT_S} s).`)
  }
} finally {
  sql(`drop function if exists public.${name}(); notify pgrst, 'reload schema';`)
}
