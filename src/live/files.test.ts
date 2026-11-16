import { describe, expect, it, vi } from 'vitest'

// The sender is tested with its own queue and upload: no Supabase client is needed.
vi.mock('./session.ts', () => ({ supabase: () => ({}) }))

import { fileSender, memoryFileQueue } from './files.ts'
import type { Waiting } from './files.ts'

const UID = '00000000-0000-4000-a000-0000000000a1'
const OTHER = '00000000-0000-4000-a000-0000000000b1'
const file = (text: string, name = 'run.gpx') => new File([text], name)

/** An upload the test finishes by hand. */
function slowUpload() {
  const started: Waiting[] = []
  const finish: ((ok: boolean) => void)[] = []
  const upload = (w: Waiting) =>
    new Promise<boolean>((resolve) => {
      started.push(w)
      finish.push(resolve)
    })
  return { upload, started, finish }
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('activity files', () => {
  it('uploads a kept file and takes it off the queue', async () => {
    const queue = memoryFileQueue()
    const sent: string[] = []
    const files = fileSender(queue, async (w) => {
      sent.push(w.path)
      return true
    })
    expect(await files.keep(UID, 'act-1', file('a'))).toBe(true)
    expect(sent).toEqual([`${UID}/act-1.gpx`])
    expect(queue.files.size).toBe(0)
  })

  it('keeps a replacement queued while the old file is uploading, then sends it', async () => {
    const queue = memoryFileQueue()
    const { upload, started, finish } = slowUpload()
    const files = fileSender(queue, upload)
    const first = files.keep(UID, 'act-1', file('old'))
    await settle()
    expect(started).toHaveLength(1)
    // The same session is imported again before the first upload ends.
    const second = files.keep(UID, 'act-1', file('new'))
    await settle()
    finish[0]?.(true)
    await settle()
    // The old upload ended, but the entry on the queue is the new file: it must still be there.
    expect(queue.files.get(`${UID}/act-1.gpx`)?.version).toBe(started[1]?.version)
    expect(await started[1]?.blob.text()).toBe('new')
    finish[1]?.(true)
    await Promise.all([first, second])
    expect(queue.files.size).toBe(0)
  })

  it('sends a file kept after the running pass read the queue', async () => {
    const queue = memoryFileQueue()
    const { upload, started, finish } = slowUpload()
    const files = fileSender(queue, upload)
    const first = files.keep(UID, 'act-1', file('a'))
    await settle()
    const second = files.keep(UID, 'act-2', file('b'))
    await settle()
    finish[0]?.(true)
    await settle()
    expect(started.map((w) => w.path)).toEqual([`${UID}/act-1.gpx`, `${UID}/act-2.gpx`])
    finish[1]?.(true)
    await Promise.all([first, second])
    expect(queue.files.size).toBe(0)
  })

  it('leaves a file waiting when the upload fails, and sends it on the next try', async () => {
    const queue = memoryFileQueue()
    let online = false
    const files = fileSender(queue, async () => online)
    expect(await files.keep(UID, 'act-1', file('a'))).toBe(true)
    expect(queue.files.size).toBe(1)
    online = true
    await files.send(UID)
    expect(queue.files.size).toBe(0)
  })

  it("sends and drops only the signed-in account's files", async () => {
    const queue = memoryFileQueue()
    let online = false
    const sent: string[] = []
    const files = fileSender(queue, async (w) => {
      if (online) sent.push(w.path)
      return online
    })
    await files.keep(OTHER, 'act-9', file('theirs'))
    await files.keep(UID, 'act-1', file('mine'))
    online = true
    await files.send(UID)
    expect(sent).toEqual([`${UID}/act-1.gpx`])
    expect([...queue.files.keys()]).toEqual([`${OTHER}/act-9.gpx`])
    await files.drop(UID)
    expect(queue.files.size).toBe(1)
    await files.drop(OTHER)
    expect(queue.files.size).toBe(0)
  })

  it('says so when the file can neither wait nor be uploaded', async () => {
    const queue = memoryFileQueue()
    queue.put = async () => {
      throw new Error('no storage')
    }
    expect(await fileSender(queue, async () => false).keep(UID, 'act-1', file('a'))).toBe(false)
    expect(await fileSender(queue, async () => true).keep(UID, 'act-1', file('a'))).toBe(true)
  })

  it('says so when waiting files could not be removed', async () => {
    const queue = memoryFileQueue()
    const files = fileSender(queue, async () => false)
    await files.keep(UID, 'act-1', file('a'))
    expect(await files.drop(UID)).toBe(true)
    await files.keep(UID, 'act-2', file('b'))
    queue.removeVersion = async () => {
      throw new Error('blocked')
    }
    expect(await files.drop(UID)).toBe(false)
  })
})
