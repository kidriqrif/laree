import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { createMemoryRouter } from 'react-router'
import { RouterProvider } from 'react-router/dom'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { routes } from '../../../app/router.tsx'
import { useViewer } from '../../../app/viewer.ts'
import { useLaree } from '../../../data/store.ts'

function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  render(<RouterProvider router={router} />)
  return router
}

beforeEach(() => {
  localStorage.clear()
  useLaree.getState().reset()
  useViewer.setState({ role: 'coach', athleteId: 'amir', coachAthleteId: 'amir', chosen: true })
})
afterEach(cleanup)

const heading = () => screen.findByRole('heading', { level: 1, name: 'Analytics' }, { timeout: 8000 })
const figure = (name: RegExp) => screen.findByRole('figure', { name }, { timeout: 8000 })
const summaryOf = (fig: HTMLElement) => fig.getAttribute('aria-describedby') ? document.getElementById(fig.getAttribute('aria-describedby') as string)?.textContent ?? '' : ''

describe('Analytics page', () => {
  it('defaults to the last athlete viewed and writes them into the address', async () => {
    useViewer.setState({ coachAthleteId: 'danial' })
    const router = renderAt('/coach/analytics')
    await heading()
    await waitFor(() => expect(router.state.location.pathname).toBe('/coach/analytics/danial'))
    expect(router.state.location.search).toContain('range=8w')
    expect(await figure(/Danial: Fitness, Fatigue and Form/)).toBeTruthy()
  })

  it('the period selector changes the weekly series and the URL', async () => {
    const router = renderAt('/coach/analytics/amir?range=4w')
    await heading()
    const load = await figure(/weekly Load against plan/)
    const rowsOf = () => {
      fireEvent.click(within(load).getByRole('button', { name: 'Show table' }))
      return within(load).getAllByRole('row').length
    }
    const four = rowsOf()
    fireEvent.click(screen.getByRole('radio', { name: '16 weeks' }))
    await waitFor(() => expect(router.state.location.search).toBe('?range=16w'))
    const load16 = await figure(/weekly Load against plan/)
    const table = within(load16).queryByRole('table')
    if (!table) fireEvent.click(within(load16).getByRole('button', { name: 'Show table' }))
    expect(within(load16).getAllByRole('row').length).toBeGreaterThan(four)
    expect(useLaree.getState().data.prefs.analyticsRange).toBe('16w')
  })

  it('every chart has a text summary', async () => {
    renderAt('/coach/analytics/amir?range=8w')
    await heading()
    for (const re of [/Fitness, Fatigue and Form/, /weekly Load against plan/, /compliance by week/, /time in zones/, /best power/, /best pace/]) {
      const fig = await figure(re)
      expect(summaryOf(fig).length).toBeGreaterThan(10)
    }
  })

  it('shows a note instead of a power curve for an athlete without power', async () => {
    renderAt('/coach/analytics/danial')
    await heading()
    expect(await screen.findByText(/has no power data/)).toBeTruthy()
    expect(await figure(/Danial: best pace/)).toBeTruthy()
  })

  it('steps between athletes with ] and [', async () => {
    const router = renderAt('/coach/analytics/amir?range=8w')
    await heading()
    await figure(/best pace/)
    fireEvent.keyDown(document.body, { key: ']' })
    await waitFor(() => expect(router.state.location.pathname).toBe('/coach/analytics/danial'), { timeout: 4000 })
    fireEvent.keyDown(document.body, { key: '[' })
    await waitFor(() => expect(router.state.location.pathname).toBe('/coach/analytics/amir'))
  })
})
