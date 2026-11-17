/**
 * Writes waiting to reach the database, kept on the device so nothing is lost offline or on a
 * reload. Writes are upserts keyed on the record's own id, so sending one twice is harmless.
 *
 * One Outbox per account and tab, whatever sync uses it (session.ts). Every save reads the queue
 * on the device and applies this tab's changes to it in one step, so neither another sync in this
 * tab nor another tab of the same account can lose what the other queued.
 */
import { opKey } from './diff.ts'
import type { Op } from './diff.ts'

/** Where the queue is kept between visits. */
export interface OutboxStore {
  /** The saved queue. Rejects when it cannot be read: that is not the same as an empty queue. */
  load(): Promise<Op[]>
  /** Replace the saved queue. Used only to remove it for good. */
  save(ops: readonly Op[]): Promise<void>
  /**
   * Read the queue, change it and save the result in one step, so that what another tab saved
   * meanwhile is kept. Resolves to the saved queue. A store without it is read, then saved.
   */
  update?(change: (saved: Op[]) => Op[]): Promise<Op[]>
  /**
   * Run `work` while no other tab sends this queue. A send holds it from reading the queue until
   * the sent writes are removed, so another tab never sends a write that is still on its way from
   * here, and an older write cannot reach the server after a newer one sent from another tab.
   * Writes from another device are not covered: the last request to arrive wins there.
   */
  exclusive?<T>(work: () => Promise<T>): Promise<T>
}

/**
 * One change to the queue. Saving applies the changes still due to the queue as it is on the
 * device then, never a copy of this tab's queue: another tab of the same account may have added
 * writes to it, or sent some, meanwhile.
 */
type Change =
  /**
   * Queue these writes. A newer write to a row replaces the older one and moves to the back.
   * `ops` shrinks when some of them are sent before the put is saved (`record`).
   */
  | { kind: 'put'; ops: Op[] }
  /** Remove exactly these writes: sent or refused. A newer write to the same row stays. */
  | { kind: 'drop'; ops: readonly Op[] }

const sameWrite = (op: Op): string => JSON.stringify(op)

function apply(queue: readonly Op[], changes: readonly Change[]): Op[] {
  let q = [...queue]
  for (const c of changes) {
    if (c.kind === 'put') {
      const replaced = new Set(c.ops.map(opKey))
      q = [...q.filter((o) => !replaced.has(opKey(o))), ...c.ops]
    } else {
      const gone = new Set(c.ops.map(sameWrite))
      q = q.filter((o) => !gone.has(sameWrite(o)))
    }
  }
  return q
}

/** What a backend says about one batch. `denied`: the access rules refused it, so retrying cannot help. */
export type SendResult = { ok: true } | { ok: false; denied: boolean; message: string }

export type SendBatch = (table: string, scope: Op['scope'], ops: readonly Op[]) => Promise<SendResult>

export interface FlushResult {
  sent: number
  /** Writes the access rules refused. They are dropped and reported. */
  rejected: Op[]
  /** Stopped early on a network or server error, or because the sync was stopped. The rest stays queued. */
  stalled: boolean
  message?: string
}

const BATCH = 500

export class Outbox {
  /** The queue as this tab knows it: the device's, as last read, with the changes still due on top. */
  private ops: Op[] = []
  /** Changes not yet on the device, oldest first. */
  private changes: Change[] = []
  private loaded = false
  private saving: Promise<void> = Promise.resolve()
  /** Counts the saves asked for: only the newest one speaks for the whole queue. */
  private revision = 0
  private closed = false
  /** Did the last save read the device's queue? False after one that failed. */
  private fresh = false
  private loading: Promise<void> | null = null
  /** The send going on now, if any: the next one waits for it. */
  private sending: Promise<unknown> = Promise.resolve()
  private readonly store: OutboxStore
  /** Told after every save: true when the queue is safely on the device, false when the save failed. */
  onSaveState: ((saved: boolean) => void) | null = null

