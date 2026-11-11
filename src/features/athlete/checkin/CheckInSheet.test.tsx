import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useViewer } from '../../../app/viewer.ts'
import { currentDay, selectCheckInSkipped, selectHasCheckedIn } from '../../../data/selectors.ts'
import { useLaree } from '../../../data/store.ts'
import { setNow } from '../../../domain/time.ts'
import { CheckInStrip } from '../today/CheckInStrip.tsx'
import { CheckInSheet } from './CheckInSheet.tsx'
import { baselineNote, summaryLine } from './checkinText.ts'

const ME = 'danial'

function dropToday() {
  const day = currentDay()
  useLaree.setState((s) => ({
    data: {
      ...s.data,
      checkIns: s.data.checkIns.filter((c) => !(c.athleteId === ME && c.day === day)),
      skippedCheckIns: s.data.skippedCheckIns.filter((c) => !(c.athleteId === ME && c.day === day)),
    },
  }))
}

function mount(entry = '/athlete/today') {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <CheckInStrip athleteId={ME} day={currentDay()} />
      <CheckInSheet />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  useLaree.getState().reset()
  useViewer.setState({ role: 'athlete', athleteId: ME })
  dropToday()
})

afterEach(() => {
  cleanup()
  setNow(null)
})

describe('check-in sheet and strip', () => {
  it('shows the prompt, then opens the sheet with the watch values prefilled', () => {
    mount()
    expect(screen.getByText('Morning check-in')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Check in' }))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText(/From your watch \(simulated\)/)).toBeTruthy()
    const hr = within(dialog).getByRole('textbox', { name: /Resting heart rate/ }) as HTMLInputElement
    expect(Number(hr.value)).toBeGreaterThan(30)
    expect(within(dialog).getByRole('button', { name: 'Submit' })).toBeTruthy()
  })

  it('submits, saves, closes and the strip reads the summary', () => {
    mount('/athlete/today?sheet=check-in')
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }))
    expect(selectHasCheckedIn(useLaree.getState().data, ME, currentDay())).toBe(true)
    expect(screen.queryByRole('dialog')).toBeNull()
    const saved = useLaree.getState().data.checkIns.find((c) => c.athleteId === ME && c.day === currentDay())!
    expect(screen.getByText(summaryLine(saved))).toBeTruthy()
    expect(summaryLine({ sleepHours: 7, soreness: 2, mood: 4 })).toBe('Checked in. Sleep 7 h. Soreness 2. Mood 4.')
  })

  it('Not today records no check-in', () => {
    mount()
    fireEvent.click(screen.getByRole('button', { name: 'Not today' }))
    const data = useLaree.getState().data
    expect(selectHasCheckedIn(data, ME, currentDay())).toBe(false)
    expect(selectCheckInSkipped(data, ME, currentDay())).toBe(true)
    expect(screen.getByText('No check-in today.')).toBeTruthy()
  })

  it('allows editing today and closes the window at midnight Malaysia time', () => {
    const { rerender } = mount()
    act(() => {
      useLaree.getState().saveCheckIn({ id: 'x', athleteId: ME, day: currentDay(), sleepHours: 7, soreness: 2, mood: 4 })
    })
    expect(screen.getByRole('button', { name: 'Edit' })).toBeTruthy()
    setNow(Date.now() + 24 * 3_600_000)
    rerender(
      <MemoryRouter initialEntries={['/athlete/today']}>
        <CheckInStrip athleteId={ME} day={currentDay() - 1} />
      </MemoryRouter>,
    )
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull()
  })

  it('states a far-from-usual reading in neutral words', () => {
    expect(baselineNote('restingHr', 52, [], currentDay(), { restingHr: 44, hrvMs: 88 })).toBe(
      'Resting HR 52 bpm, usual 44 bpm.',
    )
    expect(baselineNote('restingHr', 45, [], currentDay(), { restingHr: 44, hrvMs: 88 })).toBeNull()
  })

  it('never shows flag text to the athlete, even when a rule fires', () => {
    mount()
    act(() => {
      for (const d of [currentDay() - 1, currentDay()]) {
        useLaree
          .getState()
          .saveCheckIn({ id: `f${d}`, athleteId: ME, day: d, sleepHours: 4, soreness: 5, mood: 1, restingHr: 70, hrvMs: 40 })
      }
    })
    const text = document.body.textContent ?? ''
    expect(text).not.toMatch(/flag|warning|alert|concern|risk|overtrain/i)
    expect(text).toContain('Checked in.')
  })
})
