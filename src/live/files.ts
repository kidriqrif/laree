/**
 * Original activity files go to the private bucket at {athlete_id}/{activity_id}.{ext}. A file
 * waits in IndexedDB until the upload succeeds, so a log made offline keeps its file too.
 */
import { createStore, entries, promisifyRequest, set } from 'idb-keyval'
import { supabase } from './session.ts'

export interface Waiting {
  path: string
  blob: Blob
  /** A new value for every file kept: a replacement queued during an upload is another version. */
  version: string
}

/** Where files wait. */
export interface FileQueue {
  put(w: Waiting): Promise<void>
  list(): Promise<Waiting[]>
  /** Remove the file at this path, but only while it is still this version. */
  removeVersion(path: string, version: string): Promise<void>
}

/** True when the file reached the bucket. */
export type Upload = (w: Waiting) => Promise<boolean>

const BUCKET = 'activity-files'

const extension = (name: string): string => {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  return ['fit', 'gpx', 'tcx'].includes(ext) ? ext : 'bin'
}

export function fileSender(queue: FileQueue, upload: Upload) {
  /** One run per account at a time. */
  const runs = new Map<string, Promise<void>>()
  /** Accounts whose queue changed while their run was going: it runs once more. */
  const again = new Set<string>()

  /** This account's files. Another account's files on a shared device are left alone. */
  const waitingFor = async (uid: string): Promise<Waiting[]> => (await queue.list()).filter((w) => w.path.startsWith(`${uid}/`))

  /** Upload until nothing is left or an upload fails. The queue is read again after each pass that sent a file. */
  async function drain(uid: string): Promise<void> {
    for (;;) {
      const waiting = await waitingFor(uid)
      let sent = 0
      for (const w of waiting) {
        if (!(await upload(w))) return
        // A replacement kept during the upload has another version: it stays, and the next pass sends it.
        await queue.removeVersion(w.path, w.version)
        sent++
      }
      if (sent === 0) return
    }
  }

  function send(uid: string): Promise<void> {
    const running = runs.get(uid)
    if (running) {
      again.add(uid)
      return running
    }
    const run = (async () => {
      try {
        do {
          again.delete(uid)
          await drain(uid)
        } while (again.has(uid))
      } catch {
        // Offline or storage blocked: the files wait for the next try.
      } finally {
        again.delete(uid)
        runs.delete(uid)
      }
    })()
    runs.set(uid, run)
    return run
  }

  return {
    /** Keep a log's original file. False when it could neither wait on the device nor be uploaded. */
    async keep(athleteId: string, activityId: string, file: File): Promise<boolean> {
      const w: Waiting = { path: `${athleteId}/${activityId}.${extension(file.name)}`, blob: file, version: crypto.randomUUID() }
      try {
        await queue.put(w)
      } catch {
        // No storage on the device: try the upload once, without a copy kept for later.
        return upload(w).catch(() => false)
      }
      await send(athleteId)
      return true
    },
    send,
    /** Forget this account's waiting files on this device (after the account is deleted). */
    async drop(uid: string): Promise<void> {
      try {
        for (const w of await waitingFor(uid)) await queue.removeVersion(w.path, w.version)
      } catch {
        // Nothing could be read, so nothing is kept to drop.
      }
    },
  }
}

/** A queue in memory, for tests. */
export function memoryFileQueue(): FileQueue & { files: Map<string, Waiting> } {
  const files = new Map<string, Waiting>()
  return {
    files,
    put: async (w) => void files.set(w.path, w),
    list: async () => [...files.values()],
    removeVersion: async (path, version) => {
      if (files.get(path)?.version === version) files.delete(path)
    },
  }
}

function idbFileQueue(): FileQueue {
  let store: ReturnType<typeof createStore> | null = null
  const files = () => (store ??= createStore('laree-files', 'waiting'))
  return {
    put: (w) => set(w.path, w, files()),
    // A file kept before versions existed has none: it reads as the empty version.
    list: async () => (await entries<string, Waiting>(files())).map(([, w]) => ({ ...w, version: w.version ?? '' })),
    // Read and delete in one transaction, so a file put in between is never the one deleted.
    removeVersion: (path, version) =>
      files()('readwrite', (os) => {
        const read = os.get(path)
        read.onsuccess = () => {
          const found = read.result as Partial<Waiting> | undefined
          if (found && (found.version ?? '') === version) os.delete(path)
        }
        return promisifyRequest(os.transaction)
      }),
  }
}

async function uploadToBucket(w: Waiting): Promise<boolean> {
  const { error } = await supabase()
    .storage.from(BUCKET)
    // upsert: a file imported again for the same session replaces the old one.
    .upload(w.path, w.blob, { contentType: 'application/octet-stream', upsert: true })
  return !error
}

const sender = fileSender(idbFileQueue(), uploadToBucket)

export const keepActivityFile = sender.keep
/** Upload this account's waiting files. */
export const sendWaitingFiles = sender.send
export const dropWaitingFiles = sender.drop
