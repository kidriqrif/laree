/**
 * An athlete's AI switch is also a consent (docs/spec/ai.md). The server checks the consents table,
 * so each change of the switch is written there as a new row. Idempotent: a row is added only
 * when the latest answer differs, so a reload or a pull never adds one.
 *
 * - One account's changes are recorded one after another, so an older answer never lands after a
 *   newer one.
 * - A change that could not be recorded stays due and is tried again, at the latest when the
 *   device is back online. A withdrawal made offline is never forgotten.
 * - Every row names its account. If another account has signed in on this device meanwhile, the
 *   access rules refuse the row instead of filing it under that account.
 */
import { useLaree } from '../data/store.ts'
import { CONSENT_VERSION } from './account.ts'
import { supabase } from './session.ts'

export interface ConsentServer {
  /** The latest AI answer on record, false when there is none. Rejects when it cannot be read. */
  latest(uid: string): Promise<boolean>
  /** Record an answer for this account. Rejects when it was not recorded. */
  add(uid: string, granted: boolean): Promise<void>
}

const supabaseConsents: ConsentServer = {
  async latest(uid) {
    const { data, error } = await supabase()
      .from('consents')
      .select('granted')
      .eq('user_id', uid)
      .eq('purpose', 'ai')
      .order('at', { ascending: false })
      .order('id', { ascending: false })
      .limit(1)
    if (error) throw new Error(error.message)
    return (data?.[0] as { granted?: boolean } | undefined)?.granted ?? false
  },
  async add(uid, granted) {
    const { error } = await supabase()
      .from('consents')
      .insert({ user_id: uid, purpose: 'ai', granted, text_version: CONSENT_VERSION })
    if (error) throw new Error(error.message)
  },
}

/** The last piece of consent work per account. New work waits for it, across followers too. */
const tails = new Map<string, Promise<void>>()

/** Follow the signed-in athlete's AI switch. Returns a stop function. */
export function followAiConsent(uid: string, server: ConsentServer = supabaseConsents, retryMs = 30_000): () => void {
  const switchOn = () => useLaree.getState().data.settings[uid]?.aiConsent === true
  let stopped = false
  let wanted = switchOn()
  /** The answer the server is known to hold. Null until one round has succeeded. */
  let recorded: boolean | null = null
  let queued = false
  let timer: ReturnType<typeof setTimeout> | undefined

  async function round(): Promise<void> {
    queued = false
    // The switch may change while a request is on its way: go round until the server agrees.
    while (!stopped && recorded !== wanted) {
      const target = wanted
      const latest = await server.latest(uid)
      if (stopped) return
      if (latest !== target) await server.add(uid, target)
      recorded = target
    }
  }

  function reconcile(): void {
    if (stopped || queued) return
    queued = true
    clearTimeout(timer)
    const run = (tails.get(uid) ?? Promise.resolve()).then(round).catch(() => {
      // Not recorded: the change stays due.
      queued = false
      if (!stopped) timer = setTimeout(reconcile, retryMs)
    })
    tails.set(uid, run)
    void run.then(() => {
      if (tails.get(uid) === run) tails.delete(uid)
    })
  }

  const unsubscribe = useLaree.subscribe(() => {
    const now = switchOn()
    if (now === wanted) return
    wanted = now
    reconcile()
  })
  globalThis.addEventListener?.('online', reconcile)
  reconcile()

  return () => {
    stopped = true
    clearTimeout(timer)
    unsubscribe()
    globalThis.removeEventListener?.('online', reconcile)
  }
}
