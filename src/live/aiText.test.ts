import { beforeEach, describe, expect, it, vi } from 'vitest'

const invoke = vi.fn<(name: string, options: unknown) => Promise<unknown>>()
vi.mock('./session.ts', () => ({ supabase: () => ({ functions: { invoke } }) }))

import type { AiRecapOutput } from '../ai/types.ts'
import { clearPolishedCache, polish } from './aiText.ts'

const CACHE_KEY = 'laree:live:ai'
const draft = {
  status: 'ok',
  feature: 'recap',
  athleteId: '00000000-0000-4000-a000-0000000000a1',
  headline: 'A steady week',
  lines: ['You ran 12 km.'],
} as unknown as Extract<AiRecapOutput, { status: 'ok' }>
const answer = { data: { ok: true, headline: 'Steady week', lines: ['A 12 km run.'], provider: 'Mock', model: 'mock-1' }, error: null }

beforeEach(() => {
  invoke.mockReset()
  localStorage.clear()
  clearPolishedCache()
})

describe('AI wording on the device', () => {
  it('keeps an answer, and does not ask twice for the same draft', async () => {
    invoke.mockResolvedValue(answer)
    expect((await polish(draft))?.headline).toBe('Steady week')
    expect(localStorage.getItem(CACHE_KEY)).toContain('Steady week')
    await polish(draft)
    expect(invoke).toHaveBeenCalledTimes(1)
  })

  it('neither keeps nor returns an answer that arrives after the cache was cleared', async () => {
    let finish: (v: typeof answer) => void = () => undefined
    invoke.mockReturnValue(new Promise((resolve) => (finish = resolve)))
    const pending = polish(draft)
    // Sign-out or account deletion lands while the request is on its way.
    clearPolishedCache()
    finish(answer)
    expect(await pending).toBeNull()
    expect(localStorage.getItem(CACHE_KEY)).toBeNull()
  })

  it('neither keeps nor returns an answer when another tab cleared the cache meanwhile', async () => {
    // A second copy of the module is another tab: its own memory, the same storage.
    vi.resetModules()
    const otherTab = await import('./aiText.ts')
    let finish: (v: typeof answer) => void = () => undefined
    invoke.mockReturnValue(new Promise((resolve) => (finish = resolve)))
    const pending = polish(draft)
    // The person signs out, or deletes the account, in the other tab.
    otherTab.clearPolishedCache()
    finish(answer)
    expect(await pending).toBeNull()
    expect(localStorage.getItem(CACHE_KEY)).toBeNull()
    // Asked again after that, an answer is kept as usual.
    invoke.mockResolvedValue(answer)
    expect((await polish(draft))?.headline).toBe('Steady week')
  })
})
