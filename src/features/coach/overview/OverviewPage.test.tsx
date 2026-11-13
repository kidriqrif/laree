import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { createMemoryRouter } from 'react-router'
import { RouterProvider } from 'react-router/dom'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { routes } from '../../../app/router.tsx'
import { useViewer } from '../../../app/viewer.ts'
import { DASH, fmtNumber, fmtSigned } from '../../../charts/index.ts'
import {
  currentDay,
  selectAthleteDay,
  selectCheckInSkipped,
  selectHasCheckedIn,
  selectOpenFlagCount,
  selectOpenFlags,
  selectRosterRows,
} from '../../../data/selectors.ts'
import { useLaree } from '../../../data/store.ts'
import { displayPct, roundHalfAway } from '../../../domain/metrics/compliance.ts'
import type { AthleteId, CheckIn } from '../../../domain/types.ts'

const IDS: AthleteId[] = ['amir', 'danial', 'irfan']
const NAMES: Record<AthleteId, string> = { amir: 'Amir', danial: 'Danial', irfan: 'Irfan' }

beforeEach(() => {
  localStorage.clear()
  useLaree.getState().reset()
  useViewer.setState({ role: 'coach', athleteId: 'amir', coachAthleteId: 'amir', chosen: true })
})
afterEach(cleanup)

async function renderOverview() {
  const router = createMemoryRouter(routes, { initialEntries: ['/coach/overview'] })
  render(<RouterProvider router={router} />)
  const grid = await screen.findByRole('grid', { name: 'Team today' }, { timeout: 25000 })
  return { router, grid }
}

/** Body rows in screen order, as athlete ids. */
function rowIds(grid: HTMLElement): string[] {
  return [...grid.querySelectorAll('[data-roster-row]')].map((el) => el.getAttribute('data-roster-row') ?? '')
}

function rowOf(grid: HTMLElement, id: string): HTMLElement {
  const row = grid.querySelector(`[data-roster-row="${id}"]`)?.closest<HTMLElement>('[role="row"]')
  if (!row) throw new Error(`no row for ${id}`)
  return row
}

/** The text of one cell, found by its column label. */
function cell(grid: HTMLElement, id: string, label: string): string {
  const headers = within(grid).getAllByRole('columnheader')
  const index = headers.findIndex((h) => (h.textContent ?? '').replace(/[↑↓↕]/g, '').trim() === label)
  if (index === -1) throw new Error(`no column ${label}`)
  const cells = rowOf(grid, id).querySelectorAll('[role="gridcell"], [role="rowheader"]')
  return cells[index]?.textContent ?? ''
}

/** What the Check-in column should say, from the selectors. */
function checkInWord(id: AthleteId, daysSince: number | null): string {
  const data = useLaree.getState().data
  const today = currentDay()
  if (selectHasCheckedIn(data, id, today)) return 'Today'
  if (selectCheckInSkipped(data, id, today)) return 'Skipped today'
  if (daysSince === null) return 'None yet'
  return daysSince === 1 ? 'Yesterday' : `${daysSince} days ago`
}

const pressKey = (key: string, target: Element = document.activeElement ?? document.body) => {
  fireEvent.keyDown(target, { key })
  fireEvent.keyUp(target, { key })
}

