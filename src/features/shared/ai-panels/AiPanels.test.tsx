import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildSuggestFacts, simulateSuggestion } from '../../../ai/index.ts'
import { currentDay } from '../../../data/selectors.ts'
import { useLaree } from '../../../data/store.ts'
import { weekOfDay, weekRange } from '../../../domain/time.ts'
import { SuggestSlot } from '../../coach/calendar/SuggestSlot.tsx'
import { ToastRegion } from '../../../ui/overlay/index.ts'
import { CheckInSummaryPanel, WeeklyRecapPanel } from './index.ts'

type A = 'amir' | 'danial' | 'irfan'
const setConsent = (coach: boolean, athlete: boolean, id: A = 'amir') =>
  act(() =>
    useLaree.setState((s) => ({
      data: {
        ...s.data,
        settings: {
          ...s.data.settings,
          coach: { ...s.data.settings.coach, aiConsent: coach },
          [id]: { ...s.data.settings[id], aiConsent: athlete },
        },
      },
    })),
  )

/** Flags by id, rule and state: their numbers are re-derived from the plan, their lifecycle is not touched. */
const flagKeys = () =>
  JSON.stringify(useLaree.getState().data.flags.map((f) => [f.id, f.ruleId, f.state, f.resolutionNote ?? null]))

const today = () => currentDay()
const nextWeekStart = () => weekRange(weekOfDay(today()) + 1).firstDay
const plannedNext = (id: A = 'amir') => {
  const { firstDay, lastDay } = weekRange(weekOfDay(today()) + 1)
  return useLaree.getState().data.planned.filter((p) => p.athleteId === id && p.day >= firstDay && p.day <= lastDay)
}

beforeEach(() => useLaree.getState().reset())
afterEach(cleanup)

describe('AI panels', () => {
  it('render nothing without consent from both sides', () => {
    for (const [c, a] of [[false, false], [true, false], [false, true]] as const) {
      setConsent(c, a)
      const { container } = render(
        <>
          <WeeklyRecapPanel athleteId="amir" weekStartDay={weekRange(weekOfDay(today()) - 1).firstDay} />
          <CheckInSummaryPanel athleteId="amir" day={today()} />
          <SuggestSlot athleteId="amir" weekStartDay={nextWeekStart()} />
        </>,
      )
      expect(container.textContent).toBe('')
      cleanup()
    }
  })

  it('show the label and model for the recap and the check-in summary', () => {
    setConsent(true, true)
    render(
      <>
        <WeeklyRecapPanel athleteId="amir" weekStartDay={weekRange(weekOfDay(today()) - 1).firstDay} />
        <CheckInSummaryPanel athleteId="amir" day={today()} />
      </>,
    )
    const panels = screen.getAllByTestId('ai-panel')
    expect(panels).toHaveLength(2)
    expect(panels[0]?.textContent).toContain('Simulated AI - prototype')
    expect(panels[0]?.textContent).toContain('claude-haiku-5-5')
    expect(panels[1]?.textContent).toContain('Simulated AI - prototype')
    expect(panels[1]?.textContent).toContain('claude-haiku-5-5')
  })
})

describe('SuggestSlot', () => {
  it('accepts and rejects one by one, applies as one batch, undoes, and leaves flags alone', async () => {
    const id = (['amir', 'danial', 'irfan'] as const).find((x) => {
      const o = simulateSuggestion(buildSuggestFacts(useLaree.getState().data, x, today()))
      return o.status === 'ok' && o.changes.length > 0
    })
    expect(id).toBeTruthy()
    const who = id!
    setConsent(true, true, who)
    const flagsBefore = flagKeys()
    const plannedBefore = JSON.stringify(plannedNext(who))
    render(
      <>
        <ToastRegion />
        <SuggestSlot athleteId={who} weekStartDay={nextWeekStart()} />
      </>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Suggest next week' }))
    const drawer = await screen.findByTestId('suggest-drawer')
    expect(drawer.textContent).toContain('Simulated AI - prototype')
    expect(drawer.textContent).toContain('claude-sonnet-5-5')
    const accepts = screen.getAllByRole('button', { name: 'Accept' })
    const rejects = screen.getAllByRole('button', { name: 'Reject' })
    expect(accepts.length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: 'Apply 0 changes' }).hasAttribute('disabled')).toBe(true)
    fireEvent.click(accepts[0]!)
    expect(accepts[0]!.getAttribute('aria-pressed')).toBe('true')
    if (rejects[1]) fireEvent.click(rejects[1])
    const n = 1
    fireEvent.click(screen.getByRole('button', { name: `Apply ${n} change` }))
    expect(await screen.findByText(/applied to /)).toBeTruthy()
    expect(JSON.stringify(plannedNext(who))).not.toBe(plannedBefore)
    expect(flagKeys()).toBe(flagsBefore)
    fireEvent.click(await screen.findByRole('button', { name: 'Undo' }))
    expect(JSON.stringify(plannedNext(who))).toBe(plannedBefore)
    expect(flagKeys()).toBe(flagsBefore)
  })
})
