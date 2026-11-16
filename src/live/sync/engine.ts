/**
 * The sync loop. Local changes go out through the outbox; the server's rows come back into the
 * store. The store stays the app's only source for screens, so every page works as in the demo.
 *
 * - Every store change is diffed against the last known state and queued (diff.ts, outbox.ts).
 * - A sync sends the queue in order, then pulls: everything on the first sync of a visit, then
 *   only rows changed since. A queued write beats the server's copy of the same row.
 * - After a pull, derived data (matches, flags, badges) is worked out again for the athletes
 *   whose rows changed. That may queue writes of its own, which the next sync sends.
 * - Nothing is sent or pulled until the saved queue has been read: a pull must never replace
 *   local values whose unsent writes it cannot see.
 */
import { useLaree } from '../../data/store.ts'
import type { LareeData } from '../../data/store.ts'
import { diffData } from './diff.ts'
import type { Op } from './diff.ts'
import { SPECS } from './docs.ts'
import type { Row, Scope, SyncContext } from './docs.ts'
import type { Outbox, SendBatch } from './outbox.ts'
import { useSyncStatus } from './syncStatus.ts'
import type { SyncStatus } from './syncStatus.ts'

export { useSyncStatus }

export interface PulledRow extends Row {
  updatedAt: string
}

export interface Backend {
  send: SendBatch
  /** The server's clock, as a timestamp comparable with a row's `updatedAt`. */
  now(): Promise<string>
  /**
   * Rows of one table changed after `since` (every row when null), deleted ones included. It may
   * return rows the caller has seen before. `cancelled` is asked before each further request.
   */
  pull(table: string, scope: Scope, since: string | null, cancelled?: () => boolean): Promise<PulledRow[]>
}

export interface SyncOptions {
  backend: Backend
  outbox: Outbox
  ctx: SyncContext
  /** Writes the access rules refused. They are dropped; the next pull restores the server's copy. */
  onRejected?: (ops: readonly Op[], message: string | undefined) => void
  /** Milliseconds between background syncs. */
  intervalMs?: number
}

export interface SyncHandle {
  /** Send and pull now. Resolves when this round is done. */
  syncNow(): Promise<void>
  stop(): void
  /**
   * Stop, and forget this account's queue for good (the account was deleted). Rejects when the
   * saved queue could not be removed from the device.
   */
  discard(): Promise<void>
}

export const QUEUE_UNREADABLE =
  'The changes waiting on this device could not be read, so syncing is paused. Keep Laree open; it tries again shortly.'

const rowKey = (r: { key: string; id: string }): string => `${r.key}/${r.id}`
const MAX_BACKOFF_MS = 5 * 60_000

