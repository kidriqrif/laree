import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useViewer } from '../../../app/viewer.ts'
import { currentDay } from '../../../data/selectors.ts'
import { useLaree } from '../../../data/store.ts'
import type { LareeData } from '../../../data/store.ts'
import { BAND_LABELS } from '../../../domain/metrics/compliance.ts'
import { setNow, weekOfDay } from '../../../domain/time.ts'
import type { Activity, DayOffset } from '../../../domain/types.ts'
import { LOG_MATCH_DRAFT, readLogMatch } from './logMatch.ts'
import TodayPage from './TodayPage.tsx'
import { durationFigure, mainSetLine, raceLine, sessionName, sportName, todayModel } from './todayModel.ts'
import { QUIET_WAIT_MS } from './useStoreReady.ts'

// A fixed week, so the seed and "today" are the same on every run. Monday 9 Nov 2026, 10:00 in KL.
const MONDAY_10AM_KL = Date.UTC(2026, 10, 9, 2)
const DAY_MS = 86_400_000

function at(weekday: number): void {
  setNow(MONDAY_10AM_KL + weekday * DAY_MS)
  useLaree.getState().reset()
  useViewer.getState().viewAs('amir')
}

const data = (): LareeData => useLaree.getState().data
const amirPlanned = (day: DayOffset) => data().planned.filter((w) => w.athleteId === 'amir' && w.day === day)

/** The first weekday of the fixed week whose seed fits, so the tests follow the seed instead of guessing. */
function weekdayWhere(fits: (today: DayOffset) => boolean): number {
  for (let i = 1; i < 7; i++) {
    at(i)
    if (fits(currentDay())) return i
  }
  throw new Error('No seeded day fits')
}

// Amir has a session today and a logged session yesterday: every state below is derived from that day.
let weekday = -1
function setUp(): void {
  if (weekday < 0) {
    weekday = weekdayWhere((t) => {
      const yesterday = amirPlanned(t - 1)
      return (
        amirPlanned(t).length > 0 &&
        yesterday.length > 0 &&
        yesterday.every((w) => data().activities.some((a) => a.matchedWorkoutId === w.id))
      )
    })
  }
  at(weekday)
}

function setData(change: (d: LareeData) => Partial<LareeData>): void {
  useLaree.setState((s) => ({ data: { ...s.data, ...change(s.data) } }))
}

function Where() {
  const l = useLocation()
  return <output data-testid="where">{`${l.pathname}${l.search}`}</output>
}

function renderToday() {
  return render(
    <MemoryRouter initialEntries={['/athlete/today']}>
      <Routes>
        <Route path="/athlete/today" element={<TodayPage />} />
        <Route path="/athlete/workout/:workoutId" element={<h1>Workout</h1>} />
        <Route path="/athlete/activity/:activityId" element={<h1>Activity</h1>} />
        <Route path="/athlete/week" element={<h1>Week</h1>} />
      </Routes>
      <Where />
    </MemoryRouter>,
  )
}

const kind = () => document.querySelector('[data-today]')?.getAttribute('data-today')

beforeEach(setUp)
afterEach(cleanup)
afterAll(() => setNow(null))

