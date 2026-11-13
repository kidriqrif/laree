import { act, cleanup, fireEvent, render, renderHook, screen, within } from '@testing-library/react'
import { createMemoryRouter } from 'react-router'
import { RouterProvider } from 'react-router/dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { currentDay } from '../data/selectors.ts'
import { useLaree } from '../data/store.ts'
import { routes } from './router.tsx'
import { buildDestinations, filterDestinations } from './keyboard/index.ts'
import { useCoachReadOnly } from './useCoachReadOnly.ts'
import { useViewer } from './viewer.ts'

beforeEach(() => {
  localStorage.clear()
  useLaree.getState().reset()
  useViewer.setState({ role: 'coach', athleteId: 'amir', coachAthleteId: 'amir', chosen: true })
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const open = (id: 'amir' | 'danial' | 'irfan') =>
  useLaree.getState().data.flagsState[id].flags.filter((f) => f.status === 'open').length

async function renderRail() {
  const router = createMemoryRouter(routes, { initialEntries: ['/coach/overview'] })
  render(<RouterProvider router={router} />)
  return within(await screen.findByRole('navigation', { name: 'Coach sections' }))
}

describe('coach rail', () => {
  it('shows a flag on an athlete with an open flag and a hollow dot with no check-in today', async () => {
    const day = currentDay()
    useLaree.setState((s) => ({
      data: { ...s.data, checkIns: s.data.checkIns.filter((c) => !(c.athleteId === 'irfan' && c.day === day)) },
    }))
    const rail = await renderRail()
    for (const id of ['amir', 'danial', 'irfan'] as const) {
      const link = rail.getByRole('link', { name: new RegExp(id[0]!.toUpperCase() + id.slice(1)) })
      expect(within(link).queryByText(/open flag/i) !== null).toBe(open(id) > 0)
      const hasToday = useLaree.getState().data.checkIns.some((c) => c.athleteId === id && c.day === day)
      expect(within(link).queryByText('No check-in today') !== null).toBe(!hasToday)
    }
    expect(within(rail.getByRole('link', { name: /Irfan/ })).getByText('No check-in today')).toBeTruthy()
  })

  it('counts open flags on Check-ins and drops the count at zero', async () => {
    const total = (['amir', 'danial', 'irfan'] as const).reduce(
      (n, id) => n + useLaree.getState().data.flagsState[id].flags.filter((f) => f.status === 'open').length,
      0,
    )
    const rail = await renderRail()
    const link = rail.getByRole('link', { name: /^Check-ins/ })
    // The seed has at least one open flag (Danial's).
    expect(total).toBeGreaterThan(0)
    expect(link.textContent).toContain(String(total))
    act(() => {
      useLaree.setState((s) => ({
        data: {
          ...s.data,
          flagsState: Object.fromEntries(
            Object.entries(s.data.flagsState).map(([k, v]) => [
              k,
              { ...v, flags: v.flags.map((f) => (f.status === 'open' ? { ...f, status: 'resolved' as const } : f)) },
            ]),
          ) as typeof s.data.flagsState,
        },
      }))
    })
    expect(within(rail.getByRole('link', { name: /^Check-ins/ })).queryByText(/open flag/i)).toBeNull()
  })

  it('has a Jump to field and a Keyboard link that open their dialogs', async () => {
    const rail = await renderRail()
    fireEvent.click(rail.getByRole('button', { name: /^Jump to/ }))
    expect(await screen.findByRole('combobox', { name: /Search athletes/ })).toBeTruthy()
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' })
    cleanup()
    const again = await renderRail()
    fireEvent.click(again.getByRole('button', { name: /^Keyboard/ }))
    expect(await screen.findByRole('dialog')).toBeTruthy()
  })

  it('draws rail icons at 24 px', async () => {
    const rail = await renderRail()
    const icons = rail.getAllByRole('link', { name: /^(?!Laree)/ }).flatMap((l) => [...l.querySelectorAll('svg')])
    expect(icons.length).toBeGreaterThan(5)
    for (const svg of icons.filter((s) => s.getAttribute('width') !== '16')) expect(svg.getAttribute('width')).toBe('24')
  })
})

const data = () => useLaree.getState().data

describe('Jump to destinations', () => {
  it('finds library workouts and races as well as screens and athletes', () => {
    const all = buildDestinations('amir', { templates: data().templates, races: data().races })
    const groups = new Set(all.map((d) => d.group))
    expect(groups).toEqual(new Set(['Athletes', 'Sections', 'Library', 'Races']))
    const t = data().templates[0]!
    const found = filterDestinations(all, t.name).find((d) => d.id === `workout-${t.id}`)
    expect(found?.to).toBe(`/coach/library/${t.id}`)
    const r = data().races[0]!
    const race = filterDestinations(all, r.name).find((d) => d.id === `race-${r.id}`)
    expect(race?.to).toBe(`/coach/season/${r.athleteId}`)
    expect(race?.label).toContain(r.name)
  })

  it('still works with athletes and sections alone', () => {
    expect(buildDestinations('amir').every((d) => d.group === 'Athletes' || d.group === 'Sections')).toBe(true)
  })
})

describe('useCoachReadOnly', () => {
  function stubMedia(matches: boolean) {
    const listeners = new Set<() => void>()
    const queries: string[] = []
    const mql = {
      matches,
      addEventListener: (_: string, cb: () => void) => listeners.add(cb),
      removeEventListener: (_: string, cb: () => void) => listeners.delete(cb),
    }
    vi.stubGlobal('matchMedia', (q: string) => {
      queries.push(q)
      return mql
    })
    return {
      queries,
      set(next: boolean) {
        mql.matches = next
        listeners.forEach((cb) => cb())
      },
    }
  }

  it('is true on a narrow touch screen and follows resizing', () => {
    const media = stubMedia(true)
    const { result } = renderHook(() => useCoachReadOnly())
    expect(result.current).toBe(true)
    act(() => media.set(false))
    expect(result.current).toBe(false)
  })

  it('asks for narrow and a coarse pointer together, so a zoomed desktop keeps editing', () => {
    const media = stubMedia(false)
    renderHook(() => useCoachReadOnly())
    expect(new Set(media.queries)).toEqual(new Set(['(max-width: 1023px) and (pointer: coarse)']))
  })

  it('is false when the browser cannot answer', () => {
    vi.stubGlobal('matchMedia', undefined)
    const { result } = renderHook(() => useCoachReadOnly())
    expect(result.current).toBe(false)
  })
})
