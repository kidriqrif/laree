import { cleanup, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useViewer } from '../../../app/viewer.ts'
import { currentDay, earnedAwards, selectFitnessSeries, selectProgress } from '../../../data/selectors.ts'
import { useLaree } from '../../../data/store.ts'
import type { AthleteId } from '../../../domain/types.ts'
import { countdownRace, countdownText, trendSentence } from './copy.ts'
import ProgressPage from './ProgressPage.tsx'

beforeEach(() => {
  localStorage.clear()
  useLaree.getState().reset()
})
afterEach(cleanup)

function show(id: AthleteId) {
  useViewer.setState({ role: 'athlete', athleteId: id, chosen: true })
  render(
    <MemoryRouter>
      <ProgressPage />
    </MemoryRouter>,
  )
}

describe('race countdown', () => {
  it.each(['amir', 'danial', 'irfan'] as const)('%s counts down to their A race', (id) => {
    const data = useLaree.getState().data
    const today = currentDay()
    const a = data.races.filter((r) => r.athleteId === id && r.priority === 'A' && r.day >= today)[0]!
    expect(countdownRace(data.races.filter((r) => r.athleteId === id), today)?.id).toBe(a.id)
    show(id)
    expect(screen.getByTestId('countdown').textContent).toBe(countdownText(a, today))
    expect(screen.getByTestId('countdown').textContent).toContain(a.name)
  })

  it('says race day on the day itself', () => {
    const r = useLaree.getState().data.races[0]!
    expect(countdownText(r, r.day)).toBe(`Race day: ${r.name}`)
    expect(countdownText(r, r.day - 1)).toBe(`1 day to ${r.name}`)
  })
})

describe('fitness trend', () => {
  it('words up, down and level', () => {
    expect(trendSentence(58.4, 44.2, 16)).toBe('Fitness 58, up 14 in 16 weeks.')
    expect(trendSentence(40, 45, 16)).toBe('Fitness 40, down 5 in 16 weeks.')
    expect(trendSentence(40, 40.2, 1)).toBe('Fitness 40, level over 1 week.')
  })

  it('shows the sentence from the series, explains Fitness and Form, and never names Fatigue', () => {
    const data = useLaree.getState().data
    const today = currentDay()
    const s = selectFitnessSeries(data, 'amir', today)
    const then = s.find((p) => p.day === Math.max(0, today - 112))!
    const now = s.find((p) => p.day === today)!
    show('amir')
    expect(screen.getByTestId('trend').textContent).toBe(trendSentence(now.fitness, then.fitness, 16))
    expect(screen.getByText(/Fitness is the training your body has absorbed/)).toBeTruthy()
    expect(screen.getByText(/Form is how rested you were/)).toBeTruthy()
    expect(document.body.textContent).not.toMatch(/Fatigue|TSS|CTL|ATL|TSB/)
  })
})

describe('streak', () => {
  it.each(['amir', 'danial', 'irfan'] as const)('shows the seeded streak for %s', (id) => {
    const st = selectProgress(useLaree.getState().data, id, currentDay()).streak
    show(id)
    const text = screen.getByTestId('streak').textContent
    expect(text).toBe(st.current > 0 ? `Streak: ${st.current} ${st.current === 1 ? 'week' : 'weeks'}` : 'This week can start a new streak.')
    expect(screen.getByText(new RegExp(`Best: ${st.best} `))).toBeTruthy()
  })

  it('matches the seed targets for Amir and Danial', () => {
    const d = useLaree.getState().data
    const t = currentDay()
    expect(selectProgress(d, 'amir', t).streak).toMatchObject({ current: 3, best: 7 })
    expect(selectProgress(d, 'danial', t).streak).toMatchObject({ current: 13, best: 13 })
  })
})

describe('badges', () => {
  it.each([
    ['amir', 8],
    ['danial', 6],
    ['irfan', 4],
  ] as const)('%s has %i earned badges and the rest explained as locked', (id, n) => {
    show(id)
    const shelf = screen.getByRole('list', { name: 'Earned badges' })
    expect(within(shelf).getAllByRole('listitem')).toHaveLength(n)
    const keys = new Set(earnedAwards(useLaree.getState().data, id, currentDay()).map((a) => a.key))
    const lockedList = screen.getByRole('list', { name: 'Badges not yet earned' })
    const lockedItems = within(lockedList).getAllByRole('listitem')
    expect(lockedItems.length).toBe(11 - keys.size)
    for (const li of lockedItems) expect(li.textContent!.length).toBeGreaterThan(20)
  })

  it('shows Amir new FTP face, the finish tape and no locked progress hints', () => {
    show('amir')
    expect(screen.getAllByText('New threshold').length).toBeGreaterThan(0)
    expect(screen.getByText(/FTP up from 245 W to 255 W/)).toBeTruthy()
    expect(document.querySelectorAll('[class*="tape"]').length).toBeGreaterThan(0)
    expect(document.body.textContent).not.toMatch(/to go|almost there/i)
  })

  it('invites the first milestone when nothing is earned', () => {
    useLaree.setState((s) => ({ data: { ...s.data, activities: [], checkIns: [], kudos: [] } }))
    show('irfan')
    expect(screen.getByText(/Badges come from real milestones, like your first 100 km week/)).toBeTruthy()
  })
})
