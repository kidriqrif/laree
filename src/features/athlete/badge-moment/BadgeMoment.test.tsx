import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useViewer } from '../../../app/viewer.ts'
import { useLaree } from '../../../data/store.ts'
import { setNow } from '../../../domain/time.ts'
import { BadgeMoment } from './BadgeMoment.tsx'

const MONDAY_10AM_KL = Date.UTC(2026, 10, 9, 2)
const ME = 'amir'

beforeEach(() => {
  setNow(MONDAY_10AM_KL)
  useLaree.getState().reset()
  useViewer.getState().viewAs(ME)
})
afterEach(() => {
  cleanup()
  setNow(null)
})

describe('badge moment', () => {
  it('shows two badges one after the other and opens Progress', () => {
    const mine = useLaree.getState().data.badges.filter((b) => b.athleteId === ME)
    expect(mine.length).toBeGreaterThan(1)
    act(() => {
      useLaree.setState((s) => ({ data: { ...s.data, badgeSeen: { ...s.data.badgeSeen, [ME]: [] } } }))
    })
    render(
      <MemoryRouter initialEntries={['/athlete/today']}>
        <Routes>
          <Route path="/athlete/today" element={<BadgeMoment />} />
          <Route path="/athlete/progress" element={<h1>Progress</h1>} />
        </Routes>
      </MemoryRouter>,
    )
    const firstKey = screen.getByTestId('badge-moment').getAttribute('data-badge')
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    const second = screen.getByTestId('badge-moment').getAttribute('data-badge')
    expect(firstKey).not.toBeNull()
    expect(second).not.toBeNull()
    expect(screen.getByTestId('finish-tape')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'See your badges' }))
    expect(screen.getByText('Progress')).toBeTruthy()
  })

  it('draws nothing when every badge is seen', () => {
    const { container } = render(
      <MemoryRouter>
        <BadgeMoment />
      </MemoryRouter>,
    )
    act(() => {
      useLaree.setState((s) => ({
        data: { ...s.data, badgeSeen: { ...s.data.badgeSeen, [ME]: s.data.badges.map((b) => b.id) } },
      }))
    })
    expect(container.innerHTML).toBe('')
  })
})
