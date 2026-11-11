import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createMemoryRouter } from 'react-router'
import { RouterProvider } from 'react-router/dom'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useLaree } from '../data/store.ts'
import { landingFor } from './RoleSwitcher.tsx'
import { routes } from './router.tsx'
import { setLastCoachRoute, useViewer } from './viewer.ts'

function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  render(<RouterProvider router={router} />)
  return router
}

beforeEach(() => {
  useLaree.getState().reset()
  localStorage.clear()
  setLastCoachRoute(null)
  useViewer.setState({ role: 'athlete', athleteId: 'amir', coachAthleteId: 'amir', chosen: false })
})
afterEach(cleanup)

/** Real ids from the seed, so the detail pages render their real content. */
function ids() {
  const { planned, activities } = useLaree.getState().data
  const workout = planned.find((p) => p.athleteId === 'amir' && p.steps.length > 0)!
  const activity = activities.find((a) => a.athleteId === 'amir')!
  return { workout, activity }
}

type Side = 'athlete' | 'coach' | 'standalone'
type Page = [path: string | (() => string), heading: string | RegExp | (() => string), side: Side]

const PAGES: Page[] = [
  ['/reset', 'Reset demo data', 'standalone'],
  ['/athlete/today', 'Today', 'athlete'],
  ['/athlete/week', /^This week, /, 'athlete'],
  ['/athlete/week?w=-1', /^Last week, /, 'athlete'],
  ['/athlete/progress', 'Progress', 'athlete'],
  ['/athlete/me', 'Me', 'athlete'],
  [() => `/athlete/workout/${ids().workout.id}`, () => ids().workout.title, 'athlete'],
  [() => `/athlete/activity/${ids().activity.id}`, () => ids().activity.title, 'athlete'],
  ['/coach/overview', 'Overview', 'coach'],
  ['/coach/athlete/danial', 'Danial', 'coach'],
  ['/coach/calendar', 'Calendar', 'coach'],
  ['/coach/calendar/irfan', 'Calendar', 'coach'],
  ['/coach/season', 'Season', 'coach'],
  ['/coach/season/amir', 'Season', 'coach'],
  ['/coach/analytics', 'Analytics', 'coach'],
  ['/coach/analytics/danial', 'Analytics', 'coach'],
  ['/coach/library', 'Library', 'coach'],
  ['/coach/library/new', 'New workout', 'coach'],
  ['/coach/check-ins', 'Check-ins', 'coach'],
  [() => `/coach/activity/${ids().activity.id}`, () => ids().activity.title, 'coach'],
  ['/coach/settings', 'Settings', 'coach'],
]

describe('routes', () => {
  it('renders the role picker at the start address', async () => {
    renderAt('/')
    expect(await screen.findByRole('heading', { level: 1, name: 'Who are you today?' })).toBeTruthy()
    for (const name of ['Amir', 'Danial', 'Irfan', 'Coach']) {
      expect(screen.getByRole('button', { name })).toBeTruthy()
    }
    expect(screen.getByRole('link', { name: 'Brand board' })).toBeTruthy()
  })

  it.each(PAGES)('%s renders its real page in the right shell', async (path, heading, side) => {
    renderAt(typeof path === 'function' ? path() : path)
    const name = typeof heading === 'function' ? heading() : heading
    expect(await screen.findByRole('heading', { level: 1, name }, { timeout: 25000 })).toBeTruthy()
    const registers = [...document.querySelectorAll('[data-register]')].map((el) => el.getAttribute('data-register'))
    expect(registers).toHaveLength(side === 'standalone' ? 0 : 1)
    expect(registers.includes(side)).toBe(side !== 'standalone')
    // The switcher shows on every route.
    expect(screen.getByRole('region', { name: 'Prototype controls' })).toBeTruthy()
  }, 20000)

  it('renders the brand board (a built page, not a stub)', async () => {
    renderAt('/brand')
    expect(await screen.findByRole('heading', { level: 1, name: 'Brand board' }, { timeout: 25000 })).toBeTruthy()
  }, 20000)

  it('renders the kit gallery (a built page, not a stub)', async () => {
    renderAt('/kit')
    expect(await screen.findByRole('heading', { level: 1, name: 'UI kit' }, { timeout: 25000 })).toBeTruthy()
  }, 20000)

  it.each([
    ['/nope', 'standalone'],
    ['/athlete/nope', 'athlete'],
    ['/coach/calender', 'coach'],
  ])('unknown address %s shows not-found in the %s frame', async (path, side) => {
    renderAt(path)
    expect(await screen.findByRole('heading', { level: 1, name: 'Off course' })).toBeTruthy()
    expect(screen.getByText(`#${path}`)).toBeTruthy()
    const shell = document.querySelector('[data-register]')
    expect(shell?.getAttribute('data-register') ?? 'standalone').toBe(side)
    expect(document.title).toBe('Not found · Laree')
  })

  it('redirects #/athlete and #/athlete/ to Today', async () => {
    for (const path of ['/athlete', '/athlete/']) {
      const router = renderAt(path)
      expect(await screen.findByRole('heading', { level: 1, name: 'Today' })).toBeTruthy()
      expect(router.state.location.pathname).toBe('/athlete/today')
      cleanup()
    }
  })

  it('redirects #/coach to Overview', async () => {
    const router = renderAt('/coach')
    expect(await screen.findByRole('heading', { level: 1, name: 'Overview' })).toBeTruthy()
    expect(router.state.location.pathname).toBe('/coach/overview')
  })
})

