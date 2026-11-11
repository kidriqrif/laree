import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createMemoryRouter } from 'react-router'
import { RouterProvider } from 'react-router/dom'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { routes } from '../../../app/router.tsx'
import { useViewer } from '../../../app/viewer.ts'
import { currentDay, selectWeek } from '../../../data/selectors.ts'
import { useLaree } from '../../../data/store.ts'
import { currentWeek } from '../../../domain/time.ts'

function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  render(<RouterProvider router={router} />)
  return router
}

beforeEach(() => {
  localStorage.clear()
  useLaree.getState().reset()
  useViewer.setState({ role: 'athlete', athleteId: 'amir', coachAthleteId: 'amir', chosen: true })
})
afterEach(cleanup)

const h1 = () => screen.findByRole('heading', { level: 1 }, { timeout: 25000 })

describe('Week page', () => {
  it.each([
    ['?w=-1', /^Last week,/],
    ['', /^This week,/],
    ['?w=1', /^Next week,/],
    ['?w=3', /^In 3 weeks,/],
  ])('labels the week for %s', async (query, label) => {
    renderAt(`/athlete/week${query}`)
    expect((await h1()).textContent).toMatch(label)
  })

  it('arrow buttons update the URL', async () => {
    const router = renderAt('/athlete/week')
    await h1()
    fireEvent.click(screen.getByRole('button', { name: 'Next week' }))
    await waitFor(() => expect(router.state.location.search).toBe('?w=1'))
    expect((await h1()).textContent).toMatch(/^Next week,/)
    fireEvent.click(screen.getByRole('button', { name: 'Previous week' }))
    await waitFor(() => expect(router.state.location.search).toBe(''))
    fireEvent.click(screen.getByRole('button', { name: 'Previous week' }))
    await waitFor(() => expect(router.state.location.search).toBe('?w=-1'))
    fireEvent.click(screen.getByRole('button', { name: 'This week' }))
    await waitFor(() => expect(router.state.location.search).toBe(''))
  })

  it('clamps a bad value and rewrites the URL', async () => {
    const router = renderAt('/athlete/week?w=abc')
    await h1()
    await waitFor(() => expect(router.state.location.search).toBe(''))
  })

  it('clamps an out-of-range value', async () => {
    const router = renderAt('/athlete/week?w=-99')
    await h1()
    await waitFor(() => expect(router.state.location.search).toBe(`?w=${1 - currentWeek()}`))
  })

  it('shows seven days and the week total against target', async () => {
    renderAt('/athlete/week')
    await h1()
    expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(7)
    const s = selectWeek(useLaree.getState().data, 'amir', currentWeek(), currentDay())
    expect(screen.getByTestId('load-done').textContent).toBe(String(Math.round(s.doneLoad)))
    const expected = s.target ? `Target ${Math.round(s.target.loadTarget)}` : 'No target set'
    expect(screen.getByTestId('load-target').textContent).toContain(expected)
  })

  it('shows band chips with a label on a past week', async () => {
    renderAt('/athlete/week?w=-1')
    await h1()
    const chips = document.querySelectorAll('[data-tone="status"]')
    expect(chips.length).toBeGreaterThan(0)
    for (const c of chips) expect((c.textContent ?? '').trim().length).toBeGreaterThan(0)
  })
})
