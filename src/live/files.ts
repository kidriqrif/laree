/**
 * Original activity files go to the private bucket at {athlete_id}/{activity_id}.{ext}. A file
 * waits in IndexedDB until the upload succeeds, so a log made offline keeps its file too.
 */
import { createStore, del, entries, set } from 'idb-keyval'
import { supabase } from './session.ts'

interface Waiting {
  path: string
  blob: Blob
}

const BUCKET = 'activity-files'
let store: ReturnType<typeof createStore> | null = null
const files = () => (store ??= createStore('laree-files', 'waiting'))

const extension = (name: string): string => {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  return ['fit', 'gpx', 'tcx'].includes(ext) ? ext : 'bin'
}

/** Keep a log's original file. False when it could neither wait on the device nor be uploaded. */
export async function keepActivityFile(athleteId: string, activityId: string, file: File): Promise<boolean> {
  const path = `${athleteId}/${activityId}.${extension(file.name)}`
  try {
    await set(path, { path, blob: file } satisfies Waiting, files())
  } catch {
    // No IndexedDB: try the upload once, without a copy kept for later.
    return upload({ path, blob: file }).catch(() => false)
  }
  await sendWaitingFiles()
  return true
}

async function upload(w: Waiting): Promise<boolean> {
  const { error } = await supabase()
    .storage.from(BUCKET)
    // upsert: a file imported again for the same session replaces the old one.
    .upload(w.path, w.blob, { contentType: 'application/octet-stream', upsert: true })
  return !error
}

let sending: Promise<void> | null = null

/** Upload every waiting file. Safe to call often: one run at a time. */
export function sendWaitingFiles(): Promise<void> {
  sending ??= (async () => {
    try {
      for (const [, value] of await entries<string, Waiting>(files())) {
        if (await upload(value)) await del(value.path, files())
        else break
      }
    } catch {
      // Offline or storage blocked: the files wait for the next try.
    } finally {
      sending = null
    }
  })()
  return sending
}
