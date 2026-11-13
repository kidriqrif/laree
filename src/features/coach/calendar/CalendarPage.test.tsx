import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { createMemoryRouter } from 'react-router'
import { RouterProvider } from 'react-router/dom'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { routes } from '../../../app/router.tsx'
import { useViewer } from '../../../app/viewer.ts'
import { currentDay, selectWeek } from '../../../data/selectors.ts'
import { useLaree } from '../../../data/store.ts'
import { toastQueue } from '../../../ui/overlay/index.ts'
import { currentWeek, weekRange } from '../../../domain/time.ts'
import type { PlannedWorkout } from '../../../domain/types.ts'
import { summariseSteps } from './sessionModel.ts'

const NEXT = currentWeek() + 1
const FIRST = weekRange(NEXT).firstDay

function session(id: string, day: number, title: string, minutes: number, load: number): PlannedWorkout {
  return {
    id,
    athleteId: 'amir',
    day,
    order: 0,
    sport: 'run',
    title,
    steps: [],
    plannedDurationS: minutes * 60,
    plannedLoad: load,
    keySession: false,
  }
}

/** Next week for Amir holds exactly two known sessions: Monday and Wednesday. */
function seedNextWeek() {
  useLaree.setState((s) => ({
    data: {
      ...s.data,
      planned: [
        ...s.data.planned.filter((p) => !(p.athleteId === 'amir' && p.day >= FIRST && p.day < FIRST + 7)),
        session('t-mon', FIRST, 'Threshold run', 60, 80),
        session('t-wed', FIRST + 2, 'Easy run', 30, 25),
      ],
    },
  }))
}

const planned = (id: string) => useLaree.getState().data.planned.find((p) => p.id === id)

function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  render(<RouterProvider router={router} />)
  return router
}

beforeEach(() => {
  localStorage.clear()
  useLaree.getState().reset()
  useViewer.setState({ role: 'coach', athleteId: 'amir', coachAthleteId: 'amir', chosen: true })
  seedNextWeek()
})
afterEach(() => {
  cleanup()
  toastQueue.clear()
})

const grid = () => screen.findByRole('group', { name: /sessions by day/i }, { timeout: 25000 })

/** Pick a session up with m, press the arrows `steps` times and press `end`. */
async function keyboardMove(title: string, steps: number, end: 'Enter' | 'Escape' = 'Enter') {
  const g = await grid()
  // The grid can be on screen a moment before its rows are, so wait for the row.
  const row = await within(g).findByRole('row', { name: new RegExp(title) })
  row.focus()
  fireEvent.keyDown(row, { key: 'm' })
  const button = within(row).getByRole('button', { name: new RegExp(`Move ${title}`) })
  await waitFor(() => expect(g.getAttribute('data-moving')).toBe(''))
  for (let i = 0; i < Math.abs(steps); i++) fireEvent.keyDown(button, { key: steps > 0 ? 'ArrowRight' : 'ArrowLeft' })
  fireEvent.keyDown(button, { key: end })
}

