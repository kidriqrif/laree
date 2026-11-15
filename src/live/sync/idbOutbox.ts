/** The outbox kept in IndexedDB, one queue per account. Falls back to memory if IndexedDB fails. */
import { createStore, del, get, set } from 'idb-keyval'
import type { Op } from './diff.ts'
import type { OutboxStore } from './outbox.ts'
import { memoryOutboxStore } from './outbox.ts'

export function idbOutboxStore(uid: string): OutboxStore {
  let store: ReturnType<typeof createStore>
  try {
    store = createStore('laree-outbox', 'queues')
  } catch {
    return memoryOutboxStore()
  }
  const key = `outbox:${uid}`
  return {
    load: async () => {
      try {
        const saved = await get<Op[]>(key, store)
        return Array.isArray(saved) ? saved : []
      } catch {
        return []
      }
    },
    save: async (ops) => {
      if (ops.length === 0) await del(key, store)
      else await set(key, [...ops], store)
    },
  }
}
