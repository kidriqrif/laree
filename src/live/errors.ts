/**
 * Uncaught errors in the live app go to the client_errors table, so the owner sees what broke.
 * Only the message, a short stack, the page (without its query) and the browser: no data, no ids
 * beyond the route. At most a few per visit; the database caps each person at 50 a day too.
 */
import { supabase } from './session.ts'

const MAX_PER_VISIT = 10
let sent = 0
const seen = new Set<string>()

function report(message: string, stack: string | undefined): void {
  const key = `${message}\n${stack ?? ''}`.slice(0, 300)
  if (sent >= MAX_PER_VISIT || seen.has(key)) return
  seen.add(key)
  sent++
  const db = supabase()
  void db.auth.getSession().then(({ data }) => {
    if (!data.session) return
    return db.from('client_errors').insert({
      message: message.slice(0, 500),
      stack: stack?.slice(0, 4000) ?? null,
      path: location.hash.split('?')[0]?.slice(0, 200) ?? null,
      user_agent: navigator.userAgent.slice(0, 300),
      app_version: import.meta.env.VITE_APP_VERSION?.slice(0, 40) ?? null,
    })
  }).catch(() => undefined)
}

export function watchErrors(): void {
  addEventListener('error', (e) => report(e.message || 'Error', e.error instanceof Error ? e.error.stack : undefined))
  addEventListener('unhandledrejection', (e) => {
    const r: unknown = e.reason
    report(r instanceof Error ? r.message : String(r), r instanceof Error ? r.stack : undefined)
  })
}
