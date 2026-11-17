import { describe, expect, it, vi } from 'vitest'

// The export is tested up to its first network read: nothing here reaches a server.
vi.mock('./session.ts', () => ({
  supabase: () => {
    throw new Error('the export read the server')
  },
  discardUnsent: vi.fn<(uid: string) => Promise<void>>(),
  signOut: vi.fn<() => Promise<string | null>>(),
}))
vi.mock('./aiConsent.ts', () => ({ aiConsentRecorded: async () => true }))
vi.mock('./files.ts', () => ({
  sendWaitingFiles: async () => undefined,
  dropWaitingFiles: async () => true,
  waitingFileNames: async () => {
    throw new Error('the file queue could not be read')
  },
}))

import type { Account } from './account.ts'
import { exportMyData } from './privacy.ts'

describe('the data export', () => {
  it('fails when the files waiting on the device cannot be listed', async () => {
    const account = { uid: '00000000-0000-4000-a000-0000000000a1' } as Account
    // A queue that cannot be read does not show that nothing is waiting: no file is made.
    await expect(exportMyData(account)).rejects.toThrow('the file queue could not be read')
  })
})
