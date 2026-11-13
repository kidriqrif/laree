import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { createMemoryRouter } from 'react-router'
import { RouterProvider } from 'react-router/dom'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { routes } from '../../../app/router.tsx'
import { useViewer } from '../../../app/viewer.ts'
import { freshData, useLaree } from '../../../data/store.ts'

function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  render(<RouterProvider router={router} />)
  return router
}

beforeEach(() => {
  localStorage.clear()
  document.documentElement.removeAttribute('data-theme')
  useLaree.getState().reset()
  useViewer.setState({ role: 'athlete', athleteId: 'amir', coachAthleteId: 'amir', chosen: true })
})
afterEach(cleanup)

const heading = (name: string) => screen.findByRole('heading', { name }, { timeout: 25000 })

describe('Me page', () => {
  it("shows Amir's FTP history from 245 W to 255 W with a date", async () => {
    renderAt('/athlete/me')
    await heading('Thresholds')
    const card = screen.getByTestId('threshold-ftp')
    expect(within(card).getByText('255 W')).toBeTruthy()
    const line = within(card).getByText(/FTP 245 W to 255 W, set by Coach, from week 9 \(\d{1,2} \w+ \d{4}\)/)
    expect(line).toBeTruthy()
  })

  it('says when a threshold is not set', async () => {
    useViewer.setState({ athleteId: 'danial' })
    renderAt('/athlete/me')
    await heading('Thresholds')
    expect(within(screen.getByTestId('threshold-thresholdPace')).getByText(/3:58 \/km/)).toBeTruthy()
    expect(screen.queryByTestId('threshold-ftp')).toBeNull()
  })

  it('explains why Strava is outbound only and disables sharing', async () => {
    renderAt('/athlete/me')
    await heading('Data in and out')
    expect(screen.getByText(/Strava only shows activities to the athlete who owns them/)).toBeTruthy()
    // The row says what it does; the button does not repeat it.
    expect(screen.getByText('Send a session to Strava')).toBeTruthy()
    expect(screen.getAllByText('Share to Strava')).toHaveLength(1)
    expect((screen.getByRole('button', { name: 'Share to Strava' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('switches theme through the store and data-theme', async () => {
    renderAt('/athlete/me')
    await heading('Preferences')
    fireEvent.click(screen.getByRole('radio', { name: 'Dark' }))
    await waitFor(() => expect(document.documentElement.getAttribute('data-theme')).toBe('dark'))
    expect(useLaree.getState().data.settings.amir.theme).toBe('dark')
    fireEvent.click(screen.getByRole('radio', { name: 'Light' }))
    await waitFor(() => expect(document.documentElement.getAttribute('data-theme')).toBe('light'))
    fireEvent.click(screen.getByRole('radio', { name: 'System' }))
    await waitFor(() => expect(document.documentElement.hasAttribute('data-theme')).toBe(false))
    expect(useLaree.getState().data.settings.amir.theme).toBe('system')
  })

  it('links to the reset page', async () => {
    renderAt('/athlete/me')
    await heading('Prototype')
    expect(screen.getByRole('link', { name: 'Reset demo data' }).getAttribute('href')).toBe('/reset')
  })
})

describe('Reset page', () => {
  it('does nothing on visit, asks first, then restores the seed', async () => {
    useLaree.getState().setSettings('amir', { theme: 'dark' })
    useLaree.getState().setPref('x', 1)
    const router = renderAt('/reset')
    await heading('Reset demo data')
    expect(useLaree.getState().data.settings.amir.theme).toBe('dark')

    fireEvent.click(screen.getByRole('button', { name: 'Reset demo data' }))
    const dialog = await screen.findByRole('alertdialog')
    expect(useLaree.getState().data.settings.amir.theme).toBe('dark')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Reset demo data' }))

    await screen.findByText('Demo data reset.')
    const data = useLaree.getState().data
    const seed = freshData()
    expect(data.settings).toEqual(seed.settings)
    expect(data.prefs).toEqual({})
    expect(data.thresholds).toEqual(seed.thresholds)
    expect(useViewer.getState().chosen).toBe(false)
    fireEvent.click(screen.getByRole('link', { name: 'Choose who to view as' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/'))
  })

  it('keeps everything when the dialog is cancelled', async () => {
    useLaree.getState().setPref('x', 1)
    renderAt('/reset')
    await heading('Reset demo data')
    fireEvent.click(screen.getByRole('button', { name: 'Reset demo data' }))
    const dialog = await screen.findByRole('alertdialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Keep my changes' }))
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
    expect(useLaree.getState().data.prefs).toEqual({ x: 1 })
  })
})
