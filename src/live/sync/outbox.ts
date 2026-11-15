/**
 * Writes waiting to reach the database, kept on the device so nothing is lost offline or on a
 * reload. Writes are upserts keyed on the record's own id, so sending one twice is harmless.
 */
import { opKey } from './diff.ts'
import type { Op } from './diff.ts'

/** Where the queue is kept between visits. */
export interface OutboxStore {
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
  /** Stopped early on a network or server error. The rest stays queued. */
  stalled: boolean
  message?: string
}

export class Outbox {
  private ops: Op[] = []
  private saving: Promise<void> = Promise.resolve()
  private readonly store: OutboxStore
  /** Called when the queue could not be written to the device. */
  onSaveError: ((e: unknown) => void) | null = null

  constructor(store: OutboxStore) {
    this.store = store
  }

  async load(): Promise<void> {
    const saved = await this.store.load()
    // Writes made before the load finished come after the saved ones. Save the merged queue at
    // once, so an early save of only the new writes is never the last word.
    this.ops = [...saved.filter((o) => !this.ops.some((p) => opKey(p) === opKey(o))), ...this.ops]
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
    return this.persist()
  }

  private persist(): Promise<void> {
    const snapshot = [...this.ops]
    this.saving = this.saving
      .then(() => this.store.save(snapshot))
      .catch((e: unknown) => {
        this.onSaveError?.(e)
      })
    return this.saving
  }

  /** Send everything in order, one batch per run of writes to the same table. */
  async flush(send: SendBatch): Promise<FlushResult> {
    const result: FlushResult = { sent: 0, rejected: [], stalled: false }
    const queue = [...this.ops]
    let i = 0
    while (i < queue.length) {
      const first = queue[i] as Op
      let j = i + 1
      while (j < queue.length && (queue[j] as Op).table === first.table && j - i < 500) j++
      const batch = queue.slice(i, j)
      let outcome = await attempt(send, batch)
      // One refused write must not sink the others in its batch: send them one by one instead.
      if (!outcome.ok && outcome.denied && batch.length > 1) {
        const done = new Set<Op>()
        for (const op of batch) {
          const one = await attempt(send, [op])
          if (!one.ok && !one.denied) {
            outcome = one
            break
          }
          if (one.ok) result.sent++
          else {
            result.rejected.push(op)
            result.message = one.message
          }
          done.add(op)
        }
        this.ops = this.ops.filter((o) => !done.has(o))
        if (!outcome.ok && !outcome.denied) {
          result.stalled = true
          result.message = outcome.message
          break
        }
        i = j
        continue
      }
      if (!outcome.ok && !outcome.denied) {
        result.stalled = true
        result.message = outcome.message
        break
      }
      if (!outcome.ok) {
        result.rejected.push(...batch)
        result.message = outcome.message
      } else result.sent += batch.length
      // Drop what went (or was refused), unless a newer write to the row arrived meanwhile.
      const done = new Set(batch)
      this.ops = this.ops.filter((o) => !done.has(o))
      i = j
    }
    await this.persist()
    return result
  }

  async clear(): Promise<void> {
    this.ops = []
    await this.persist()
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

/** A store in memory, for tests and for a browser that cannot open IndexedDB. */
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
