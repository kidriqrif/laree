import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The follower is tested against its own server: no Supabase client is needed.
vi.mock('./session.ts', () => ({ supabase: () => ({}) }))

import { emptyLiveData, useLaree } from '../data/store.ts'
import type { Settings } from '../domain/types.ts'
import { followAiConsent } from './aiConsent.ts'
import type { ConsentServer } from './aiConsent.ts'

const UID = '00000000-0000-4000-a000-0000000000a1'

function setSwitch(on: boolean): void {
  useLaree.setState((s) => ({
    data: { ...s.data, settings: { ...s.data.settings, [UID]: { ...s.data.settings[UID], owner: UID, aiConsent: on } as Settings } },
  }))
}

/** A consents table. Requests finish when the test lets them, in the order it chooses. */
function fakeConsents() {
  const rows: boolean[] = []
  let online = true
  let hold = false
  const held: (() => void)[] = []
  const pass = async () => {
    if (!online) throw new TypeError('Failed to fetch')
    if (hold) await new Promise<void>((resolve) => held.push(resolve))
  }
  const server: ConsentServer = {
    async latest() {
      if (!online) throw new TypeError('Failed to fetch')
      return rows.at(-1) ?? false
    },
    async add(_uid, granted) {
      await pass()
      rows.push(granted)
    },
  }
  return {
    server,
    rows,
    held,
    setOnline: (v: boolean) => void (online = v),
    setHold: (v: boolean) => void (hold = v),
  }
}

const settle = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve()
}

const stops: (() => void)[] = []
const follow = (server: ConsentServer) => {
  const stop = followAiConsent(UID, server, 50)
  stops.push(stop)
  return stop
}

beforeEach(() => {
  useLaree.setState({ data: emptyLiveData(), undoStack: [] })
})

afterEach(() => {
  for (const stop of stops.splice(0)) stop()
  vi.useRealTimers()
})

describe('the AI consent record', () => {
  it('adds a row only when the answer changes', async () => {
    const c = fakeConsents()
    follow(c.server)
    await settle()
    expect(c.rows).toEqual([])
    setSwitch(true)
    await settle()
    setSwitch(true)
    await settle()
    expect(c.rows).toEqual([true])
    setSwitch(false)
    await settle()
    expect(c.rows).toEqual([true, false])
  })

  it('records a withdrawal made before the grant was written', async () => {
    const c = fakeConsents()
    follow(c.server)
    await settle()
    c.setHold(true)
    setSwitch(true)
    await settle()
    // The grant is still on its way when the person turns AI off again.
    setSwitch(false)
    await settle()
    expect(c.rows).toEqual([])
    c.setHold(false)
    c.held.shift()?.()
    await settle()
    expect(c.rows).toEqual([true, false])
  })

  it('keeps a change that failed and records it when the device is back online', async () => {
    const c = fakeConsents()
    c.rows.push(true)
    setSwitch(true)
    follow(c.server)
    await settle()
    c.setOnline(false)
    setSwitch(false)
    await settle()
    expect(c.rows).toEqual([true])
    c.setOnline(true)
    globalThis.dispatchEvent(new Event('online'))
    await settle()
    expect(c.rows).toEqual([true, false])
  })

  it('tries a failed change again after a while, without any other change', async () => {
    vi.useFakeTimers()
    const c = fakeConsents()
    c.setOnline(false)
    setSwitch(true)
    follow(c.server)
    await vi.advanceTimersByTimeAsync(10)
    expect(c.rows).toEqual([])
    c.setOnline(true)
    await vi.advanceTimersByTimeAsync(60)
    expect(c.rows).toEqual([true])
  })

  it('writes nothing after it is stopped', async () => {
    const c = fakeConsents()
    let release: () => void = () => undefined
    const slow: ConsentServer = {
      latest: () => new Promise((resolve) => (release = () => resolve(false))),
      add: c.server.add,
    }
    setSwitch(true)
    const stop = follow(slow)
    await settle()
    // Sign-out lands while the first read is on its way.
    stop()
    release()
    await settle()
    expect(c.rows).toEqual([])
  })

  it('waits for the work of an earlier follower of the same account', async () => {
    const c = fakeConsents()
    const first = follow(c.server)
    await settle()
    c.setHold(true)
    setSwitch(true)
    await settle()
    // The account is loaded again: a new follower starts while the grant is still on its way.
    first()
    setSwitch(false)
    follow(c.server)
    await settle()
    expect(c.rows).toEqual([])
    c.setHold(false)
    c.held.shift()?.()
    await settle()
    expect(c.rows).toEqual([true, false])
  })

  it('names the account in every row', async () => {
    const seen: string[] = []
    const c = fakeConsents()
    follow({ latest: c.server.latest, add: async (uid, granted) => (seen.push(uid), c.server.add(uid, granted)) })
    setSwitch(true)
    await settle()
    expect(seen).toEqual([UID])
  })

  it('records nothing while the settings have not arrived, and no withdrawal when they do', async () => {
    const c = fakeConsents()
    c.rows.push(true)
    // A new device: the store is empty until the first sync brings the settings.
    follow(c.server)
    await settle()
    expect(c.rows).toEqual([true])
    setSwitch(true)
    await settle()
    expect(c.rows).toEqual([true])
    setSwitch(false)
    await settle()
    expect(c.rows).toEqual([true, false])
  })

  it('reads the server again after a request that failed but was recorded', async () => {
    const c = fakeConsents()
    setSwitch(false)
    let lost = true
    // The grant reaches the server, but its answer is lost on the way back.
    const flaky: ConsentServer = {
      latest: c.server.latest,
      add: async (uid, granted) => {
        await c.server.add(uid, granted)
        if (lost) {
          lost = false
          throw new TypeError('Failed to fetch')
        }
      },
    }
    follow(flaky)
    await settle()
    setSwitch(true)
    await settle()
    expect(c.rows).toEqual([true])
    // The person withdraws before any retry. The server holds a grant the device never saw confirmed.
    setSwitch(false)
    await settle()
    expect(c.rows).toEqual([true, false])
  })
})
