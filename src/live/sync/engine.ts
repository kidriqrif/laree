/**
 * The sync loop. Local changes go out through the outbox; the server's rows come back into the
 * store. The store stays the app's only source for screens, so every page works as in the demo.
 *
 * - Every store change is diffed against the last known state and queued (diff.ts, outbox.ts).
 * - A sync sends the queue in order, then pulls: everything on the first sync of a visit, then
 *   only rows changed since. A queued write beats the server's copy of the same row.
 * - After a pull, derived data (matches, flags, badges) is worked out again for the athletes
 *   whose rows changed. That may queue writes of its own, which the next sync sends.
 */
import { create } from 'zustand'
import { useLaree } from '../../data/store.ts'
import type { LareeData } from '../../data/store.ts'
import { diffData } from './diff.ts'
import type { Op } from './diff.ts'
import { SPECS } from './docs.ts'
import type { Row, Scope, SyncContext } from './docs.ts'
import type { Outbox, SendBatch } from './outbox.ts'

export interface PulledRow extends Row {
  updatedAt: string
}

export interface Backend {
  send: SendBatch
  /** Rows of one table changed after `since` (every row when null), deleted ones included. */
  pull(table: string, scope: Scope, since: string | null): Promise<PulledRow[]>
}

export interface SyncStatus {
  /** Writes waiting on this device. */
  pending: number
  syncing: boolean
  /** The last sync could not reach the server. */
  offline: boolean
  lastSyncedAt: number | null
  /** The last refusal or error, in words for the person. */
  problem: string | null
}

export const useSyncStatus = create<SyncStatus>(() => ({
  pending: 0,
  syncing: false,
  offline: false,
  lastSyncedAt: null,
  problem: null,
}))

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
}

const rowKey = (r: { key: string; id: string }): string => `${r.key}/${r.id}`
const MAX_BACKOFF_MS = 5 * 60_000

export function startSync(opts: SyncOptions): SyncHandle {
  const { backend, outbox, ctx } = opts
  const mirror = new Map<string, Map<string, PulledRow>>()
  const cursor = new Map<string, string>()
  let baseline: LareeData = useLaree.getState().data
  let applying = false
  let hydrated = false
  let running: Promise<void> | null = null
  let again = false
  let stopped = false
  let failures = 0
  let retryAt = 0
  /** Tables to rebuild on the next pull even if nothing changed there: a refused write must be undone. */
  const forced = new Set<string>()
  let debounce: ReturnType<typeof setTimeout> | undefined

  const setStatus = (change: Partial<SyncStatus>) => {
    // A stopped sync (sign-out, another account) must not touch the next one's status.
    if (stopped) return
    useSyncStatus.setState({ ...change, pending: outbox.pending.length })
  }
  outbox.onSaveError = () =>
    setStatus({ problem: 'Changes could not be saved on this device. Keep the app open until they are sent.' })

  const unsubscribe = useLaree.subscribe((state) => {
    if (state.data === baseline) return
    if (applying) {
      baseline = state.data
      return
    }
    const ops = diffData(baseline, state.data, ctx)
    baseline = state.data
    if (ops.length === 0) return
    void outbox.add(ops).then(() => setStatus({}))
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
    // Read every table first. The mirror and cursors change only once all reads succeed, so a
    // failed read leaves nothing half-applied and the next try reads the same rows again.
    const read: [string, PulledRow[]][] = []
    for (const spec of SPECS) {
      read.push([spec.table, await backend.pull(spec.table, spec.scope, full ? null : (cursor.get(spec.table) ?? null))])
      if (stopped) return new Set()
    }
    const touched = new Set<string>()
    const tables = new Set<string>(forced)
    for (const [table, rows] of read) {
      let m = mirror.get(table)
      if (!m || full) mirror.set(table, (m = new Map()))
      for (const r of rows) {
        m.set(rowKey(r), r)
        touched.add(r.key)
        if (r.updatedAt > (cursor.get(table) ?? '')) cursor.set(table, r.updatedAt)
      }
      if (full || rows.length > 0) tables.add(table)
    }
    forced.clear()
    if (tables.size > 0) applyMirror(tables)
    if (full) for (const id of ctx.athleteIds) touched.add(id)
    hydrated = true
    return touched
  }

  async function round(): Promise<void> {
    setStatus({ syncing: true })
    try {
      const sent = await outbox.flush(backend.send)
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

  const start = outbox.load().then(() => {
    setStatus({})
    return syncNow()
  })

  return {
    syncNow: () => start.then(syncNow),
    stop() {
      stopped = true
      clearTimeout(debounce)
      clearInterval(timer)
      unsubscribe()
      globalThis.removeEventListener?.('online', onOnline)
      globalThis.document?.removeEventListener('visibilitychange', onVisible)
    },
  }
}
