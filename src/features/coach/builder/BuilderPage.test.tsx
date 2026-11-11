import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { createMemoryRouter } from 'react-router'
import { RouterProvider } from 'react-router/dom'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { HotkeyProvider } from '../../../app/keyboard/index.ts'
import { useViewer } from '../../../app/viewer.ts'
import { useLaree } from '../../../data/store.ts'
import BuilderPage from './BuilderPage.tsx'

beforeEach(() => {
  localStorage.clear()
  useLaree.getState().reset()
  useViewer.setState({ role: 'coach', athleteId: 'amir', coachAthleteId: 'amir', chosen: true })
})
afterEach(cleanup)

function setup(path: string) {
  const router = createMemoryRouter(
    [
      { path: '/coach/library/:workoutId', element: <BuilderPage /> },
      { path: '/coach/library', element: <p>Library</p> },
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

const labels = () =>
  within(screen.getByRole('list', { name: 'Steps' }))
    .getAllByRole('group')
    .map((g) => g.getAttribute('aria-label') ?? '')
    .filter((l) => l.startsWith('Step '))
const press = (name: string) => fireEvent.click(screen.getByRole('button', { name }))
const totals = () => screen.getByLabelText('Workout totals').textContent ?? ''

describe('BuilderPage', () => {
  it('starts a new workout with a warm-up, a steady step and a cool-down', () => {
    setup('/coach/library/new')
    expect(labels()).toEqual(['Step 1, Warm-up', 'Step 2, Steady', 'Step 3, Cool-down'])
  })

  it('adds each block type', () => {
    setup('/coach/library/new')
    for (const name of ['Add warm-up', 'Add steady', 'Add interval', 'Add recovery', 'Add cool-down', 'Add repeat block']) {
      press(name)
    }
    const got = labels()
    expect(got).toContain('Step 4, Warm-up')
    expect(got).toContain('Step 5, Steady')
    expect(got).toContain('Step 6, Interval')
    expect(got).toContain('Step 7, Recovery')
    expect(got).toContain('Step 8, Cool-down')
    expect(got).toContain('Step 9, Repeat block')
  })

  it('repeat blocks multiply the totals', () => {
    setup('/coach/library/new')
    // 10 + 20 + 10 = 40 min to start.
    expect(totals()).toContain('40 min')
    press('Add repeat block')
    // Plus 4 x (5 + 2) min = 68 min.
    expect(totals()).toContain('1 h 08 min')
    const repeats = screen.getByRole('textbox', { name: /Repeats/ })
    fireEvent.change(repeats, { target: { value: '5' } })
    fireEvent.blur(repeats)
    expect(totals()).toContain('1 h 15 min')
  })

  it('previews targets for Amir in watts', () => {
    setup('/coach/library/bike-sweetspot')
    fireEvent.click(screen.getByRole('radio', { name: 'Amir' }))
    expect(screen.getByRole('list', { name: 'Targets for Amir' }).textContent).toMatch(/224-240 W/)
    expect(screen.getByText(/Amir's FTP is 255 W/)).toBeTruthy()
  })

  it('moves a step with Alt+Down', () => {
    setup('/coach/library/new')
    const first = within(screen.getByRole('list', { name: 'Steps' })).getAllByRole('group')[0]!
    fireEvent.keyDown(within(first).getAllByRole('textbox', { name: 'Note' })[0]!, { key: 'ArrowDown', altKey: true })
    expect(labels()[1]).toBe('Step 2, Warm-up')
  })

  it('Ctrl+Z undoes and Ctrl+S saves, changing the URL from new to the id', async () => {
    const router = setup('/coach/library/new')
    const name = screen.getByRole('textbox', { name: 'Name' })
    fireEvent.change(name, { target: { value: 'Hill repeats' } })
    press('Add steady')
    expect(labels()).toHaveLength(4)
    await act(async () => {
      fireEvent.keyDown(document.body, { key: 'z', ctrlKey: true })
    })
    expect(labels()).toHaveLength(3)
    await act(async () => {
      fireEvent.keyDown(name, { key: 's', ctrlKey: true })
    })
    const id = router.state.location.pathname.split('/').pop()!
    expect(id).not.toBe('new')
    const saved = useLaree.getState().data.templates.find((t) => t.id === id)
    expect(saved?.name).toBe('Hill repeats')
    expect(saved?.steps).toHaveLength(3)
  })

  it('does not save a workout with no name', async () => {
    const router = setup('/coach/library/new')
    await act(async () => {
      fireEvent.keyDown(document.body, { key: 's', ctrlKey: true })
    })
    expect(router.state.location.pathname).toBe('/coach/library/new')
    expect(await screen.findByText('Give the workout a name.')).toBeTruthy()
  })

  it('shows a notice for an unknown workout', () => {
    setup('/coach/library/nope')
    expect(screen.getByText('Workout not found.')).toBeTruthy()
  })
})
