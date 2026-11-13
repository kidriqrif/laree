import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createMemoryRouter } from 'react-router'
import { RouterProvider } from 'react-router/dom'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useLaree } from '../data/store.ts'
import { showToast, toastQueue } from '../ui/overlay/index.ts'
import { routes } from './router.tsx'
import { useViewer } from './viewer.ts'

const viewAs = (role: 'coach' | 'athlete', athleteId: 'amir' | 'danial' | 'irfan' = 'amir') =>
  useViewer.setState({ role, athleteId, coachAthleteId: 'amir', chosen: true })

function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  render(<RouterProvider router={router} />)
  return router
}

beforeEach(() => {
  localStorage.clear()
  useLaree.getState().reset()
  document.documentElement.removeAttribute('data-theme')
})

afterEach(() => {
  act(() => {
    for (const t of toastQueue.visibleToasts) toastQueue.close(t.key)
  })
  cleanup()
  document.documentElement.removeAttribute('data-theme')
})

describe('toasts', () => {
  it('appear in the athlete shell, in the athlete register', async () => {
    viewAs('athlete')
    renderAt('/athlete/me')
    await screen.findByRole('navigation', { name: 'Athlete' })
    act(() => {
      showToast('Shared with Coach')
    })
    const toast = await screen.findByText('Shared with Coach')
    expect(toast.closest('[data-register]')?.getAttribute('data-register')).toBe('athlete')
    expect(screen.getAllByRole('region', { name: /Notifications/ })).toHaveLength(1)
  })

  it('appear in the coach shell, in the coach register', async () => {
    viewAs('coach')
    renderAt('/coach/settings')
    await screen.findByRole('navigation', { name: 'Coach sections' })
    act(() => {
      showToast('Moved Tempo run to Thu')
    })
    const toast = await screen.findByText('Moved Tempo run to Thu')
    expect(toast.closest('[data-register]')?.getAttribute('data-register')).toBe('coach')
    expect(screen.getAllByRole('region', { name: /Notifications/ })).toHaveLength(1)
  })
})

describe('theme', () => {
  const theme = () => document.documentElement.getAttribute('data-theme')

  it("applies the viewer's saved theme on any screen and follows the viewer", async () => {
    useLaree.getState().setSettings('amir', { theme: 'dark' })
    useLaree.getState().setSettings('coach', { theme: 'light' })
    viewAs('athlete', 'amir')
    renderAt('/athlete/progress')
    await screen.findByRole('navigation', { name: 'Athlete' })
    expect(theme()).toBe('dark')

    // Danial keeps the system setting, so the attribute goes.
    act(() => viewAs('athlete', 'danial'))
    expect(theme()).toBeNull()

    act(() => viewAs('coach'))
    expect(theme()).toBe('light')

    act(() => useLaree.getState().setSettings('coach', { theme: 'system' }))
    expect(theme()).toBeNull()
  })

  it('applies the theme on the role picker too', async () => {
    useLaree.getState().setSettings('irfan', { theme: 'dark' })
    viewAs('athlete', 'irfan')
    renderAt('/')
    // The role picker is its own chunk, so the frame draws once it has loaded.
    await screen.findByRole('heading', { level: 1, name: 'Who are you today?' })
    expect(theme()).toBe('dark')
  })
})

describe('single-key shortcuts', () => {
  it('follow the coach setting, and can be turned back on', async () => {
    viewAs('coach')
    useLaree.getState().setSettings('coach', { singleKeyShortcuts: false })
    const router = renderAt('/coach/settings')
    await screen.findByRole('navigation', { name: 'Coach sections' })
    fireEvent.keyDown(document.body, { key: 'g' })
    fireEvent.keyDown(document.body, { key: 'i' })
    expect(router.state.location.pathname).toBe('/coach/settings')

    act(() => useLaree.getState().setSettings('coach', { singleKeyShortcuts: true }))
    fireEvent.keyDown(document.body, { key: 'g' })
    fireEvent.keyDown(document.body, { key: 'i' })
    await waitFor(() => expect(router.state.location.pathname).toBe('/coach/check-ins'))
  })
})
