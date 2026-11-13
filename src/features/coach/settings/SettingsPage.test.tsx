import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { createMemoryRouter } from 'react-router'
import { RouterProvider } from 'react-router/dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { routes } from '../../../app/router.tsx'
import { useViewer } from '../../../app/viewer.ts'
import { useLaree } from '../../../data/store.ts'

// The consent dialog is another task's part. A stand-in shows that it opened for the right athlete.
vi.mock('./AiConsentDialog.tsx', async () => {
  const { createElement } = await import('react')
  return {
    AiConsentDialog: ({ athleteId, isOpen, onClose }: { athleteId: string; isOpen: boolean; onClose: () => void }) =>
      isOpen
        ? createElement(
            'div',
            { role: 'dialog', 'aria-label': `AI consent for ${athleteId}` },
            createElement('button', { type: 'button', onClick: onClose }, 'Close consent'),
          )
        : null,
  }
})

function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  render(<RouterProvider router={router} />)
  return router
}

const heading = () => screen.findByRole('heading', { level: 1, name: 'Settings' }, { timeout: 25000 })
const consentTable = () => screen.findByRole('table', { name: 'AI consent by athlete' }, { timeout: 25000 })
const rowFor = (table: HTMLElement, name: string) => within(table).getByRole('rowheader', { name }).closest('tr') as HTMLElement

beforeEach(() => {
  localStorage.clear()
  useLaree.getState().reset()
  useViewer.setState({ role: 'coach', athleteId: 'amir', coachAthleteId: 'amir', chosen: true })
})
afterEach(cleanup)

describe('Coach settings page', () => {
  it('shows one consent row per athlete with the seeded state (all off)', async () => {
    renderAt('/coach/settings')
    await heading()
    const table = await consentTable()
    const rows = within(table).getAllByRole('row')
    expect(rows).toHaveLength(4)
    for (const name of ['Amir', 'Danial', 'Irfan']) {
      const row = rowFor(table, name)
      expect(row.textContent).toContain('Off')
      expect(row.textContent).toContain('Off')
    }
  })

  it('reads active and waiting for the athlete from the stored consent', async () => {
    useViewer.setState({ role: 'athlete', athleteId: 'amir' })
    useLaree.getState().setAiConsent('amir', true)
    useViewer.setState({ role: 'coach', athleteId: 'amir' })
    useLaree.getState().setAiConsent('coach', true)
    renderAt('/coach/settings')
    await heading()
    const table = await consentTable()
    expect(rowFor(table, 'Amir').textContent).toContain('Active')
    expect(rowFor(table, 'Danial').textContent).toContain('Waiting for the athlete')
    expect(rowFor(table, 'Irfan').textContent).toContain('Waiting for the athlete')
  })

  it('the one coach switch opens the consent dialog', async () => {
    renderAt('/coach/settings')
    await heading()
    const table = await consentTable()
    expect(table).toBeTruthy()
    // The visible label is the switch's name; the state sits in the hint, not in the label.
    const coachSwitch = screen.getByRole('switch', { name: 'Coach AI for the team' })
    expect(screen.getByText('Coach AI for the team')).toBeTruthy()
    expect(coachSwitch.getAttribute('aria-describedby')).toBeTruthy()
    expect(screen.getByText('Off for every athlete.')).toBeTruthy()
    fireEvent.click(coachSwitch)
    expect(await screen.findByRole('dialog', { name: 'AI consent for amir' })).toBeTruthy()
    expect(useLaree.getState().data.settings.coach.aiConsent).toBe(false)
  })

  it('switches the theme through the store', async () => {
    renderAt('/coach/settings')
    await heading()
    fireEvent.click(screen.getByRole('radio', { name: 'Dark' }))
    expect(useLaree.getState().data.settings.coach.theme).toBe('dark')
    await waitFor(() => expect(document.documentElement.getAttribute('data-theme')).toBe('dark'))
    fireEvent.click(screen.getByRole('radio', { name: 'Light' }))
    expect(useLaree.getState().data.settings.coach.theme).toBe('light')
    fireEvent.click(screen.getByRole('radio', { name: 'System' }))
    expect(useLaree.getState().data.settings.coach.theme).toBe('system')
  })

  it('the single-key switch writes the coach setting and is on by default', async () => {
    renderAt('/coach/settings')
    await heading()
    const toggle = screen.getByRole('switch', { name: 'Single-key shortcuts' }) as HTMLInputElement
    expect(toggle.checked).toBe(true)
    fireEvent.click(toggle)
    expect(useLaree.getState().data.settings.coach.singleKeyShortcuts).toBe(false)
    await waitFor(() => expect((screen.getByRole('switch', { name: 'Single-key shortcuts' }) as HTMLInputElement).checked).toBe(false))
    fireEvent.click(screen.getByRole('switch', { name: 'Single-key shortcuts' }))
    expect(useLaree.getState().data.settings.coach.singleKeyShortcuts).toBe(true)
  })

  it('links to the reset page', async () => {
    renderAt('/coach/settings')
    await heading()
    expect(screen.getByRole('link', { name: 'Reset demo data' }).getAttribute('href')).toBe('/reset')
  })
})