  constructor(store: OutboxStore) {
    this.store = store
  }

  /** Has the saved queue been read? Until then nothing is saved or sent. */
  get ready(): boolean {
    return this.loaded
  }

  /**
   * Read the saved queue and put the writes made meanwhile after it. Nothing is saved before this
   * succeeds, so an early write can never replace the saved queue with a partial one. Rejects when
   * the queue cannot be read; call it again to retry. Callers at the same time share one read.
   */
  load(): Promise<void> {
    if (this.loaded || this.closed) return Promise.resolve()
    this.loading ??= this.read().finally(() => {
      this.loading = null
    })
    return this.loading
  }

  private async read(): Promise<void> {
    const saved = await this.store.load()
    if (this.loaded || this.closed) return
    this.ops = apply(saved, this.changes)
    this.loaded = true
    await this.persist()
  }

  /** Apply a change here now, and to the device's queue on the next save. */
  private record(change: Change): void {
    if (change.kind === 'drop') {
      // A write that was sent or refused is no longer this tab's to queue: a put of it still due
      // would otherwise replace a newer write to the same row that another tab saved meanwhile.
      // The put keeps its identity, so a save already holding it still finds it when it ends.
      const gone = new Set(change.ops.map(sameWrite))
      for (const c of this.changes) if (c.kind === 'put') c.ops = c.ops.filter((o) => !gone.has(sameWrite(o)))
    }
    this.changes.push(change)
    this.ops = apply(this.ops, [change])
  }

  private write(change: (saved: Op[]) => Op[]): Promise<Op[]> {
    if (this.store.update) return this.store.update(change)
    return this.store.load().then(async (saved) => {
      const next = change(saved)
      await this.store.save(next)
      return next
    })
  }

  get pending(): readonly Op[] {
    return this.ops
  }

  /** Is a write for this row still waiting? Then the device's copy is newer than the server's. */
  has(table: string, key: string, id: string): boolean {
    const k = opKey({ table, key, id })
    return this.ops.some((o) => opKey(o) === k)
  }

  /** Queue writes. A newer write to the same row replaces the older one and moves to the back. */
  add(ops: readonly Op[]): Promise<void> {
    if (ops.length === 0 || this.closed) return this.saving
    this.record({ kind: 'put', ops: [...ops] })
    // Before the saved queue is read, the write waits in memory; load() saves the merged queue.
    return this.loaded ? this.persist() : Promise.resolve()
  }

  /**
   * Apply the changes still due to the queue on the device, and take what it then holds as this
   * tab's queue: writes another tab queued meanwhile come in, and are sent from here too. A save
   * that fails keeps its changes due for the next one.
   */
  private persist(): Promise<void> {
    if (this.closed) return this.saving
    const revision = ++this.revision
    this.saving = this.saving
      .then(async () => {
        if (this.closed) return
        // The changes this save carries, by identity: `record` may shrink a put meanwhile, and
        // later changes are added, but only these are done when it ends.
        const due = new Set(this.changes)
        const saved = await this.write((current) => apply(current, [...due]))
        // Changes made while this save ran stay due, on top of what is saved now.
        this.changes = this.changes.filter((c) => !due.has(c))
        this.fresh = true
        if (!this.closed) this.ops = apply(saved, this.changes)
      })
      .then(
        () => {
          // An older save that worked says nothing about writes queued after it.
          if (revision === this.revision && this.changes.length === 0) this.onSaveState?.(true)
        },
        () => {
          this.fresh = false
          this.onSaveState?.(false)
        },
      )
    return this.saving
  }

  /** Resolves when every save asked for so far has ended. */
  settled(): Promise<void> {
    return this.saving
  }

  /**
   * Forget the queue for good (the account was deleted). Nothing is saved after this, and the
   * saved queue is removed once a save already on its way has ended. Rejects when the queue could
   * not be removed from the device.
   */
  async destroy(): Promise<void> {
    this.closed = true
    this.ops = []
    this.changes = []
    await this.saving
    await this.store.save([])
  }