describe('athlete shell', () => {
  it('has five bar items with Log opening the sheet on Today', async () => {
    renderAt('/athlete/week')
    await screen.findByRole('heading', { level: 1, name: /^This week, / })
    const bar = screen.getByRole('navigation', { name: 'Athlete' })
    expect(bar.querySelectorAll('a')).toHaveLength(5)
    expect(screen.getByRole('link', { name: 'Week' }).getAttribute('aria-current')).toBe('page')
    expect(screen.getByRole('link', { name: 'Log' }).getAttribute('href')).toBe('/athlete/today?sheet=log')
  })

  it('keeps Week highlighted on a detail page and offers Back', async () => {
    renderAt(`/athlete/workout/${ids().workout.id}`)
    await screen.findByRole('heading', { level: 1, name: ids().workout.title })
    expect(screen.getByRole('link', { name: 'Week' }).getAttribute('aria-current')).toBe('page')
    expect(screen.getByRole('button', { name: /Back/ })).toBeTruthy()
  })
})

describe('coach shell', () => {
  it('lists the rail in order and remembers the last athlete viewed', async () => {
    renderAt('/coach/calendar/irfan')
    await screen.findByRole('heading', { level: 1, name: 'Calendar' })
    const rail = screen.getByRole('navigation', { name: 'Coach sections' })
    const labels = [...rail.querySelectorAll('ul a')].map((a) => a.querySelector('span:nth-of-type(2)')?.textContent ?? '')
    expect(labels).toEqual(['Overview', 'Amir', 'Danial', 'Irfan', 'Calendar', 'Season', 'Library', 'Analytics', 'Check-ins', 'Settings'])
    await waitFor(() => expect(useViewer.getState().coachAthleteId).toBe('irfan'))
  })
})

describe('prototype switcher', () => {
  it('shows who is viewing and updates the shell when the viewer changes', async () => {
    const router = renderAt('/athlete/week?w=-1')
    await screen.findByRole('heading', { level: 1, name: /^Last week, / })
    expect(screen.getByRole('radio', { name: 'Amir' }).getAttribute('aria-checked')).toBe('true')

    fireEvent.click(screen.getByRole('radio', { name: 'Danial' }))
    await waitFor(() => expect(useViewer.getState().athleteId).toBe('danial'))
    expect(screen.getByRole('radio', { name: 'Danial' }).getAttribute('aria-checked')).toBe('true')
    // Same section, Week keeps its ?w; the choice is never in the URL.
    expect(router.state.location.pathname).toBe('/athlete/week')
    expect(router.state.location.search).toBe('?w=-1')

    fireEvent.click(screen.getByRole('radio', { name: 'Coach' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Overview' })).toBeTruthy()
    expect(document.querySelector('[data-register]')?.getAttribute('data-register')).toBe('coach')
    expect(useViewer.getState().role).toBe('coach')

    fireEvent.click(screen.getByRole('radio', { name: 'Irfan' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Today' })).toBeTruthy()
    expect(document.querySelector('[data-register]')?.getAttribute('data-register')).toBe('athlete')
  })

  it('follows the route when the address disagrees, and says so', async () => {
    useViewer.setState({ role: 'athlete', athleteId: 'danial' })
    renderAt('/coach/overview')
    await screen.findByRole('heading', { level: 1, name: 'Overview' })
    await waitFor(() => expect(useViewer.getState().role).toBe('coach'))
    expect(await screen.findByText('Viewing as Coach, because this is a coach page.')).toBeTruthy()
  })

  it('opens the Prototype menu with the four destinations', async () => {
    renderAt('/athlete/today')
    await screen.findByRole('heading', { level: 1, name: 'Today' })
    fireEvent.click(screen.getByRole('button', { name: 'Prototype menu' }))
    const menu = screen.getAllByRole('navigation', { name: 'Prototype menu' })[0]
    expect([...(menu?.querySelectorAll('a') ?? [])].map((a) => a.textContent)).toEqual([
      'Role picker',
      'Brand board',
      'UI kit',
      'Reset demo data',
    ])
  })

  it('persists the viewer under laree:v1:viewer', () => {
    useViewer.getState().viewAs('irfan')
    const saved = JSON.parse(localStorage.getItem('laree:v1:viewer') ?? '{}') as { state?: { athleteId?: string } }
    expect(saved.state?.athleteId).toBe('irfan')
  })
})

describe('landingFor', () => {
  it('sends the coach to the last coach route, else Overview', () => {
    expect(landingFor('coach', '/athlete/today', '', null)).toBe('/coach/overview')
    expect(landingFor('coach', '/', '', '/coach/season/amir')).toBe('/coach/season/amir')
  })
  it('keeps the section for another athlete and drops sheets', () => {
    expect(landingFor('danial', '/athlete/progress', '?sheet=log', null)).toBe('/athlete/progress')
    expect(landingFor('danial', '/athlete/week', '?w=2', null)).toBe('/athlete/week?w=2')
  })
  it('sends detail pages and other routes to Today', () => {
    expect(landingFor('danial', '/athlete/workout/w1', '', null)).toBe('/athlete/today')
    expect(landingFor('amir', '/coach/overview', '', null)).toBe('/athlete/today')
  })
})
