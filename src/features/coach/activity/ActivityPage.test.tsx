import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useViewer } from '../../../app/viewer.ts'
import { selectActivityCoachNote } from '../../../data/selectors.ts'
import { useLaree } from '../../../data/store.ts'
import ActivityPage from './ActivityPage.tsx'

beforeEach(() => {
  localStorage.clear()
  useLaree.getState().reset()
  useViewer.setState({ role: 'coach', chosen: true })
})
afterEach(cleanup)

function show(id: string) {
  render(
    <MemoryRouter initialEntries={[`/coach/activity/${id}`]}>
      <Routes>
        <Route path="/coach/activity/:activityId" element={<ActivityPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('coach activity page', () => {
  it('renders a seeded activity', () => {
    const a = useLaree.getState().data.activities[0]!
    show(a.id)
    expect(screen.getByRole('heading', { level: 1 })).toBeTruthy()
    expect(screen.getByLabelText('Note for the athlete')).toBeTruthy()
  })

  it('saves the note', () => {
    const a = useLaree.getState().data.activities[0]!
    show(a.id)
    fireEvent.change(screen.getByLabelText('Note for the athlete'), { target: { value: 'Well paced.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save note' }))
    expect(selectActivityCoachNote(useLaree.getState().data, a.id)).toBe('Well paced.')
  })

  it('shows not found for an unknown id', () => {
    show('nope')
    expect(screen.getByText('Activity not found')).toBeTruthy()
    expect(screen.queryByLabelText('Note for the athlete')).toBeNull()
  })
})
