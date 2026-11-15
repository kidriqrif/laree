/**
 * Writes waiting to reach the database, kept on the device so nothing is lost offline or on a
 * reload. Writes are upserts keyed on the record's own id, so sending one twice is harmless.
 */
import { opKey } from './diff.ts'
import type { Op } from './diff.ts'

/** Where the queue is kept between visits. */
export interface OutboxStore {
  /** The saved queue. Rejects when it cannot be read: that is not the same as an empty queue. */
  load(): Promise<Op[]>
  save(ops: readonly Op[]): Promise<void>
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
  private ops: Op[] = []
  private loaded = false
  private saving: Promise<void> = Promise.resolve()
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
   * the queue cannot be read; call it again to retry.
   */
  async load(): Promise<void> {
    if (this.loaded) return
    const saved = await this.store.load()
    if (this.loaded) return
    this.ops = [...saved.filter((o) => !this.ops.some((p) => opKey(p) === opKey(o))), ...this.ops]
    this.loaded = true
    await this.persist()
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
    if (ops.length === 0) return this.saving
    const replaced = new Set(ops.map(opKey))
    this.ops = [...this.ops.filter((o) => !replaced.has(opKey(o))), ...ops]
    // Before the saved queue is read, the write waits in memory; load() saves the merged queue.
    return this.loaded ? this.persist() : Promise.resolve()
  }

  private persist(): Promise<void> {
    const snapshot = [...this.ops]
    this.saving = this.saving
      .then(() => this.store.save(snapshot))
      .then(
        () => this.onSaveState?.(true),
        () => this.onSaveState?.(false),
      )
    return this.saving
  }

  /**
   * Send everything in order, one batch per run of writes to the same table. `cancelled` is asked
   * before every request: a stopped sync sends nothing more.
   */
  async flush(send: SendBatch, cancelled: () => boolean = () => false): Promise<FlushResult> {
    if (!this.loaded) throw new Error('The saved changes have not been read yet')
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
    this.ops = this.ops.filter((o) => !done.has(o))
    await this.persist()
    return result
  }

  async clear(): Promise<void> {
    this.ops = []
    if (this.loaded) await this.persist()
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

/** A store in memory, for tests. */
export function memoryOutboxStore(initial: Op[] = []): OutboxStore & { saved: Op[] } {
  const box = {
    saved: [...initial],
    load: async () => [...box.saved],
    save: async (ops: readonly Op[]) => {
      box.saved = [...ops]
    },
  }
  return box
}