describe('TodayPage', () => {
  it('shows today as a bib card that links to the workout', () => {
    renderToday()
    const first = amirPlanned(currentDay()).toSorted((a, b) => a.order - b.order)[0]!
    expect(screen.getByRole('heading', { level: 1, name: 'Today' })).toBeTruthy()
    expect(kind()).toBe('sessions')

    const bibs = screen.getAllByTestId('session-bib')
    expect(bibs.length).toBe(amirPlanned(currentDay()).length)
    const bib = bibs[0]!
    // One link whose name joins sport, title, duration and the key-session mark (A1 accessibility).
    const name = bib.getAttribute('aria-label') ?? ''
    expect(name.startsWith(`${sportName(first.sport)}. ${sessionName(first.title, first.sport)}.`)).toBe(true)
    expect(name).toContain(durationFigure(first.plannedDurationS).words)
    expect(name.includes('Key session')).toBe(first.keySession === true)
    expect(within(bib).queryByText('Coach’s note') !== null).toBe(Boolean(first.coachNote))

    fireEvent.click(bib)
    expect(screen.getByTestId('where').textContent).toBe(`/athlete/workout/${first.id}`)
  })

  it('"Log it" opens the log sheet with the session pre-matched', () => {
    renderToday()
    const first = amirPlanned(currentDay()).toSorted((a, b) => a.order - b.order)[0]!
    // One primary action on the screen.
    const logIt = screen.getByRole('button', { name: `Log it: ${sessionName(first.title, first.sport)}` })
    fireEvent.click(logIt)
    expect(screen.getByTestId('where').textContent).toBe('/athlete/today?sheet=log')
    // The session travels in app state, not in the URL (IA 9.2).
    expect(readLogMatch(data().drafts, 'amir', currentDay())).toBe(first.id)
    expect(data().drafts[LOG_MATCH_DRAFT]).toMatchObject({ athleteId: 'amir', workoutId: first.id })
  })

  it('shows the result once the session is done: band and load', () => {
    const t = currentDay()
    const w = amirPlanned(t).toSorted((a, b) => a.order - b.order)[0]!
    const past = data()
      .activities.filter((a) => a.athleteId === 'amir' && a.sport === w.sport && a.matchedWorkoutId)
      .at(-1)!
    const { matchedWorkoutId: _m, complianceBand: _c, ...base } = past
    const done: Activity = { ...base, id: 'today-test-done', day: t }
    act(() => useLaree.getState().logActivity(done))

    renderToday()
    const logged = data().activities.find((a) => a.id === done.id)!
    expect(logged.matchedWorkoutId).toBe(w.id)
    const bib = screen.getAllByTestId('session-bib')[0]!
    expect(within(bib).getByText('Done in')).toBeTruthy()
    expect(within(bib).getByText(BAND_LABELS[logged.complianceBand!])).toBeTruthy()
    expect(within(bib).getByText(/^Load/)).toBeTruthy()
    expect(screen.getByRole('link', { name: `See activity: ${sessionName(w.title, w.sport)}` }).getAttribute('href')).toBe(
      `/athlete/activity/${done.id}`,
    )
    expect(screen.queryByRole('button', { name: `Log it: ${sessionName(w.title, w.sport)}` })).toBeNull()
  })

  it('offers yesterday’s missed session to log', () => {
    const missed = amirPlanned(currentDay() - 1)
    const ids = new Set(missed.map((w) => w.id))
    setData((d) => ({ activities: d.activities.filter((a) => !a.matchedWorkoutId || !ids.has(a.matchedWorkoutId)) }))

    renderToday()
    const rows = screen.getAllByTestId('missed-row')
    expect(rows.length).toBe(missed.length)
    expect(within(rows[0]!).getByText('Missed')).toBeTruthy()
    fireEvent.click(within(rows[0]!).getByRole('button', { name: /^Log it: yesterday/ }))
    expect(screen.getByTestId('where').textContent).toBe('/athlete/today?sheet=log')
    expect(ids.has(readLogMatch(data().drafts, 'amir', currentDay()) ?? '')).toBe(true)
  })

  it('shows a rest day when the week has a plan and today is free', () => {
    const t = currentDay()
    setData((d) => ({ planned: d.planned.filter((w) => !(w.athleteId === 'amir' && w.day === t)) }))

    renderToday()
    expect(kind()).toBe('rest')
    expect(screen.getByTestId('rest-bib')).toBeTruthy()
    expect(screen.getByText('Rest days count towards your streak.')).toBeTruthy()
    expect(screen.queryByTestId('session-bib')).toBeNull()
  })

  it('says nothing is planned when the coach has not planned this week', () => {
    const week = weekOfDay(currentDay())
    setData((d) => ({ planned: d.planned.filter((w) => !(w.athleteId === 'amir' && weekOfDay(w.day) === week)) }))

    renderToday()
    expect(kind()).toBe('nothing-planned')
    const empty = screen.getByTestId('today-nothing-planned')
    expect(within(empty).getByText('Nothing planned today.')).toBeTruthy()
    expect(within(empty).getByText('Rest, or log something you did.')).toBeTruthy()
    fireEvent.click(within(empty).getByRole('button', { name: 'Log' }))
    expect(screen.getByTestId('where').textContent).toBe('/athlete/today?sheet=log')
    expect(readLogMatch(data().drafts, 'amir', currentDay())).toBeUndefined()
  })

  it('welcomes an athlete with nothing planned or logged yet', () => {
    setData((d) => ({
      planned: d.planned.filter((w) => w.athleteId !== 'amir'),
      activities: d.activities.filter((a) => a.athleteId !== 'amir'),
    }))

    renderToday()
    expect(kind()).toBe('first-time')
    expect(screen.getByTestId('today-first-time')).toBeTruthy()
    expect(screen.getByRole('heading', { level: 2, name: 'Your training starts here' })).toBeTruthy()
    // No empty lap or "next up" for a first visit.
    expect(screen.queryByRole('link', { name: /This week/ })).toBeNull()
  })

  it('shows the week lap, linking to Week', () => {
    renderToday()
    const lap = screen.getByRole('link', { name: /This week/ })
    fireEvent.click(lap)
    expect(screen.getByTestId('where').textContent).toBe('/athlete/week')
  })

  it('shows a quiet skeleton only when reading saved data takes over 300 ms', async () => {
    vi.useFakeTimers()
    const spy = vi.spyOn(useLaree.persist, 'hasHydrated').mockReturnValue(false)
    try {
      renderToday()
      expect(screen.queryByTestId('today-skeleton')).toBeNull()
      expect(screen.queryByTestId('session-bib')).toBeNull()
      await act(async () => {
        vi.advanceTimersByTime(QUIET_WAIT_MS + 10)
      })
      expect(screen.getByTestId('today-skeleton')).toBeTruthy()
    } finally {
      spy.mockRestore()
      vi.useRealTimers()
    }
  })

  it('follows the athlete chosen in the viewer', () => {
    useViewer.getState().viewAs('danial')
    renderToday()
    const t = currentDay()
    expect(kind()).toBe(todayModel(data(), 'danial', t).kind)
  })
})

describe('todayModel words', () => {
  it('formats the bib figure', () => {
    expect(durationFigure(55 * 60)).toEqual({ value: '55', unit: 'min', words: '55 min' })
    expect(durationFigure(90 * 60).value).toBe('1:30')
  })

  it('writes the race countdown', () => {
    const race = { id: 'r', athleteId: 'amir', name: 'Tasik Olympic Tri', day: 128, priority: 'B' } as const
    expect(raceLine(race as never, 100)).toBe('Tasik Olympic Tri. B race. In 4 weeks.')
    expect(raceLine(race as never, 127)).toBe('Tasik Olympic Tri. B race. Tomorrow.')
  })

  it('drops a sport prefix the mark already shows', () => {
    expect(sessionName('Run: Easy run', 'run')).toBe('Easy run')
    expect(sessionName('Brick: bike then run', 'bike')).toBe('Brick: bike then run')
    expect(sessionName('Run:', 'run')).toBe('Run:')
  })

  it('returns no main set for a session without structure', () => {
    expect(mainSetLine([], { ftpW: 250, thresholdPaceSPerKm: 270, cssSPer100m: 95, lthrBpm: 170 } as never)).toBeNull()
  })
})
