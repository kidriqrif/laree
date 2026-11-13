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

const WITHDRAWN_KEY = 'laree:ai-withdrawn'

function sessionArea(): Storage | null {
  try {
    return sessionStorage
  } catch {
    return null
  }
}

function readNote(s: Storage | null): string[] {
  try {
    const raw = s?.getItem(WITHDRAWN_KEY)
    const v: unknown = raw ? JSON.parse(raw) : []
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

/** Write one note into one store. False when that store would not keep it. */
function writeNote(s: Storage | null, owner: string, withdrawn: boolean): boolean {
  if (!s) return false
  try {
    const next = readNote(s).filter((o) => o !== owner)
    if (withdrawn) next.push(owner)
    if (next.length === 0) s.removeItem(WITHDRAWN_KEY)
    else s.setItem(WITHDRAWN_KEY, JSON.stringify(next))
    return true
  } catch {
    return false
  }
}

/**
 * Who turned AI off while the main save was failing. The store applies this list when it loads,
 * so a reload cannot bring back consent that was withdrawn. Reads the local note and the
 * session note and merges them. Nothing leaves the device.
 */
export function readAiWithdrawn(): string[] {
  return [...new Set([...readNote(area()), ...readNote(sessionArea())])]
}

/**
 * Record or clear one person's withdrawal. A withdrawal goes to localStorage; only when that
 * fails does it go to sessionStorage, which has its own quota. Clearing removes it from both.
 * Says where the note was kept: 'local' lasts, 'session' ends when the browser closes, and
 * null means neither store would keep even this small note.
 */
export function noteAiWithdrawn(owner: string, withdrawn: boolean): 'local' | 'session' | null {
  if (!withdrawn) {
    const a = writeNote(area(), owner, false)
    const b = writeNote(sessionArea(), owner, false)
    return a ? 'local' : b ? 'session' : null
  }
  if (writeNote(area(), owner, true)) {
    writeNote(sessionArea(), owner, false)
    return 'local'
  }
  return writeNote(sessionArea(), owner, true) ? 'session' : null
}

/** Forget every withdrawal note, in both stores. Reset does this: nothing of the old choices is left behind. */
export function clearAiWithdrawn(): void {
  for (const s of [area(), sessionArea()]) {
    try {
      s?.removeItem(WITHDRAWN_KEY)
    } catch {
      // Nothing to clear in a browser that keeps nothing.
    }
  }
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
