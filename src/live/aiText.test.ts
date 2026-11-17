import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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

/** Web Locks as a browser shares them between its tabs: one turn at a time. */
function installLocks(): () => void {
  let tail: Promise<unknown> = Promise.resolve()
  const locks = {
    request: (_name: string, work: () => Promise<unknown>) => {
      const run = tail.then(work)
      tail = run.catch(() => undefined)
      return run
    },
  }
  const nav = globalThis.navigator as Navigator & { locks?: unknown }
  const before = Object.getOwnPropertyDescriptor(nav, 'locks')
  Object.defineProperty(nav, 'locks', { value: locks, configurable: true })
  return () => {
    if (before) Object.defineProperty(nav, 'locks', before)
    else delete (nav as { locks?: unknown }).locks
  }
}

let removeLocks: () => void = () => undefined

beforeEach(async () => {
  invoke.mockReset()
  localStorage.clear()
  removeLocks = installLocks()
  await clearPolishedCache()
})

afterEach(() => removeLocks())

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
    await clearPolishedCache()
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
    await otherTab.clearPolishedCache()
    finish(answer)
    expect(await pending).toBeNull()
    expect(localStorage.getItem(CACHE_KEY)).toBeNull()
    // Asked again after that, an answer is kept as usual.
    invoke.mockResolvedValue(answer)
    expect((await polish(draft))?.headline).toBe('Steady week')
  })

  it('removes the kept wording even when the storage is too full for the mark', async () => {
    invoke.mockResolvedValue(answer)
    await polish(draft)
    expect(localStorage.getItem(CACHE_KEY)).not.toBeNull()
    const real = localStorage.setItem.bind(localStorage)
    const full = () => {
      throw new DOMException('full', 'QuotaExceededError')
    }
    Object.defineProperty(localStorage, 'setItem', { value: full, configurable: true, writable: true })
    try {
      expect(() => localStorage.setItem('x', 'y')).toThrow('full')
      // Removed here, but other tabs were not told: the clearing is not complete.
      expect(await clearPolishedCache()).toBe(false)
    } finally {
      Object.defineProperty(localStorage, 'setItem', { value: real, configurable: true, writable: true })
    }
    expect(localStorage.getItem(CACHE_KEY)).toBeNull()
  })

  it('keeps no AI wording on a device without Web Locks, and still shows the answer', async () => {
    // Without the API a write cannot be ordered against a clear in another tab: nothing is kept.
    removeLocks()
    invoke.mockResolvedValue(answer)
    expect((await polish(draft))?.headline).toBe('Steady week')
    expect(localStorage.getItem(CACHE_KEY)).toBeNull()
    // So the next visit asks again.
    await polish(draft)
    expect(invoke).toHaveBeenCalledTimes(2)
  })

  it('lets a clear from another tab wait for a write under way, then remove it', async () => {
    // Each copy of the module is a tab: its own memory, the same storage and locks.
    vi.resetModules()
    const thisTab = await import('./aiText.ts')
    vi.resetModules()
    const otherTab = await import('./aiText.ts')
    invoke.mockResolvedValue(answer)
    const real = localStorage.setItem.bind(localStorage)
    let clearing: Promise<boolean> | null = null
    const racing = (key: string, value: string) => {
      // The other tab asks to clear while this tab is writing: it must wait its turn.
      if (key === CACHE_KEY && !clearing) clearing = otherTab.clearPolishedCache()
      real(key, value)
    }
    Object.defineProperty(localStorage, 'setItem', { value: racing, configurable: true, writable: true })
    try {
      await thisTab.polish(draft)
      expect(await clearing).toBe(true)
    } finally {
      Object.defineProperty(localStorage, 'setItem', { value: real, configurable: true, writable: true })
    }
    expect(clearing).not.toBeNull()
    expect(localStorage.getItem(CACHE_KEY)).toBeNull()
  })

  it('says when the wording could not be removed', async () => {
    const real = localStorage.removeItem.bind(localStorage)
    Object.defineProperty(localStorage, 'removeItem', {
      value: () => {
        throw new DOMException('blocked', 'SecurityError')
      },
      configurable: true,
      writable: true,
    })
    try {
      expect(await clearPolishedCache()).toBe(false)
    } finally {
      Object.defineProperty(localStorage, 'removeItem', { value: real, configurable: true, writable: true })
    }
    expect(await clearPolishedCache()).toBe(true)
  })
})
