import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createMemoryRouter, Outlet, type RouteObject } from 'react-router'
import { RouterProvider } from 'react-router/dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CHUNK_RELOAD_KEY, isChunkLoadError, RouteError } from './RouteError.tsx'
import { routes } from './router.tsx'
import { useViewer } from './viewer.ts'

// The real Today page is swapped for one that crashes, to prove the athlete shell survives it.
vi.mock('../features/athlete/today/TodayPage.tsx', () => ({
  default: () => {
    throw new Error('Today broke')
  },
}))

const STALE = 'Failed to fetch dynamically imported module: http://localhost/assets/BrandPage-old.js'

function Crash({ error }: { error: unknown }): never {
  throw error
}

/** A rail plus a guarded outlet, the same shape as the real shells. */
function renderCrash(error: unknown, entries = ['/home', '/boom']) {
  const tree: RouteObject[] = [
    {
      path: '/',
      element: (
        <div>
          <nav aria-label="Rail">Rail</nav>
          <Outlet />
        </div>
      ),
      children: [
        {
          errorElement: <RouteError scope="coach" />,
          children: [
            { path: 'home', element: <p>Home screen</p> },
            { path: 'boom', element: <Crash error={error} /> },
            {
              path: 'missing',
              loader: () => {
                throw new Response(null, { status: 404 })
              },
              element: <p>Never shown</p>,
            },
          ],
        },
      ],
    },
  ]
  const router = createMemoryRouter(tree, { initialEntries: entries, initialIndex: entries.length - 1 })
  render(<RouterProvider router={router} />)
}

const heading = () => screen.findByRole('heading', { name: 'Something went wrong on this screen' })

let reload: ReturnType<typeof vi.fn<() => void>>

beforeEach(() => {
  sessionStorage.clear()
  localStorage.clear()
  // React and the router report every caught error. These ones are on purpose.
  vi.spyOn(console, 'error').mockImplementation(() => {})
  reload = vi.fn<() => void>()
  vi.spyOn(window.location, 'reload').mockImplementation(reload)
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('isChunkLoadError', () => {
  it("knows each browser's wording for code that could not be fetched", () => {
    expect(isChunkLoadError(new TypeError(STALE))).toBe(true)
    expect(isChunkLoadError(new TypeError('Importing a module script failed.'))).toBe(true)
    expect(isChunkLoadError(new TypeError('error loading dynamically imported module: x.js'))).toBe(true)
    expect(isChunkLoadError(new Error('Unable to preload CSS for /assets/a.css'))).toBe(true)
    expect(isChunkLoadError(new TypeError('Cannot read properties of undefined'))).toBe(false)
    expect(isChunkLoadError(null)).toBe(false)
  })
})

describe('RouteError', () => {
  it('shows the notice inside the shell, focused, with the error for a bug report', async () => {
    renderCrash(new Error('Chart exploded'))
    const h1 = await heading()
    expect(screen.getByRole('navigation', { name: 'Rail' })).toBeTruthy()
    await waitFor(() => expect(document.activeElement).toBe(h1))
    expect(screen.getByText(/Everything you saved is still on this device/)).toBeTruthy()
    expect(screen.getByText('Chart exploded')).toBeTruthy()
    expect(reload).not.toHaveBeenCalled()
  })

  it('reloads when asked', async () => {
    renderCrash(new Error('x'))
    await heading()
    fireEvent.click(screen.getByRole('button', { name: 'Reload' }))
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('goes back to the previous screen', async () => {
    renderCrash(new Error('x'))
    await heading()
    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    expect(await screen.findByText('Home screen')).toBeTruthy()
  })

  it("offers the side's main page when there is nothing to go back to", async () => {
    renderCrash(new Error('x'), ['/boom'])
    await heading()
    expect(screen.getByRole('button', { name: 'Go to Overview' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull()
  })

  it('reloads once when the screen code is gone after an update', async () => {
    renderCrash(new TypeError(STALE))
    expect((await screen.findByRole('status')).textContent).toBe('Loading the newest version of Laree…')
    await waitFor(() => expect(reload).toHaveBeenCalled())
    expect(Number(sessionStorage.getItem(CHUNK_RELOAD_KEY))).toBeGreaterThan(0)
  })

  it('shows the notice instead of reloading again straight away', async () => {
    sessionStorage.setItem(CHUNK_RELOAD_KEY, String(Date.now()))
    renderCrash(new TypeError(STALE))
    await heading()
    expect(screen.getByText(/didn't load/)).toBeTruthy()
    expect(reload).not.toHaveBeenCalled()
  })

  it('shows the not-found page when the item is missing', async () => {
    renderCrash(null, ['/missing'])
    expect(await screen.findByRole('heading', { name: 'Off course' })).toBeTruthy()
  })
})

describe('app routes', () => {
  it('keeps the athlete bottom bar working when a page crashes', async () => {
    useViewer.setState({ role: 'athlete', athleteId: 'amir', coachAthleteId: 'amir', chosen: false })
    const router = createMemoryRouter(routes, { initialEntries: ['/athlete/today'] })
    render(<RouterProvider router={router} />)
    await heading()
    expect(screen.getByRole('link', { name: 'Week' })).toBeTruthy()
    expect(screen.getByText('Today broke')).toBeTruthy()
  })
})