describe('Overview roster', () => {
  it('shows one row per seeded athlete with the selector values', async () => {
    const { grid } = await renderOverview()
    const data = useLaree.getState().data
    const today = currentDay()
    const rows = selectRosterRows(data, today)
    expect(rowIds(grid).toSorted()).toEqual([...IDS].toSorted())

    for (const r of rows) {
      const id = r.athleteId
      expect(cell(grid, id, 'Athlete')).toContain(NAMES[id])
      expect(cell(grid, id, 'Fitness')).toContain(fmtNumber(r.fitness))
      expect(cell(grid, id, 'Form')).toContain(fmtSigned(r.form))
      expect(cell(grid, id, 'Ramp /wk')).toContain(fmtSigned(r.ramp, 1))
      const week = r.compliance === null ? DASH : `${fmtNumber(displayPct(roundHalfAway(r.compliance, 1)))}%`
      expect(cell(grid, id, 'This week')).toContain(week)
      const days = r.nextRace ? r.nextRace.day - today : null
      expect(cell(grid, id, 'Next race')).toContain(r.nextRace?.name ?? DASH)
      expect(cell(grid, id, 'Days')).toContain(days === null ? DASH : days === 0 ? 'Race day' : fmtNumber(days))
      const open = selectOpenFlags(data, id).length
      expect(cell(grid, id, 'Flags')).toContain(open === 0 ? 'None' : String(open))
      expect(cell(grid, id, 'Check-in')).toContain(checkInWord(id, r.daysSinceCheckIn))
    }
  })

  it('opens sorted by flags, most first, and sorts by a column when its header is pressed', async () => {
    const { grid } = await renderOverview()
    const data = useLaree.getState().data
    const flagCount = (id: string) => selectOpenFlags(data, id as AthleteId).length
    const counts = rowIds(grid).map(flagCount)
    expect(counts).toEqual(counts.toSorted((a, b) => b - a))

    const fitness = new Map(selectRosterRows(data, currentDay()).map((r) => [r.athleteId as string, r.fitness]))
    fireEvent.click(within(grid).getByRole('columnheader', { name: /Fitness/ }))
    await waitFor(() => expect(within(grid).getByRole('columnheader', { name: /Fitness/ }).getAttribute('aria-sort')).toBe('ascending'))
    const up = rowIds(grid).map((id) => fitness.get(id) ?? 0)
    expect(up).toEqual(up.toSorted((a, b) => a - b))
    expect(useLaree.getState().data.prefs['rosterSort']).toBe('fitness:ascending')

    fireEvent.click(within(grid).getByRole('columnheader', { name: /Fitness/ }))
    await waitFor(() => expect(within(grid).getByRole('columnheader', { name: /Fitness/ }).getAttribute('aria-sort')).toBe('descending'))
    const down = rowIds(grid).map((id) => fitness.get(id) ?? 0)
    expect(down).toEqual(down.toSorted((a, b) => b - a))

    fireEvent.click(within(grid).getByRole('columnheader', { name: /Athlete/ }))
    await waitFor(() => expect(rowIds(grid)).toEqual(['amir', 'danial', 'irfan']))
  })

  it('keeps the saved sort when the page opens again', async () => {
    useLaree.getState().setPref('rosterSort', 'athlete:descending')
    const { grid } = await renderOverview()
    expect(rowIds(grid)).toEqual(['irfan', 'danial', 'amir'])
    expect(within(grid).getByRole('columnheader', { name: /Athlete/ }).getAttribute('aria-sort')).toBe('descending')
  })

  it('moves row focus with j and k and opens the athlete with Enter', async () => {
    useLaree.getState().setPref('rosterSort', 'athlete:ascending')
    const { router, grid } = await renderOverview()
    act(() => (document.activeElement as HTMLElement | null)?.blur())

    act(() => pressKey('j', document.body))
    await waitFor(() => expect(document.activeElement).toBe(rowOf(grid, 'amir')))
    act(() => pressKey('j'))
    await waitFor(() => expect(document.activeElement).toBe(rowOf(grid, 'danial')))
    act(() => pressKey('j'))
    await waitFor(() => expect(document.activeElement).toBe(rowOf(grid, 'irfan')))
    // The last row holds.
    act(() => pressKey('j'))
    expect(document.activeElement).toBe(rowOf(grid, 'irfan'))
    act(() => pressKey('k'))
    await waitFor(() => expect(document.activeElement).toBe(rowOf(grid, 'danial')))

    act(() => pressKey('Enter'))
    await waitFor(() => expect(router.state.location.pathname).toBe('/coach/athlete/danial'))
    // Enter reaches both the key layer and the row action; the athlete opens once, so one step
    // back is the Overview again.
    await act(() => router.navigate(-1))
    await waitFor(() => expect(router.state.location.pathname).toBe('/coach/overview'))
  })

  it('lists its keys in Keyboard help', async () => {
    await renderOverview()
    act(() => pressKey('?', document.body))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('Next athlete in the roster')).toBeTruthy()
    expect(within(dialog).getByText('Previous athlete in the roster')).toBeTruthy()
    expect(within(dialog).getByText('Open the focused athlete')).toBeTruthy()
  })
})

describe('Overview status line', () => {
  it('states the open flags, missing check-ins and sessions today from the selectors', async () => {
    await renderOverview()
    const data = useLaree.getState().data
    const today = currentDay()
    const flags = selectOpenFlagCount(data)
    const missing = IDS.filter((id) => !selectHasCheckedIn(data, id, today)).length
    const sessions = IDS.reduce((n, id) => n + selectAthleteDay(data, id, today, today).planned.length, 0)
    const line = screen.getByTestId('team-status').textContent ?? ''

    expect(line).toContain(flags === 0 ? 'No open flags' : `${flags} open flag${flags === 1 ? '' : 's'}`)
    expect(line).toContain(missing === 0 ? 'No check-ins missing' : `${missing} check-in${missing === 1 ? '' : 's'} missing`)
    expect(line).toContain(sessions === 0 ? 'No sessions today' : `${sessions} session${sessions === 1 ? '' : 's'} today`)
  })

  it('agrees with the Flags column', async () => {
    const { grid } = await renderOverview()
    const total = IDS.reduce((n, id) => {
      const shown = Number.parseInt(cell(grid, id, 'Flags'), 10)
      return n + (Number.isNaN(shown) ? 0 : shown)
    }, 0)
    expect(total).toBe(selectOpenFlagCount(useLaree.getState().data))
  })

  it('follows the store: every athlete checked in, no open flags', async () => {
    const today = currentDay()
    useLaree.setState((s) => {
      const checkIns: CheckIn[] = [
        ...s.data.checkIns.filter((c) => c.day !== today),
        ...IDS.map((athleteId): CheckIn => {
          const base = s.data.checkIns.find((c) => c.athleteId === athleteId)
          if (!base) throw new Error('seed has no check-in')
          return { ...base, athleteId, day: today }
        }),
      ]
      const flagsState = { ...s.data.flagsState }
      for (const id of IDS) {
        flagsState[id] = {
          ...flagsState[id],
          flags: flagsState[id].flags.map((f) => (f.status === 'open' ? { ...f, status: 'resolved' as const } : f)),
        }
      }
      return { data: { ...s.data, checkIns, flagsState } }
    })
    await renderOverview()
    const line = screen.getByTestId('team-status').textContent ?? ''
    expect(line).toContain('No open flags')
    expect(line).toContain('No check-ins missing')
  })
})
