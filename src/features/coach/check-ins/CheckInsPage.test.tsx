import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { createMemoryRouter } from 'react-router'
import { RouterProvider } from 'react-router/dom'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { routes } from '../../../app/router.tsx'
import { useViewer } from '../../../app/viewer.ts'
import { fmtDay } from '../../../charts/index.ts'
import { currentDay } from '../../../data/selectors.ts'
import { useLaree } from '../../../data/store.ts'
import type { AthleteId } from '../../../domain/types.ts'
import { FlagDrawerSlot } from '../athlete/FlagDrawerSlot.tsx'
import { filterFlags } from './model.ts'

beforeEach(() => {
  localStorage.clear()
  useLaree.getState().reset()
  useViewer.setState({ role: 'coach', athleteId: 'amir', coachAthleteId: 'amir', chosen: true })
})
afterEach(cleanup)

async function renderPage(search = '') {
  const router = createMemoryRouter(routes, { initialEntries: [`/coach/check-ins${search}`] })
  render(<RouterProvider router={router} />)
  await screen.findByRole('heading', { level: 1, name: 'Check-ins' })
  return router
}

const allFlags = () =>
  (['amir', 'danial', 'irfan'] as AthleteId[]).flatMap((a) => useLaree.getState().data.flagsState[a].flags)
const firstOpen = () => {
  const f = filterFlags(allFlags(), 'open', currentDay())[0]
  if (!f) throw new Error('seed has no open flag')
  return f
}
const record = (f: { id: string; athleteId: string }) =>
  useLaree.getState().data.flagsState[f.athleteId as AthleteId].flags.find((x) => x.id === f.id)

describe('check-ins grid', () => {
  it('shows values for a seeded athlete and a missing day as missing, never zero', async () => {
    const today = currentDay()
    const day = today - 3
    useLaree.setState((s) => ({
      data: { ...s.data, checkIns: s.data.checkIns.filter((c) => !(c.athleteId === 'amir' && c.day === day)) },
    }))
    await renderPage()
    const grid = await screen.findByRole('grid', { name: /Sleep/ })
    const missing = within(grid).getByLabelText(`Amir, ${fmtDay(day)}: no data`)
    expect(missing.textContent).toBe('')
    const present = useLaree.getState().data.checkIns.find((c) => c.athleteId === 'amir' && c.day === today - 1)
    expect(present).toBeTruthy()
    expect(
      within(grid).getByLabelText(`Amir, ${fmtDay(today - 1)}: Sleep ${present!.sleepHours.toFixed(1)} h`),
    ).toBeTruthy()
  })

  it('changes metric through the URL', async () => {
    const router = await renderPage()
    fireEvent.click(await screen.findByRole('radio', { name: 'HRV' }))
    await waitFor(() => expect(router.state.location.search).toContain('metric=hrv'))
    await screen.findByRole('grid', { name: /HRV/ })
  })
})

describe('flag inbox', () => {
  it('filters by status and keeps it in the URL', async () => {
    const router = await renderPage()
    const active = allFlags().filter((f) => f.status !== 'resolved').length
    expect(active).toBeGreaterThan(0)
    expect(screen.getAllByTestId('inbox-row')).toHaveLength(active)
    fireEvent.click(screen.getByRole('radio', { name: 'Resolved' }))
    await waitFor(() => expect(router.state.location.search).toContain('status=resolved'))
    const resolved = filterFlags(allFlags(), 'resolved', currentDay()).length
    await waitFor(() => expect(screen.queryAllByTestId('inbox-row')).toHaveLength(resolved))
    expect(screen.queryByText('No flags resolved in the last 28 days.') !== null).toBe(resolved === 0)
  })

  it('reads the status from the URL', async () => {
    await renderPage('?status=all')
    const n = allFlags().length
    expect(screen.queryAllByTestId('inbox-row')).toHaveLength(n)
  })

  it('opening a flag acknowledges it', async () => {
    const f = firstOpen()
    const router = await renderPage()
    const row = screen.getAllByTestId('inbox-row')[0]!
    fireEvent.click(row)
    await screen.findByTestId('flag-detail')
    await waitFor(() => expect(router.state.location.search).toContain('flag='))
    await waitFor(() => expect(record(f)?.status).toBe('acknowledged'))
  })

  it('resolving needs a note', async () => {
    const f = firstOpen()
    await renderPage(`?flag=${encodeURIComponent(f.id)}`)
    const drawer = await screen.findByTestId('flag-detail')
    fireEvent.click(within(drawer).getByRole('button', { name: 'Resolve' }))
    fireEvent.click(within(drawer).getByRole('button', { name: 'Resolve flag' }))
    await within(drawer).findByText(/Add a note/)
    expect(record(f)?.status).not.toBe('resolved')
    fireEvent.change(within(drawer).getByRole('textbox'), { target: { value: 'Spoke to them, easy week.' } })
    fireEvent.click(within(drawer).getByRole('button', { name: 'Resolve flag' }))
    await waitFor(() => expect(record(f)?.status).toBe('resolved'))
    expect(record(f)?.notes.at(-1)?.text).toBe('Spoke to them, easy week.')
  })

  it('j moves the selection', async () => {
    await renderPage()
    const rows = screen.getAllByTestId('inbox-row')
    expect(rows.length).toBeGreaterThan(1)
    expect(rows[0]!.getAttribute('aria-current')).toBe('true')
    fireEvent.keyDown(document.body, { key: 'j' })
    await waitFor(() => expect(screen.getAllByTestId('inbox-row')[1]!.getAttribute('aria-current')).toBe('true'))
  })
})

describe('check-in detail', () => {
  it('opens from the URL', async () => {
    const day = currentDay() - 1
    await renderPage(`?checkin=amir:${day}`)
    const drawer = await screen.findByTestId('checkin-detail')
    expect(within(drawer).getByText('Last 14 days')).toBeTruthy()
  })
})

describe('FlagDrawerSlot', () => {
  it('opens the given flag', async () => {
    const f = firstOpen()
    const router = createMemoryRouter(
      [{ path: '/', element: <FlagDrawerSlot athleteId={f.athleteId as AthleteId} flagId={f.id} onClose={() => {}} /> }],
      { initialEntries: ['/'] },
    )
    render(<RouterProvider router={router} />)
    const drawer = await screen.findByTestId('flag-detail')
    expect(within(drawer).getByText(f.explanation)).toBeTruthy()
  })
})
