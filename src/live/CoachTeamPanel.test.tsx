import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const fake = vi.hoisted(() => ({
  updates: [] as unknown[],
  pending: 0,
  synced: 0,
  loads: 0,
  invites: [] as { id: string; email: string; expires_at: string }[],
}))

vi.mock('./session.ts', () => {
  const query = {
    select: () => query,
    is: () => query,
    order: async () => {
      fake.loads += 1
      return { data: fake.invites, error: null }
    },
  }
  return {
    supabase: () => ({
      from: () => ({
        ...query,
        update: (value: unknown) => {
          fake.updates.push(value)
          const result = Promise.resolve({ error: null })
          const chain = Object.assign(result, { eq: () => chain })
          return chain
        },
      }),
    }),
    pendingWrites: () => fake.pending,
    syncNow: async () => {
      fake.synced += 1
    },
    refreshAccount: async () => undefined,
  }
})

import CoachTeamPanel from './CoachTeamPanel.tsx'
import { useAccount } from './account.ts'
import { useSyncStatus } from './sync/syncStatus.ts'
import type { Account, Profile } from './account.ts'

const person = (id: string, role: Profile['role']): Profile => ({
  id,
  role,
  plan: 'free',
  display_name: id,
  focus: '',
  sports: [],
  weight_kg: null,
  baselines: null,
  onboarded_at: '2026-11-17T00:00:00Z',
})

function coachWith(n: number): Account {
  const athletes = Array.from({ length: n }, (_, i) => person(`Athlete ${i + 1}`, 'athlete'))
  return {
    uid: 'coach',
    email: 'coach@example.test',
    profile: person('coach', 'coach'),
    athletes,
    coach: null,
    links: athletes.map((a) => ({ coach_id: 'coach', athlete_id: a.id, ai_access: false })),
  }
}

beforeEach(() => {
  fake.updates = []
  fake.pending = 0
  fake.synced = 0
  fake.loads = 0
  fake.invites = []
  useSyncStatus.setState({ ready: true })
  vi.stubGlobal('confirm', () => true)
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('the coach’s team on the free plan', () => {
  it('shows the places left and keeps the invite open while there is room', () => {
    useAccount.setState({ account: coachWith(2) })
    render(<CoachTeamPanel />)
    expect(screen.getByText(/2 athletes and 0 open invitations, of 3 places/)).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Invite' }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('closes the invite when every place is taken', () => {
    useAccount.setState({ account: coachWith(3) })
    render(<CoachTeamPanel />)
    expect((screen.getByRole('button', { name: 'Invite' }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText(/Your free plan is full/)).toBeTruthy()
  })

  it('does not stop coaching while changes are still waiting to be sent', async () => {
    fake.pending = 1
    useAccount.setState({ account: coachWith(1) })
    render(<CoachTeamPanel />)
    fireEvent.click(screen.getByRole('button', { name: 'Stop coaching' }))
    await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/not been sent yet/))
    expect(fake.synced).toBe(1)
    expect(fake.updates).toEqual([])
  })

  it('stops coaching once nothing is waiting', async () => {
    useAccount.setState({ account: coachWith(1) })
    render(<CoachTeamPanel />)
    fireEvent.click(screen.getByRole('button', { name: 'Stop coaching' }))
    await waitFor(() => expect(fake.updates).toEqual([{ status: 'ended' }]))
  })
  it('does not stop coaching before the saved queue has been read', async () => {
    useSyncStatus.setState({ ready: false })
    useAccount.setState({ account: coachWith(1) })
    render(<CoachTeamPanel />)
    fireEvent.click(screen.getByRole('button', { name: 'Stop coaching' }))
    await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/not been sent yet/))
    expect(fake.updates).toEqual([])
  })

  it('frees an invitation’s place the moment it expires', async () => {
    fake.invites = [{ id: 'i1', email: 'x@example.test', expires_at: new Date(Date.now() + 300).toISOString() }]
    useAccount.setState({ account: coachWith(2) })
    render(<CoachTeamPanel />)
    const invite = () => screen.getByRole('button', { name: 'Invite' }) as HTMLButtonElement
    await waitFor(() => expect(invite().disabled).toBe(true))
    await waitFor(() => expect(invite().disabled).toBe(false), { timeout: 3000 })
  })

  it('loads the invitations again when the account is refreshed', async () => {
    useAccount.setState({ account: coachWith(1) })
    render(<CoachTeamPanel />)
    await waitFor(() => expect(fake.loads).toBe(1))
    act(() => useAccount.setState({ account: coachWith(2) }))
    await waitFor(() => expect(fake.loads).toBe(2))
  })
})
