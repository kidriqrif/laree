import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useViewer } from '../../../app/viewer.ts'
import { currentDay } from '../../../data/selectors.ts'
import { useLaree } from '../../../data/store.ts'
import { ActivityDetail } from '../../shared/activity/ActivityDetail.tsx'
import ActivityPage from '../activity/ActivityPage.tsx'
import { LOG_MATCH_DRAFT, readLogMatch } from '../today/logMatch.ts'
import WorkoutPage from './WorkoutPage.tsx'

beforeEach(() => {
  useLaree.getState().reset()
  useViewer.getState().viewAs('amir')
})
afterEach(cleanup)

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/athlete/workout/:workoutId" element={<WorkoutPage />} />
        <Route path="/athlete/activity/:activityId" element={<ActivityPage />} />
        <Route path="/athlete/today" element={<p>On Today</p>} />
      </Routes>
    </MemoryRouter>,
  )

describe('WorkoutPage', () => {
  it('shows steps with targets and a profile chart for a structured session', () => {
    const w = useLaree.getState().data.planned.find((p) => p.athleteId === 'amir' && p.steps.length > 0)!
    renderAt(`/athlete/workout/${w.id}`)
    expect(screen.getByRole('heading', { level: 1, name: w.title })).toBeTruthy()
    expect(screen.getByRole('list', { name: 'Steps' })).toBeTruthy()
    expect(screen.getByText('Session profile')).toBeTruthy()
  })
  it('pre-matches the session before opening the log sheet on Today', () => {
    const { data } = useLaree.getState()
    const today = currentDay()
    const w = data.planned.find(
      (p) => p.athleteId === 'amir' && p.day <= today && !data.activities.some((a) => a.matchedWorkoutId === p.id),
    )!
    renderAt(`/athlete/workout/${w.id}`)
    fireEvent.click(screen.getByRole('button', { name: 'Log it' }))
    expect(screen.getByText('On Today')).toBeTruthy()
    const drafts = useLaree.getState().data.drafts as Readonly<Record<string, unknown>>
    expect(LOG_MATCH_DRAFT in drafts).toBe(true)
    expect(readLogMatch(drafts, 'amir', today)).toBe(w.id)
  })
  it('shows not found for an unknown id and for another athlete', () => {
    renderAt('/athlete/workout/nope')
    expect(screen.getByRole('heading', { name: 'Session not found' })).toBeTruthy()
    cleanup()
    const other = useLaree.getState().data.planned.find((p) => p.athleteId === 'danial')!
    renderAt(`/athlete/workout/${other.id}`)
    expect(screen.getByRole('heading', { name: 'Session not found' })).toBeTruthy()
  })
})

const find = () => useLaree.getState().data.activities.find((a) => a.athleteId === 'amir' && a.matchedWorkoutId)!

describe('ActivityDetail', () => {

  it('renders for the athlete with a disabled Strava button', () => {
    const a = find()
    render(<ActivityDetail activityId={a.id} viewer="athlete" />, { wrapper: MemoryRouter })
    expect(screen.getByRole('heading', { level: 1, name: a.title })).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Share to Strava' }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText(/Strava is outbound only/)).toBeTruthy()
    expect(screen.getByText(/Load \d/)).toBeTruthy()
  })
  it('renders for the coach, read-only, with the athlete name', () => {
    const a = find()
    render(<ActivityDetail activityId={a.id} viewer="coach" />, { wrapper: MemoryRouter })
    expect(screen.getByText('Amir')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /effort and notes/i })).toBeNull()
  })
  it('shows not found for unknown ids and for another athlete', () => {
    render(<ActivityDetail activityId="nope" viewer="athlete" />, { wrapper: MemoryRouter })
    expect(screen.getByRole('heading', { name: 'Activity not found' })).toBeTruthy()
    cleanup()
    const other = useLaree.getState().data.activities.find((a) => a.athleteId === 'danial')!
    render(<ActivityDetail activityId={other.id} viewer="athlete" />, { wrapper: MemoryRouter })
    expect(screen.getByRole('heading', { name: 'Activity not found' })).toBeTruthy()
  })
  it('the athlete page reads the id from the route', () => {
    const a = find()
    renderAt(`/athlete/activity/${a.id}`)
    expect(screen.getByRole('heading', { level: 1, name: a.title })).toBeTruthy()
  })
})
