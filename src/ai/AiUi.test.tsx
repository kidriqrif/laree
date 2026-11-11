import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useViewer } from '../app/viewer.ts'
import { selectAiState } from '../data/selectors.ts'
import { useLaree } from '../data/store.ts'
import { AiSection } from '../features/athlete/me/AiSection.tsx'
import { AiConsentDialog } from '../features/coach/settings/AiConsentDialog.tsx'

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
