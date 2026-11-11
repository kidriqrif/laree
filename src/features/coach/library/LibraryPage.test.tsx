import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { createMemoryRouter } from 'react-router'
import { RouterProvider } from 'react-router/dom'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { HotkeyProvider } from '../../../app/keyboard/index.ts'
import { useViewer } from '../../../app/viewer.ts'
import { useLaree } from '../../../data/store.ts'
import BuilderPage from '../builder/BuilderPage.tsx'
import LibraryPage from './LibraryPage.tsx'

beforeEach(() => {
  localStorage.clear()
  useLaree.getState().reset()
  useViewer.setState({ role: 'coach', athleteId: 'amir', coachAthleteId: 'amir', chosen: true })
})
afterEach(cleanup)

function setup(path = '/coach/library') {
  const router = createMemoryRouter(
    [
      { path: '/coach/library', element: <LibraryPage /> },
      { path: '/coach/library/:workoutId', element: <BuilderPage /> },
    ],
    { initialEntries: [path] },
  )
  render(
    <HotkeyProvider>
      <RouterProvider router={router} />
    </HotkeyProvider>,
  )
  return router
}

const rowCount = () => within(screen.getByRole('grid', { name: 'Workouts' })).getAllByRole('row').length - 1

describe('LibraryPage', () => {
  it('filters by sport, duration and search, and the URL keeps the filters', () => {
    const router = setup()
    const all = useLaree.getState().data.templates
    expect(rowCount()).toBe(all.length)
    fireEvent.click(screen.getByRole('radio', { name: 'Run' }))
    const runs = all.filter((t) => t.sport === 'run')
    expect(rowCount()).toBe(runs.length)
    expect(router.state.location.search).toContain('sport=run')
    fireEvent.click(screen.getByRole('radio', { name: 'Under 45 min' }))
    expect(rowCount()).toBe(runs.filter((t) => t.estimatedDurationS < 45 * 60).length)
    fireEvent.click(screen.getByRole('radio', { name: 'All sports' }))
    fireEvent.click(screen.getByRole('radio', { name: 'Any length' }))
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search' }), { target: { value: 'zzzz-no-match' } })
    expect(screen.getByText('No workouts match these filters.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
    expect(rowCount()).toBe(all.length)
  })

  it('n opens a new workout', async () => {
    const router = setup()
    await act(async () => {
      fireEvent.keyDown(document.body, { key: 'n' })
    })
    expect(router.state.location.pathname).toBe('/coach/library/new')
    expect(await screen.findByRole('heading', { level: 1, name: 'New workout' })).toBeTruthy()
  })
})
