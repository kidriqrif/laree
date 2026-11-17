import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { COACH, DEMO_ATHLETES, setRoster } from '../../app/people.ts'
import type { AthleteId } from '../../app/people.ts'
import { AthleteSwitcher } from './AthleteSwitcher.tsx'

afterEach(() => {
  cleanup()
  setRoster(COACH, DEMO_ATHLETES)
})

describe('the athlete switcher', () => {
  it('steps to the next and previous athlete, wrapping round the team', () => {
    const onChange = vi.fn<(id: AthleteId) => void>()
    render(<AthleteSwitcher value="amir" onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: 'Next athlete, Danial' }))
    fireEvent.click(screen.getByRole('button', { name: 'Previous athlete, Irfan' }))
    expect(onChange.mock.calls).toEqual([['danial'], ['irfan']])
  })

  it('shows whose screen it is in the picker', () => {
    render(<AthleteSwitcher value="danial" onChange={() => undefined} />)
    const group = screen.getByRole('group', { name: 'Switch athlete' })
    expect(group.textContent).toContain('Danial')
  })

  it('shows nothing when there is no one to switch to', () => {
    const [only] = DEMO_ATHLETES
    if (!only) throw new Error('the demo has athletes')
    setRoster(COACH, [only])
    const { container } = render(<AthleteSwitcher value={only.id} onChange={() => undefined} />)
    expect(container.textContent).toBe('')
  })
})
