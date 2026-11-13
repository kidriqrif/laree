import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useViewer } from '../app/viewer.ts'
import { selectAiState } from '../data/selectors.ts'
import { useLaree } from '../data/store.ts'
import { AiSection } from '../features/athlete/me/AiSection.tsx'
import { AiConsentDialog } from '../features/coach/settings/AiConsentDialog.tsx'
import CoachConsentDialog from './CoachConsentDialog.tsx'

const state = (id: 'amir' | 'danial' = 'amir') => selectAiState(useLaree.getState().data, id)

beforeEach(() => {
  localStorage.clear()
  useLaree.getState().reset()
  useViewer.setState({ role: 'athlete', athleteId: 'amir', coachAthleteId: 'amir', chosen: true })
})
afterEach(cleanup)

describe('AiSection', () => {
  it('starts off and opens the consent sheet when the toggle goes on', async () => {
    render(<AiSection athleteId="amir" />)
    expect(screen.getByText(/Off\. AI also needs Coach/)).toBeTruthy()
    fireEvent.click(screen.getByRole('switch', { name: 'AI summaries' }))
    expect(await screen.findByRole('dialog', { name: 'Turn on AI summaries?' })).toBeTruthy()
    expect(screen.getByText(/claude-haiku-5-5/)).toBeTruthy()
    expect(screen.getByText(/claude-sonnet-5-5/)).toBeTruthy()
    expect(screen.getAllByText(/simulated output only/).length).toBeGreaterThan(0)
    expect(state()).toBe('off')
  })

  it('Not now leaves it off; Turn on gives "On for you" until Coach agrees', async () => {
    render(<AiSection athleteId="amir" />)
    fireEvent.click(screen.getByRole('switch', { name: 'AI summaries' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Not now' }))
    expect(state()).toBe('off')
    fireEvent.click(screen.getByRole('switch', { name: 'AI summaries' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Turn on' }))
    expect(state()).toBe('athlete-only')
    expect(await screen.findByText("On for you. Coach hasn't turned AI on yet.")).toBeTruthy()
  })

  it('tells the athlete when Coach has already turned AI on', async () => {
    useViewer.setState({ role: 'coach' })
    useLaree.getState().setAiConsent('coach', true)
    useViewer.setState({ role: 'athlete' })
    render(<AiSection athleteId="amir" />)
    fireEvent.click(screen.getByRole('switch', { name: 'AI summaries' }))
    expect(await screen.findByText('Coach has turned AI on. Turning it on here starts it for you.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Turn on' }))
    expect(state()).toBe('active')
  })

  it('keeps the unsaved-withdrawal warning under the switch, as after a reload that restored it', () => {
    // State as merge() leaves it when only the session note held Amir's withdrawal.
    useLaree.setState({ aiUnsavedOwners: ['amir'], aiWithdrawalUnsaved: true })
    render(<AiSection athleteId="amir" />)
    expect(screen.getByRole('switch', { name: 'AI summaries' }).getAttribute('aria-invalid')).toBe('true')
    expect(screen.getByText(/could not save that choice for good/)).toBeTruthy()
  })

  it("does not show another athlete's unsaved withdrawal", () => {
    useLaree.setState({ aiUnsavedOwners: ['danial'], aiWithdrawalUnsaved: true })
    render(<AiSection athleteId="amir" />)
    expect(screen.queryByText(/could not save that choice for good/)).toBeNull()
  })

  it('turns off at once with one tap', async () => {
    useLaree.getState().setAiConsent('amir', true)
    render(<AiSection athleteId="amir" />)
    fireEvent.click(screen.getByRole('switch', { name: 'AI summaries' }))
    expect(state()).toBe('off')
  })
})

describe('AiConsentDialog', () => {
  it('lets Coach turn the team layer on but never makes AI active without the athlete', async () => {
    useViewer.setState({ role: 'coach' })
    render(<AiConsentDialog athleteId="amir" isOpen onClose={() => undefined} />)
    expect(await screen.findByRole('dialog', { name: 'Turn on AI features?' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Turn on' }))
    expect(useLaree.getState().data.settings.coach.aiConsent).toBe(true)
    expect(state()).toBe('waiting-for-athlete')
    expect(state('danial')).toBe('waiting-for-athlete')
  })

  it('refuses when someone other than Coach is viewing', async () => {
    render(<AiConsentDialog athleteId="amir" isOpen onClose={() => undefined} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Turn on' }))
    expect(useLaree.getState().data.settings.coach.aiConsent).toBe(false)
    expect(await screen.findByRole('alert')).toBeTruthy()
  })
})

describe('CoachConsentDialog unsaved withdrawal', () => {
  it('offers Try saving again instead of Turn on, and clears once the save works', async () => {
    useViewer.setState({ role: 'coach' })
    useLaree.getState().setAiConsent('coach', true)
    const failing = { getItem: () => null, removeItem: () => undefined, setItem: () => { throw new DOMException('full') } }
    vi.stubGlobal('localStorage', failing)
    vi.stubGlobal('sessionStorage', failing)
    try {
      render(<CoachConsentDialog athleteId="amir" isOpen onClose={() => undefined} />)
      fireEvent.click(await screen.findByRole('button', { name: 'Turn off' }))
      expect(await screen.findByRole('button', { name: 'Try saving again' })).toBeTruthy()
      expect(screen.queryByRole('button', { name: 'Turn on' })).toBeNull()
      expect(screen.getAllByRole('button', { name: 'Close' }).length).toBeGreaterThan(0)
      expect(screen.getByRole('alert').textContent).toMatch(/could not save/)
      vi.unstubAllGlobals()
      fireEvent.click(screen.getByRole('button', { name: 'Try saving again' }))
      expect(useLaree.getState().aiWithdrawalUnsaved).toBe(false)
      expect(useLaree.getState().data.settings.coach.aiConsent).toBe(false)
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
