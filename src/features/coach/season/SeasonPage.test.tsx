import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { createMemoryRouter } from 'react-router'
import { RouterProvider } from 'react-router/dom'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { routes } from '../../../app/router.tsx'
import { useViewer } from '../../../app/viewer.ts'
import { currentDay } from '../../../data/selectors.ts'
import { useLaree } from '../../../data/store.ts'
import { currentWeek } from '../../../domain/time.ts'
import { EMPTY_SEASON } from './SeasonPage.tsx'

function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  render(<RouterProvider router={router} />)
  return router
}

const clearAmir = () =>
  useLaree.setState((s) => ({
    data: {
      ...s.data,
      races: s.data.races.filter((r) => r.athleteId !== 'amir'),
      phases: s.data.phases.filter((p) => p.athleteId !== 'amir'),
    },
  }))

const raceBody = (priority: 'A' | 'B' | 'C', weeks: number, name: string) => ({
  athleteId: 'amir' as const,
  name,
  day: currentDay() + weeks * 7,
  sport: 'triathlon' as const,
  priority,
  distancesKm: [1.9, 90, 21.1],
})

const amirPhases = () => useLaree.getState().data.phases.filter((p) => p.athleteId === 'amir')
const amirPlanned = () => useLaree.getState().data.planned.filter((p) => p.athleteId === 'amir')

beforeEach(() => {
  localStorage.clear()
  useLaree.getState().reset()
  useViewer.setState({ role: 'coach', athleteId: 'amir', coachAthleteId: 'amir', chosen: true })
})
afterEach(cleanup)

const T = { timeout: 8000 }

describe('Season page', () => {
  it('shows the empty season text with no races', async () => {
    clearAmir()
    renderAt('/coach/season/amir')
    expect(await screen.findByText(EMPTY_SEASON, undefined, T)).toBeTruthy()
    expect(EMPTY_SEASON).toBe('No races yet. Add the A race first. Laree builds the phases back from it.')
  })

  it('offers Derive phases for an A race and builds them', async () => {
    clearAmir()
    useLaree.getState().addRace(raceBody('A', 20, 'Test 70.3'))
    renderAt('/coach/season/amir')
    fireEvent.click(await screen.findByRole('button', { name: /Derive phases from Test 70.3/ }, T))
    await waitFor(() => expect(amirPhases().length).toBeGreaterThan(1))
    expect(amirPhases().some((p) => p.kind === 'race')).toBe(true)
  })

  it('adds a B race marker and moves no phase', async () => {
    const before = JSON.stringify(amirPhases())
    useLaree.getState().addRace(raceBody('B', 6, 'Tune-up Tri'))
    renderAt('/coach/season/amir')
    expect(await screen.findByText(/B race: Tune-up Tri/, undefined, T)).toBeTruthy()
    expect(JSON.stringify(amirPhases())).toBe(before)
  })

  async function openFill() {
    renderAt('/coach/season/amir')
    const table = await screen.findByRole('grid', { name: /Weekly targets for Amir/ }, T)
    const week = currentWeek() + 1
    const row = within(table)
      .getAllByRole('row')
      .find((r) => within(r).queryByText(new RegExp(`^Week ${week}\\b`)))
    expect(row).toBeTruthy()
    fireEvent.click(within(row as HTMLElement).getByRole('checkbox'))
    fireEvent.click(screen.getByRole('button', { name: 'Fill from library' }))
    return await screen.findByRole('dialog', { name: 'Fill from library' }, T)
  }

  it('proposes workouts, applies them and undoes them', async () => {
    const dialog = await openFill()
    expect(within(dialog).getByText(/Proposed Load/)).toBeTruthy()
    const before = amirPlanned().length
    fireEvent.click(within(dialog).getByRole('button', { name: 'Apply' }))
    await waitFor(() => expect(amirPlanned().length).toBeGreaterThan(before))
    expect(await screen.findByRole('link', { name: 'Open the calendar' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    await waitFor(() => expect(amirPlanned().length).toBe(before))
  })

  it('undoes a fill with Ctrl+Z', async () => {
    const dialog = await openFill()
    const before = amirPlanned().length
    fireEvent.click(within(dialog).getByRole('button', { name: 'Apply' }))
    await waitFor(() => expect(amirPlanned().length).toBeGreaterThan(before))
    act(() => {
      fireEvent.keyDown(document.body, { key: 'z', ctrlKey: true })
    })
    await waitFor(() => expect(amirPlanned().length).toBe(before))
  })

  it('lets the coach swap one proposal before applying', async () => {
    const dialog = await openFill()
    const pickers = within(dialog).getAllByRole('button', { name: /Week \d+, \w+/ })
    const first = pickers[0] as HTMLElement
    const was = first.textContent
    fireEvent.click(first)
    const options = await screen.findAllByRole('option')
    const other = options.find((o) => o.textContent !== was && !(o.textContent ?? '').startsWith('None'))
    expect(other).toBeTruthy()
    fireEvent.click(other as HTMLElement)
    await waitFor(() =>
      expect((within(dialog).getAllByRole('button', { name: /Week \d+, \w+/ })[0] as HTMLElement).textContent).not.toBe(was),
    )
    const before = amirPlanned().length
    fireEvent.click(within(dialog).getByRole('button', { name: 'Apply' }))
    await waitFor(() => expect(amirPlanned().length).toBeGreaterThan(before))
  })
})
