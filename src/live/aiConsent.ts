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

/** The followers running now, per account. Each says whether the server holds that account's latest answer. */
const followers = new Map<string, () => Promise<boolean>>()

/**
 * Is this account's latest AI answer on the server? An answer still due is tried first. True when
 * nobody follows the account: a coach has no AI switch of their own. The data export asks this,
 * so a file never leaves out the latest answer without saying so.
 */
export function aiConsentRecorded(uid: string): Promise<boolean> {
  return followers.get(uid)?.() ?? Promise.resolve(true)
}

/** Follow the signed-in athlete's AI switch. Returns a stop function. */
export function followAiConsent(uid: string, server: ConsentServer = supabaseConsents, retryMs = 30_000): () => void {
  /**
   * The switch, or null while this account's settings are not on the device yet. On a new device
   * they arrive with the first sync. Until then nothing is recorded: "not here yet" is not a
   * withdrawal, and must not put one in the consent history.
   */
  const switchOn = (): boolean | null => {
    const saved = useLaree.getState().data.settings[uid]
    return saved ? saved.aiConsent === true : null
  }
  let stopped = false
  let wanted = switchOn()
  /**
   * The answer the server is known to hold. Null when that is not known: before the first round,
   * and after any request that failed. A failed request may still have reached the server, so
   * the next round reads the server again before it decides.
   */
  let recorded: boolean | null = null
  let queued = false
  let timer: ReturnType<typeof setTimeout> | undefined

  async function round(): Promise<void> {
    queued = false
    // The switch may change while a request is on its way: go round until the server agrees.
    while (!stopped && wanted !== null && recorded !== wanted) {
      const target = wanted
      const latest = await server.latest(uid)
      if (stopped) return
      if (latest !== target) await server.add(uid, target)
      recorded = target
    }
  }

  function reconcile(): void {
    if (stopped || queued || wanted === null) return
    queued = true
    clearTimeout(timer)
    const run = (tails.get(uid) ?? Promise.resolve()).then(round).catch(() => {
      // Not recorded, as far as we know: the change stays due, and the server is read again.
      queued = false
      recorded = null
      if (!stopped) timer = setTimeout(reconcile, retryMs)
    })
    tails.set(uid, run)
    void run.then(() => {
      if (tails.get(uid) === run) tails.delete(uid)
    })
  }

  const unsubscribe = useLaree.subscribe(() => {
    const now = switchOn()
    if (now === null || now === wanted) return
    wanted = now
    reconcile()
  })
  globalThis.addEventListener?.('online', reconcile)
  reconcile()

  const upToDate = async (): Promise<boolean> => {
    reconcile()
    // Never rejects: a failed round ends in its own catch above.
    await tails.get(uid)
    return wanted === null || recorded === wanted
  }
  followers.set(uid, upToDate)

  return () => {
    stopped = true
    clearTimeout(timer)
    unsubscribe()
    globalThis.removeEventListener?.('online', reconcile)
    if (followers.get(uid) === upToDate) followers.delete(uid)
  }
}