export function startSync(opts: SyncOptions): SyncHandle {
  const { backend, outbox, ctx } = opts
  const mirror = new Map<string, Map<string, PulledRow>>()
  /**
   * Where the next incremental pull starts: the server's time when the last pull began. Never the
   * newest row seen: a row stamped earlier can become visible after a later one was read, during a
   * long pull too, and a cursor on the newest row would step over it for good.
   */
  let cursor: string | null = null
  let baseline: LareeData = useLaree.getState().data
  let applying = false
  let hydrated = false
  let running: Promise<void> | null = null
  let again = false
  let stopped = false
  let failures = 0
  let retryAt = 0
  /**
   * Tables to rebuild on the next pull even if nothing changed there: a refused write must be
   * undone, and a rebuild that failed must be tried again.
   */
  const forced = new Set<string>()
  let debounce: ReturnType<typeof setTimeout> | undefined
  const isStopped = () => stopped

  const setStatus = (change: Partial<SyncStatus>) => {
    // A stopped sync (sign-out, another account) must not touch the next one's status.
    if (stopped) return
    useSyncStatus.setState({ ...change, pending: outbox.pending.length })
  }
  // Fresh status for this account: nothing carries over from the one before.
  useSyncStatus.setState({ pending: 0, syncing: false, offline: false, unsaved: false, lastSyncedAt: null, problem: null })
  outbox.onSaveState = (saved) => setStatus({ unsaved: !saved })

  const unsubscribe = useLaree.subscribe((state) => {
    if (state.data === baseline) return
    if (applying) {
      baseline = state.data
      return
    }
    const ops = diffData(baseline, state.data, ctx)
    baseline = state.data
    if (ops.length === 0) return
    void outbox.add(ops)
    setStatus({})
    schedule()
  })

  function schedule(delay = 400) {
    if (stopped) return
    clearTimeout(debounce)
    debounce = setTimeout(() => void syncNow(), Math.max(delay, retryAt - Date.now()))
  }

  /** The server's rows for one table, with the writes still queued here on top. */
  function rowsOf(table: string): Row[] {
    const rows = new Map<string, Row>(mirror.get(table) ?? [])
    for (const op of outbox.pending) {
      if (op.table !== table) continue
      rows.set(rowKey(op), { key: op.key, id: op.id, day: op.day, body: op.body ?? {}, deleted: op.body === null })
    }
    return [...rows.values()]
  }

  /** Rebuild the given tables in the store, then apply every table that adds to another slice. */
  function applyMirror(tables: ReadonlySet<string>) {
    const patch: Partial<LareeData> = {}
    for (const spec of SPECS) if (tables.has(spec.table)) Object.assign(patch, spec.build(rowsOf(spec.table), ctx))
    applying = true
    try {
      useLaree.setState((s) => {
        let data: LareeData = { ...s.data, ...patch }
        for (const spec of SPECS) if (spec.merge) data = { ...data, ...spec.merge(data, rowsOf(spec.table)) }
        return { data }
      })
    } finally {
      applying = false
    }
  }

  async function pull(): Promise<Set<string>> {
    const full = !hydrated
    const startedAt = await backend.now()
    if (stopped) return new Set()
    // Read every table first. The mirror and the cursor change only once all reads succeed, so a
    // failed read leaves nothing half-applied and the next try reads the same rows again.
    const read: [string, PulledRow[]][] = []
    for (const spec of SPECS) {
      read.push([spec.table, await backend.pull(spec.table, spec.scope, full ? null : cursor, isStopped)])
      if (stopped) return new Set()
    }
    cursor = startedAt
    const touched = new Set<string>()
    const tables = new Set<string>(forced)
    for (const [table, rows] of read) {
      let m = mirror.get(table)
      if (!m || full) mirror.set(table, (m = new Map()))
      let changed = false
      for (const r of rows) {
        // A backend may hand back rows seen before (it re-reads a short window): skip the unchanged.
        if (m.get(rowKey(r))?.updatedAt === r.updatedAt) continue
        m.set(rowKey(r), r)
        touched.add(r.key)
        changed = true
      }
      if (full || changed) tables.add(table)
    }
    if (tables.size > 0) {
      try {
        applyMirror(tables)
      } catch (e) {
        // The store was not rebuilt: every one of these tables is due again on the next pull.
        for (const t of tables) forced.add(t)
        throw e
      }
    }
    forced.clear()
    if (full) for (const id of ctx.athleteIds) touched.add(id)
    hydrated = true
    return touched
  }

  /** The saved queue must be read before anything is sent or pulled. False while it cannot be. */
  async function queueRead(): Promise<boolean> {
    if (outbox.ready) return true
    try {
      await outbox.load()
      return true
    } catch {
      setStatus({ syncing: false, unsaved: true, problem: QUEUE_UNREADABLE })
      return false
    }
  }

  async function round(): Promise<void> {
    if (!(await queueRead()) || stopped) return
    setStatus({ syncing: true })
    try {
      const sent = await outbox.flush(backend.send, isStopped)
      if (stopped) return
      for (const op of sent.rejected) forced.add(op.table)
      if (sent.rejected.length > 0) opts.onRejected?.(sent.rejected, sent.message)
      if (sent.stalled) throw new Error(sent.message ?? 'The server could not be reached')
      const touched = await pull()
      if (stopped) return
      const store = useLaree.getState()
      for (const id of touched) if (ctx.athleteIds.includes(id)) store.resettle(id)
      failures = 0
      retryAt = 0
      setStatus({
        syncing: false,
        offline: false,
        lastSyncedAt: Date.now(),
        problem: sent.rejected.length > 0 ? 'Some changes were not allowed and were undone.' : null,
      })
    } catch (e) {
      if (stopped) return
      failures++
      retryAt = Date.now() + Math.min(MAX_BACKOFF_MS, 2000 * 2 ** failures)
      setStatus({ syncing: false, offline: true, problem: e instanceof Error ? e.message : String(e) })
    }
  }

  function syncNow(): Promise<void> {
    if (stopped) return Promise.resolve()
    if (running) {
      again = true
      return running
    }
    running = round().finally(() => {
      running = null
      if (again && !stopped) {
        again = false
        schedule(0)
      }
    })
    return running
  }

  const onOnline = () => {
    retryAt = 0
    schedule(0)
  }
  const onVisible = () => {
    if (document.visibilityState === 'visible') schedule(0)
  }
  const timer = setInterval(() => schedule(0), opts.intervalMs ?? 60_000)
  globalThis.addEventListener?.('online', onOnline)
  globalThis.document?.addEventListener('visibilitychange', onVisible)

  const first = syncNow()

  function stop() {
    stopped = true
    outbox.onSaveState = null
    clearTimeout(debounce)
    clearInterval(timer)
    unsubscribe()
    globalThis.removeEventListener?.('online', onOnline)
    globalThis.document?.removeEventListener('visibilitychange', onVisible)
  }

  return {
    syncNow: () => first.then(syncNow),
    stop,
    discard() {
      stop()
      return outbox.destroy()
    },
  }
}
