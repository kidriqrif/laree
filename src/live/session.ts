/**
 * Sign-in, sign-out and the start of the sync for the live app. Loaded only in a live build and
 * after the first paint, so the demo and the Today budget never carry the Supabase client.
 */
import { createClient } from '@supabase/supabase-js'
import type { Session, SupabaseClient } from '@supabase/supabase-js'
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from '../app/mode.ts'
import { emptyLiveData, LIVE_STORE_KEY, useLaree } from '../data/store.ts'
import { followAiConsent } from './aiConsent.ts'
import { clearPolishedCache } from './aiText.ts'
import { AUTH_KEY, applyAccount, cacheAccount, loadAccount, loadInvitations, readCachedAccount, syncContext, useAccount } from './account.ts'
import type { Account } from './account.ts'
import { sendWaitingFiles } from './files.ts'
import { startSync } from './sync/engine.ts'
import type { SyncHandle } from './sync/engine.ts'
import { idbOutboxStore } from './sync/idbOutbox.ts'
import { Outbox } from './sync/outbox.ts'
import { supabaseBackend } from './sync/supabaseBackend.ts'
import { useSyncStatus } from './sync/syncStatus.ts'

const OWNER_KEY = 'laree:live:owner'

let client: SupabaseClient | null = null

export function supabase(): SupabaseClient {
  client ??= createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: AUTH_KEY },
  })
  return client
}

let sync: SyncHandle | null = null
let syncedFor = ''
let booted = false
let stopAiConsent: (() => void) | null = null
let aiConsentFor = ''
/** Bumped by every sign-in attempt and sign-out: a slower, older attempt must not land after them. */
let attempt = 0

/** Rejected writes are undone by the next pull; the person hears about it once. */
function onRejected(): void {
  useSyncStatus.setState({ problem: 'A change was not allowed and has been undone.' })
}

function startSyncFor(a: Account): void {
  const key = `${a.uid}:${a.profile.role}:${a.coach?.id ?? ''}:${a.athletes.map((p) => p.id).join(',')}`
  if (sync && syncedFor === key) return
  sync?.stop()
  syncedFor = key
  sync = startSync({
    backend: supabaseBackend(supabase()),
    outbox: new Outbox(idbOutboxStore(a.uid)),
    ctx: syncContext(a),
    onRejected,
  })
}

/** The store's offline copy belongs to one account. Another account starts from empty. */
function claimStore(uid: string): void {
  let owner: string | null = null
  try {
    owner = localStorage.getItem(OWNER_KEY)
    localStorage.setItem(OWNER_KEY, uid)
  } catch {
    // Storage off: nothing was kept from anyone else either.
  }
  if (owner !== uid) useLaree.setState({ data: emptyLiveData(), undoStack: [] })
}

function ready(a: Account): void {
  applyAccount(a)
  useAccount.setState({ status: 'ready', account: a, error: null })
  startSyncFor(a)
  // One follower per account: loading the same account again must not start a second one.
  const follow = a.profile.role === 'athlete' ? a.uid : ''
  if (follow !== aiConsentFor) {
    stopAiConsent?.()
    stopAiConsent = follow ? followAiConsent(follow) : null
    aiConsentFor = follow
  }
  // Files logged offline go up once the app is open and online.
  void sendWaitingFiles(a.uid)
}

/**
 * Stop this tab's work for the account that was signed in, and drop its data from memory. Runs on
 * sign-out here and when another tab signs out (the auth client tells every tab).
 */
function teardown(): void {
  attempt++
  stopAiConsent?.()
  stopAiConsent = null
  aiConsentFor = ''
  sync?.stop()
  sync = null
  syncedFor = ''
  useLaree.setState({ data: emptyLiveData(), undoStack: [] })
}

async function enter(session: Session): Promise<void> {
  const mine = ++attempt
  const uid = session.user.id
  const email = session.user.email ?? ''
  claimStore(uid)
  // Offline or slow: open on the copy kept on the device, then catch up.
  const cached = readCachedAccount(uid)
  if (cached) ready(cached)
  try {
    const [a, invitations] = await Promise.all([loadAccount(supabase(), uid, email), loadInvitations(supabase())])
    if (mine !== attempt) return
    cacheAccount(a)
    useAccount.setState({ invitations })
    ready(a)
  } catch (e) {
    if (mine !== attempt) return
    if (!cached) useAccount.setState({ status: 'error', error: e instanceof Error ? e.message : String(e) })
  }
}

/** Start once: read the saved session and follow sign-in and sign-out from then on. */
export function boot(): void {
  if (booted) return
  booted = true
  // Ask the browser to keep this site's data under storage pressure (iOS clears it otherwise).
  void navigator.storage?.persist?.().catch(() => false)
  void import('./errors.ts').then((m) => m.watchErrors())
  const auth = supabase().auth
  auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT' || !session) {
      teardown()
      useAccount.setState({ status: 'signed-out', account: null, invitations: [] })
      return
    }
    if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') void enter(session)
  })
}

/** Reload the account after a change to it: an accepted invitation, a new athlete, onboarding. */
export async function refreshAccount(): Promise<void> {
  const { data } = await supabase().auth.getSession()
  if (data.session) await enter(data.session)
}

export async function sendCode(email: string): Promise<string | null> {
  const { error } = await supabase().auth.signInWithOtp({
    email,
    options: { shouldCreateUser: true, emailRedirectTo: `${location.origin}${location.pathname}` },
  })
  return error ? error.message : null
}

export async function verifyCode(email: string, token: string): Promise<string | null> {
  const { error } = await supabase().auth.verifyOtp({ email, token, type: 'email' })
  return error ? error.message : null
}

/** Writes still waiting on this device. Signing out would leave them here until the next sign-in. */
export const pendingWrites = (): number => useSyncStatus.getState().pending

/**
 * Sign this device out. The local scope works offline and leaves other devices signed in.
 * Returns an error message and keeps everything when the sign-out did not happen.
 */
export async function signOut(): Promise<string | null> {
  const { error } = await supabase().auth.signOut({ scope: 'local' })
  if (error) return `You are still signed in: ${error.message}`
  teardown()
  cacheAccount(null)
  clearPolishedCache()
  try {
    localStorage.removeItem(LIVE_STORE_KEY)
    localStorage.removeItem(OWNER_KEY)
  } catch {
    // Nothing kept, nothing to clear.
  }
  return null
}

/** Send and pull now, for "Sync now" and after a big change. */
export function syncNow(): Promise<void> {
  return sync?.syncNow() ?? Promise.resolve()
}
