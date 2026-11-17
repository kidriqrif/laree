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

  it('keeps the readings of a check-in that arrives after the sheet opened', () => {
    mount('/athlete/today?sheet=check-in')
    const day = currentDay()
    // Another device checked in this morning; the sync brings it in while the sheet is open.
    act(() => {
      useLaree.getState().saveCheckIn({ id: 'from-sync', athleteId: ME, day, sleepHours: 6.5, soreness: 4, mood: 2, restingHr: 41, hrvMs: 93 })
    })
    const dialog = screen.getByRole('dialog')
    expect((within(dialog).getByRole('textbox', { name: /Resting heart rate/ }) as HTMLInputElement).value).toBe('41')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Update' }))
    const saved = useLaree.getState().data.checkIns.filter((c) => c.athleteId === ME && c.day === day)
    expect(saved).toHaveLength(1)
    expect(saved[0]).toMatchObject({ id: 'from-sync', sleepHours: 6.5, soreness: 4, mood: 2, restingHr: 41, hrvMs: 93 })
  })

  it('keeps what the person typed, and a reading they cleared, when a check-in arrives', () => {
    mount('/athlete/today?sheet=check-in')
    const day = currentDay()
    const dialog = screen.getByRole('dialog')
    const field = (name: RegExp) => within(dialog).getByRole('textbox', { name }) as HTMLInputElement
    fireEvent.change(field(/Resting heart rate/), { target: { value: '55' } })
    fireEvent.blur(field(/Resting heart rate/))
    fireEvent.change(field(/HRV/), { target: { value: '' } })
    fireEvent.blur(field(/HRV/))
    act(() => {
      useLaree.getState().saveCheckIn({ id: 'from-sync', athleteId: ME, day, sleepHours: 6.5, soreness: 4, mood: 2, restingHr: 41, hrvMs: 93 })
    })
    expect(field(/Resting heart rate/).value).toBe('55')
    expect(field(/HRV/).value).toBe('')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Update' }))
    const saved = useLaree.getState().data.checkIns.find((c) => c.athleteId === ME && c.day === day)!
    expect(saved.restingHr).toBe(55)
    expect(saved.hrvMs).toBeUndefined()
    // Fields the person left alone take the arrived values.
    expect(saved.sleepHours).toBe(6.5)
  })
})