  /**
   * Send everything in order, one batch per run of writes to the same table. `cancelled` is asked
   * before every request: a stopped sync sends nothing more. One send runs at a time: a sync that
   * replaces another shares this queue, and its send starts only when the older one has ended.
   */
  flush(send: SendBatch, cancelled: () => boolean = () => false): Promise<FlushResult> {
    const exclusive = this.store.exclusive?.bind(this.store)
    const run = this.sending.then(() => (exclusive ? exclusive(() => this.sendAll(send, cancelled)) : this.sendAll(send, cancelled)))
    this.sending = run.catch(() => undefined)
    return run
  }

  private async sendAll(send: SendBatch, cancelled: () => boolean): Promise<FlushResult> {
    if (!this.loaded) throw new Error('The saved changes have not been read yet')
    // Read the device's queue first: another tab may have queued writes, or sent some, meanwhile.
    // If it cannot be read, send nothing: this tab's copy may hold a write another tab has
    // already replaced on the server with a newer one.
    await this.persist()
    if (!this.fresh) return { sent: 0, rejected: [], stalled: true, message: 'The changes waiting on this device could not be read' }
    const result: FlushResult = { sent: 0, rejected: [], stalled: false }
    const queue = [...this.ops]
    const done = new Set<Op>()
    const stall = (message?: string) => {
      result.stalled = true
      if (message !== undefined) result.message = message
    }
    let i = 0
    while (i < queue.length && !result.stalled) {
      const first = queue[i] as Op
      let j = i + 1
      while (j < queue.length && (queue[j] as Op).table === first.table && j - i < BATCH) j++
      const batch = queue.slice(i, j)
      i = j
      if (cancelled()) {
        stall()
        break
      }
      const outcome = await attempt(send, batch)
      if (outcome.ok) {
        result.sent += batch.length
        for (const op of batch) done.add(op)
      } else if (!outcome.denied) {
        stall(outcome.message)
      } else if (batch.length === 1) {
        result.rejected.push(first)
        result.message = outcome.message
        done.add(first)
      } else {
        // One refused write must not sink the others in its batch: send them one by one.
        for (const op of batch) {
          if (cancelled()) {
            stall()
            break
          }
          const one = await attempt(send, [op])
          if (!one.ok && !one.denied) {
            stall(one.message)
            break
          }
          if (one.ok) result.sent++
          else {
            result.rejected.push(op)
            result.message = one.message
          }
          done.add(op)
        }
      }
    }
    // Drop what went (or was refused). A newer write to the same row is a different entry and stays.
    if (done.size > 0) this.record({ kind: 'drop', ops: [...done] })
    await this.persist()
    return result
  }
}

async function attempt(send: SendBatch, ops: readonly Op[]): Promise<SendResult> {
  const first = ops[0] as Op
  try {
    return await send(first.table, first.scope, ops)
  } catch (e) {
    return { ok: false, denied: false, message: e instanceof Error ? e.message : String(e) }
  }
}

/** A store in memory, for tests. Outboxes on one store share its lock, as tabs share a queue. */
export function memoryOutboxStore(initial: Op[] = []): OutboxStore & { saved: Op[]; update: NonNullable<OutboxStore['update']> } {
  let held: Promise<unknown> = Promise.resolve()
  const box = {
    exclusive<T>(work: () => Promise<T>): Promise<T> {
      const run = held.then(work)
      held = run.catch(() => undefined)
      return run
    },
    saved: [...initial],
    load: async () => structuredClone(box.saved),
    save: async (ops: readonly Op[]) => {
      box.saved = structuredClone([...ops])
    },
    // As IndexedDB does: what is saved is a copy, read back as a copy.
    update: async (change: (saved: Op[]) => Op[]) => {
      box.saved = structuredClone(change(structuredClone(box.saved)))
      return structuredClone(box.saved)
    },
  }
  return box
}