describe('Calendar page', () => {
  it('shows seven days for the chosen athlete and keeps the week in the URL', async () => {
    const router = renderAt('/coach/calendar/amir?w=1')
    const g = await grid()
    // Day headings sit straight under the h1, so the outline does not skip a level.
    expect(within(g).getAllByRole('heading', { level: 2 })).toHaveLength(7)
    expect(await within(g).findByText('Threshold run')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Next week' }))
    await waitFor(() => expect(router.state.location.search).toBe('?w=2'))
    fireEvent.click(screen.getByRole('button', { name: 'Today' }))
    await waitFor(() => expect(router.state.location.search).toBe(''))
  })

  it('writes the remembered athlete into the address', async () => {
    useViewer.setState({ coachAthleteId: 'danial' })
    const router = renderAt('/coach/calendar')
    await grid()
    await waitFor(() => expect(router.state.location.pathname).toBe('/coach/calendar/danial'))
  })

  it('steps between athletes with ] and [', async () => {
    const router = renderAt('/coach/calendar/amir')
    await grid()
    fireEvent.keyDown(document.body, { key: ']' })
    await waitFor(() => expect(router.state.location.pathname).toBe('/coach/calendar/danial'))
    fireEvent.keyDown(document.body, { key: '[' })
    await waitFor(() => expect(router.state.location.pathname).toBe('/coach/calendar/amir'))
  })

  it('totals match the week and update after a move', async () => {
    renderAt('/coach/calendar/amir?w=1')
    await grid()
    const s = selectWeek(useLaree.getState().data, 'amir', NEXT, currentDay())
    expect(s.plannedLoad).toBe(105)
    expect(screen.getByTestId('week-planned-load').textContent).toBe('105')
    expect(screen.getByTestId('week-planned-time').textContent).toBe('1:30')
    const table = screen.getByRole('table', { name: /totals/i })
    const cells = () => within(table).getByRole('row', { name: /Planned load/ }).querySelectorAll('td')
    expect(cells()[0]?.textContent).toBe('80')
    await keyboardMove('Threshold run', 1)
    await waitFor(() => expect(planned('t-mon')?.day).toBe(FIRST + 1))
    expect(cells()[0]?.textContent).toBe('0')
    expect(cells()[1]?.textContent).toBe('80')
    expect(screen.getByTestId('week-planned-load').textContent).toBe('105')
  })

  it('moves a session with m, arrows and Enter, then Undo puts it back', async () => {
    renderAt('/coach/calendar/amir?w=1')
    await keyboardMove('Threshold run', 1)
    await waitFor(() => expect(planned('t-mon')?.day).toBe(FIRST + 1))
    expect(await screen.findByText(/Threshold run moved to Tuesday/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    await waitFor(() => expect(planned('t-mon')?.day).toBe(FIRST))
  })

  it('Escape cancels a keyboard move', async () => {
    renderAt('/coach/calendar/amir?w=1')
    await keyboardMove('Threshold run', 1, 'Escape')
    expect(planned('t-mon')?.day).toBe(FIRST)
    expect(useLaree.getState().undoStack).toHaveLength(0)
  })

  it('asks before moving onto a day that has a session: swap', async () => {
    renderAt('/coach/calendar/amir?w=1')
    await keyboardMove('Threshold run', 2)
    const dialog = await screen.findByRole('dialog', { name: /already has a session/ })
    expect(planned('t-mon')?.day).toBe(FIRST)
    fireEvent.click(within(dialog).getByRole('button', { name: 'Swap' }))
    await waitFor(() => expect(planned('t-mon')?.day).toBe(FIRST + 2))
    expect(planned('t-wed')?.day).toBe(FIRST)
    expect(useLaree.getState().undoStack).toHaveLength(1)
    fireEvent.click(await screen.findByRole('button', { name: 'Undo' }))
    await waitFor(() => expect(planned('t-mon')?.day).toBe(FIRST))
    expect(planned('t-wed')?.day).toBe(FIRST + 2)
  })

  it('keep both leaves two sessions on the day', async () => {
    renderAt('/coach/calendar/amir?w=1')
    await keyboardMove('Threshold run', 2)
    const dialog = await screen.findByRole('dialog', { name: /already has a session/ })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Keep both' }))
    await waitFor(() => expect(planned('t-mon')?.day).toBe(FIRST + 2))
    expect(planned('t-wed')?.day).toBe(FIRST + 2)
  })

  it('cancel on the conflict dialog changes nothing', async () => {
    renderAt('/coach/calendar/amir?w=1')
    await keyboardMove('Threshold run', 2)
    const dialog = await screen.findByRole('dialog', { name: /already has a session/ })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: /already has a session/ })).toBeNull())
    expect(planned('t-mon')?.day).toBe(FIRST)
    expect(planned('t-wed')?.day).toBe(FIRST + 2)
    expect(useLaree.getState().undoStack).toHaveLength(0)
  })

  it('refuses to move onto a past day', async () => {
    const today = currentDay()
    if (today === weekRange(currentWeek()).firstDay) return // Monday: no earlier day in this week
    useLaree.setState((s) => ({
      data: { ...s.data, planned: [...s.data.planned, session('t-now', today, 'Today run', 40, 40)] },
    }))
    renderAt('/coach/calendar/amir')
    await keyboardMove('Today run', -1)
    expect(await screen.findByText("Past days can't take new sessions.")).toBeTruthy()
    expect(planned('t-now')?.day).toBe(today)
  })

  it('the editor changes sport, title, steps summary, duration and note, and saves', async () => {
    renderAt('/coach/calendar/amir?w=1')
    const g = await grid()
    fireEvent.click(await within(g).findByRole('button', { name: 'Threshold run' }))
    const drawer = await screen.findByRole('dialog', { name: 'Threshold run' })
    fireEvent.change(within(drawer).getByRole('textbox', { name: 'Title' }), { target: { value: 'Hill repeats' } })
    fireEvent.change(within(drawer).getByRole('textbox', { name: 'Steps summary' }), {
      target: { value: '6 x 2 min hard uphill' },
    })
    fireEvent.change(within(drawer).getByRole('textbox', { name: /Coach's note/ }), {
      target: { value: 'Keep it smooth' },
    })
    const duration = within(drawer).getByRole('textbox', { name: 'Duration' })
    fireEvent.change(duration, { target: { value: '1:30:00' } })
    fireEvent.blur(duration)
    fireEvent.click(within(drawer).getByRole('button', { name: /Sport/ }))
    fireEvent.click(await screen.findByRole('option', { name: 'Bike' }))
    fireEvent.click(within(drawer).getByRole('button', { name: 'Save session' }))
    await waitFor(() => expect(planned('t-mon')?.title).toBe('Hill repeats'))
    const w = planned('t-mon')!
    expect(w.sport).toBe('bike')
    expect(w.plannedDurationS).toBe(5400)
    expect(w.coachNote).toBe('Keep it smooth')
    expect(summariseSteps(w.steps)).toContain('6 x 2 min hard uphill')
    expect(await screen.findByText('Saved Hill repeats.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    await waitFor(() => expect(planned('t-mon')?.title).toBe('Threshold run'))
  })

  it('refuses a zero duration and an empty title', async () => {
    renderAt('/coach/calendar/amir?w=1')
    const g = await grid()
    fireEvent.click(await within(g).findByRole('button', { name: 'Threshold run' }))
    const drawer = await screen.findByRole('dialog', { name: 'Threshold run' })
    fireEvent.change(within(drawer).getByRole('textbox', { name: 'Title' }), { target: { value: ' ' } })
    const duration = within(drawer).getByRole('textbox', { name: 'Duration' })
    fireEvent.change(duration, { target: { value: '0' } })
    fireEvent.blur(duration)
    fireEvent.click(within(drawer).getByRole('button', { name: 'Save session' }))
    expect(await within(drawer).findByText('Give the session a title.')).toBeTruthy()
    expect(within(drawer).getByText('Duration must be more than zero.')).toBeTruthy()
    expect(planned('t-mon')?.title).toBe('Threshold run')
  })

  it('asks before closing with unsaved changes', async () => {
    renderAt('/coach/calendar/amir?w=1')
    const g = await grid()
    fireEvent.click(await within(g).findByRole('button', { name: 'Threshold run' }))
    const drawer = await screen.findByRole('dialog', { name: 'Threshold run' })
    fireEvent.change(within(drawer).getByRole('textbox', { name: 'Title' }), { target: { value: 'Changed' } })
    fireEvent.click(within(drawer).getByRole('button', { name: 'Cancel' }))
    const ask = await screen.findByRole('alertdialog')
    fireEvent.click(within(ask).getByRole('button', { name: 'Discard changes' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Threshold run' })).toBeNull())
    expect(planned('t-mon')?.title).toBe('Threshold run')
  })

  it('n adds a session and opens it in the editor', async () => {
    renderAt('/coach/calendar/amir?w=1')
    await grid()
    const before = useLaree.getState().data.planned.length
    fireEvent.keyDown(document.body, { key: 'n' })
    await screen.findByRole('dialog', { name: 'New run' })
    expect(useLaree.getState().data.planned.length).toBe(before + 1)
  })
})
