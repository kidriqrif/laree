/**
 * Storage layer for the store. Reads and writes never throw: when the browser will not keep data
 * (blocked, private window, full) the store carries on in memory and the failure is announced to
 * listeners, which show the storage banner (S8). Text that cannot be parsed is reported as
 * unreadable instead of crashing the app.
 */
import { createJSONStorage } from 'zustand/middleware'
import type { PersistStorage, StateStorage } from 'zustand/middleware'

export const STORE_KEY = 'laree:v1'

type Listener = (failed: boolean) => void

let failed = false
let unreadable = false
const listeners = new Set<Listener>()

function setFailed(next: boolean): void {
  if (failed === next) return
  failed = next
  for (const l of listeners) l(failed)
}

/** True while the last read or write could not reach browser storage. */
export function isStorageFailed(): boolean {
  return failed
}

/** True if saved text was found but could not be read. */
export function isSavedDataUnreadable(): boolean {
  return unreadable
}

/** Call a listener now and on every change. Returns the unsubscribe function. */
export function onStorageStatus(listener: Listener): () => void {
  listeners.add(listener)
  listener(failed)
  return () => {
    listeners.delete(listener)
  }
}

/** Test hook: forget the failure state. */
export function resetStorageStatus(): void {
  failed = false
  unreadable = false
}

function area(): Storage | null {
  try {
    return localStorage
  } catch {
    return null
  }
}

export const safeStringStorage: StateStorage = {
  getItem(name) {
    const s = area()
    if (!s) {
      setFailed(true)
      return null
    }
    try {
      const raw = s.getItem(name)
      if (raw === null) return null
      try {
        JSON.parse(raw)
      } catch {
        unreadable = true
        return null
      }
      return raw
    } catch {
      setFailed(true)
      return null
    }
  },
  setItem(name, value) {
    const s = area()
    if (!s) {
      setFailed(true)
      return
    }
    try {
      s.setItem(name, value)
      setFailed(false)
    } catch {
      // Quota exceeded or writes blocked: keep working in memory.
      setFailed(true)
    }
  },
  removeItem(name) {
    try {
      area()?.removeItem(name)
    } catch {
      setFailed(true)
    }
  },
}

export function createLareeStorage<S>(): PersistStorage<S> {
  // createJSONStorage returns undefined only when the getter throws; ours never does.
  return createJSONStorage<S>(() => safeStringStorage) as PersistStorage<S>
}

/** The unparsed saved text, so the unreadable data can be downloaded before a reset. */
export function readRawSaved(): string | null {
  try {
    return area()?.getItem(STORE_KEY) ?? null
  } catch {
    return null
  }
}
