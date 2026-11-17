import { beforeEach, describe, expect, it, vi } from 'vitest'

const fake = vi.hoisted(() => ({
  client: null as unknown,
  signOut: async (): Promise<string | null> => null,
  clear: async (): Promise<boolean> => true,
}))

// The export is tested up to its first network read: nothing here reaches a server.
vi.mock('./session.ts', () => ({
  AI_LEFT: 'AI wording left',
  supabase: () => {
    if (!fake.client) throw new Error('the export read the server')
    return fake.client
  },
  discardUnsent: async () => undefined,
  signOut: () => fake.signOut(),
}))
vi.mock('./aiConsent.ts', () => ({ aiConsentRecorded: async () => true }))
vi.mock('./aiText.ts', () => ({ clearPolishedCache: () => fake.clear() }))
vi.mock('./files.ts', () => ({
  sendWaitingFiles: async () => undefined,
  dropWaitingFiles: async () => true,
  waitingFileNames: async () => {
    throw new Error('the file queue could not be read')
  },
}))

import { useAccount } from './account.ts'
import type { Account } from './account.ts'
import { deleteMyAccount, exportMyData } from './privacy.ts'

beforeEach(() => {
  fake.client = null
  fake.signOut = async () => null
  fake.clear = async () => true
  useAccount.setState({ notice: null })
})

describe('the data export', () => {
  it('fails when the files waiting on the device cannot be listed', async () => {
    const account = { uid: '00000000-0000-4000-a000-0000000000a1' } as Account
    // A queue that cannot be read does not show that nothing is waiting: no file is made.
    await expect(exportMyData(account)).rejects.toThrow('the file queue could not be read')
  })
})

describe('deleting the account', () => {
  const deleted = () => {
    fake.client = {
      auth: { getSession: async () => ({ data: { session: { user: { id: '00000000-0000-4000-a000-0000000000a1' } } } }) },
      functions: { invoke: async () => ({ data: { ok: true }, error: null }) },
    }
  }

  it('says everything is gone when the device was cleared', async () => {
    deleted()
    expect(await deleteMyAccount()).toBeNull()
    expect(useAccount.getState().notice).toBe('Your account and your data are deleted.')
  })

  it('keeps the warning when the AI wording could not be removed at sign-out', async () => {
    deleted()
    // The first clear works; the one at sign-out does not, and sign-out says so.
    fake.signOut = async () => {
      useAccount.setState({ notice: 'AI wording left' })
      return null
    }
    expect(await deleteMyAccount()).toBeNull()
    expect(useAccount.getState().notice).toMatch(/could not be removed from this device/)
  })
})
