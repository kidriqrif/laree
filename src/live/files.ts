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

export async function keepActivityFile(athleteId: string, activityId: string, file: File): Promise<void> {
  const path = `${athleteId}/${activityId}.${extension(file.name)}`
  try {
    await set(path, { path, blob: file } satisfies Waiting, files())
  } catch {
    // No IndexedDB: try the upload once, without a copy kept for later.
    await upload({ path, blob: file })
    return
  }
  await sendWaitingFiles()
}

async function upload(w: Waiting): Promise<boolean> {
  const { error } = await supabase()
    .storage.from(BUCKET)
    .upload(w.path, w.blob, { contentType: 'application/octet-stream', upsert: false })
  // Already there: an earlier try got through.
  return !error || /exists|duplicate/i.test(error.message)
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
