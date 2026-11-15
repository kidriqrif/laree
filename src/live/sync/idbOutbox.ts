/** The outbox kept in IndexedDB, one queue per account. */
import { createStore, del, get, set } from 'idb-keyval'
import type { Op } from './diff.ts'
import type { OutboxStore } from './outbox.ts'

export function idbOutboxStore(uid: string): OutboxStore {
  let store: ReturnType<typeof createStore>
  try {
    store = createStore('laree-outbox', 'queues')
  } catch {
    // No IndexedDB in this browser: nothing was kept, and nothing can be. Saving a non-empty
    // queue fails, so the app says the changes are not safe on this device.
    return {
      load: async () => [],
      save: async (ops) => {
        if (ops.length > 0) throw new Error('This browser has no storage for unsent changes')
      },
    }
  }
  const key = `outbox:${uid}`
  return {
    // A failed read rejects: the caller must not treat an unreadable queue as an empty one.
    load: async () => {
      const saved = await get<Op[]>(key, store)
      return Array.isArray(saved) ? saved : []
    },
    save: async (ops) => {
      if (ops.length === 0) await del(key, store)
      else await set(key, [...ops], store)
    },
  }
}
