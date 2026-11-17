import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

interface Call {
  op: string
  table?: string
  value: unknown
}

const fake = vi.hoisted(() => ({
  calls: [] as Call[],
  malaysia: false,
  refreshed: 0,
}))

// What the steps send, recorded instead of reaching a server.
vi.mock('./session.ts', () => ({
  supabase: () => ({
    from: (table: string) => ({
      insert: async (value: unknown) => {
        fake.calls.push({ op: 'insert', table, value })
        return { error: null }
      },
      update: (value: unknown) => ({
        eq: async () => {
          fake.calls.push({ op: 'update', table, value })
          return { error: null }
        },
      }),
    }),
    rpc: async (name: string, value: unknown) => {
      fake.calls.push({ op: `rpc:${name}`, value })
      return { error: null }
    },
  }),
  refreshAccount: async () => {
    fake.refreshed += 1
  },
}))
vi.mock('./region.ts', () => ({
  inMalaysia: () => fake.malaysia,
  deviceTimeZone: () => (fake.malaysia ? 'Asia/Kuala_Lumpur' : 'Europe/London'),
  deviceLocale: () => 'en-GB',
}))

import { Onboarding } from './Onboarding.tsx'
import type { Account } from './account.ts'

const account: Account = {
  uid: 'u1',
  email: 'sam@example.test',
  profile: {
    id: 'u1',
    role: 'athlete',
    plan: 'free',
    display_name: 'sam',
    focus: '',
    sports: [],
    weight_kg: null,
    baselines: null,
    onboarded_at: null,
  },
  athletes: [],
  coach: null,
  links: [],
}

const open = () =>
  render(
    <MemoryRouter>
      <Onboarding account={account} invitations={[]} onLater={() => undefined} />
    </MemoryRouter>,
  )
const click = (name: string | RegExp) => fireEvent.click(screen.getByRole('button', { name }))
const ops = () => fake.calls.map((c) => c.op + (c.table ? `:${c.table}` : ''))

afterEach(cleanup)

beforeEach(() => {
  fake.calls = []
  fake.malaysia = false
  fake.refreshed = 0
})

describe('starting Laree', () => {
  it('asks first whether you train or coach', () => {
    open()
    expect(screen.getByRole('heading', { name: 'Welcome to Laree' })).toBeTruthy()
    click('Next')
    expect(screen.getByRole('status').textContent).toBe('Choose how you will use Laree.')
    expect(screen.queryByRole('heading', { name: 'About you' })).toBeNull()
  })

  it('sets up an athlete outside Malaysia with one agreement', async () => {
    open()
    fireEvent.click(screen.getByRole('radio', { name: /I train/ }))
    click('Next')
    fireEvent.click(screen.getByRole('checkbox', { name: 'Run' }))
    click('Next')
    expect(screen.queryByText(/outside Malaysia/)).toBeNull()
    expect(screen.getByText(/Ask them to invite sam@example.test/)).toBeTruthy()
    click('Start')
    expect(screen.getByRole('status').textContent).toMatch(/needs this agreement/)
    fireEvent.click(screen.getByRole('checkbox', { name: /training and health data/ }))
    click('Start')
    await waitFor(() => expect(fake.refreshed).toBe(1))
    expect(ops()).toEqual(['insert:consents', 'rpc:choose_role', 'update:profiles'])
    expect(fake.calls[0]?.value).toEqual([{ purpose: 'health_data', granted: true, text_version: '2026-11' }])
    expect(fake.calls[1]?.value).toEqual({ chosen: 'athlete' })
    expect(fake.calls[2]?.value).toMatchObject({ display_name: 'sam', sports: ['run'], locale: 'en-GB', time_zone: 'Europe/London' })
  })

  it('asks a device in Malaysia to agree to storage in Singapore too', async () => {
    fake.malaysia = true
    open()
    fireEvent.click(screen.getByRole('radio', { name: /I train/ }))
    click('Next')
    click('Next')
    fireEvent.click(screen.getByRole('checkbox', { name: /training and health data/ }))
    click('Start')
    expect(screen.getByRole('status').textContent).toMatch(/store your data in Singapore/)
    fireEvent.click(screen.getByRole('checkbox', { name: /outside Malaysia/ }))
    click('Start')
    await waitFor(() => expect(fake.refreshed).toBe(1))
    expect(fake.calls[0]?.value).toEqual([
      { purpose: 'health_data', granted: true, text_version: '2026-11' },
      { purpose: 'cross_border', granted: true, text_version: '2026-11' },
    ])
  })

  it('sets up a coach on the free plan, then offers a first invitation', async () => {
    open()
    fireEvent.click(screen.getByRole('radio', { name: /I coach/ }))
    click('Next')
    expect(screen.getByText('Your name, as your athletes see it')).toBeTruthy()
    click('Next')
    expect(screen.getByText(/room for 3 athletes at a time/)).toBeTruthy()
    expect(screen.queryByRole('checkbox')).toBeNull()
    click('Start')
    await screen.findByRole('heading', { name: 'Invite your first athlete' })
    expect(ops()).toEqual(['rpc:choose_role', 'update:profiles'])
    expect(fake.calls[0]?.value).toEqual({ chosen: 'coach' })
    expect(fake.refreshed).toBe(0)
    click('Skip for now')
    await waitFor(() => expect(fake.refreshed).toBe(1))
  })

  it('lets a coach invite their first athlete', async () => {
    open()
    fireEvent.click(screen.getByRole('radio', { name: /I coach/ }))
    click('Next')
    click('Next')
    click('Start')
    await screen.findByRole('heading', { name: 'Invite your first athlete' })
    fireEvent.change(screen.getByLabelText('Their email'), { target: { value: ' Ann@Example.test ' } })
    click('Invite')
    await waitFor(() => expect(fake.refreshed).toBe(1))
    expect(fake.calls.at(-1)).toEqual({ op: 'insert', table: 'invitations', value: { coach_id: 'u1', email: 'ann@example.test' } })
  })
})
