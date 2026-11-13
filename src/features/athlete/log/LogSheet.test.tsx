import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useViewer } from '../../../app/viewer.ts'
import { currentDay } from '../../../data/selectors.ts'
import { useLaree } from '../../../data/store.ts'
import type { LareeData } from '../../../data/store.ts'
import { setNow } from '../../../domain/time.ts'
import { sessionName } from '../../shared/activity/format.ts'
import { LOG_MATCH_DRAFT } from '../today/logMatch.ts'
import { LogSheet } from './LogSheet.tsx'
import { buildSyncedActivity, loadLine, matchOptions } from './logModel.ts'

const MONDAY_10AM_KL = Date.UTC(2026, 10, 9, 2)
const DAY_MS = 86_400_000
const ME = 'amir'

const data = (): LareeData => useLaree.getState().data
const mine = () => data().activities.filter((a) => a.athleteId === ME)

/** A fixed week in which Amir has a session to log today. */
function setUp(): void {
  for (let i = 0; i < 7; i++) {
    setNow(MONDAY_10AM_KL + i * DAY_MS)
    useLaree.getState().reset()
    useViewer.getState().viewAs(ME)
    const options = matchOptions(data(), ME, currentDay())
    if (options.some((o) => o.workout.day === currentDay() && !o.logged)) return
  }
  throw new Error('No day with an open session')
}

function Where() {
  const l = useLocation()
  return <output data-testid="where">{`${l.pathname}${l.search}`}</output>
}

function mount(entry = '/athlete/today?sheet=log') {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/athlete/today" element={<LogSheet />} />
        <Route path="/athlete/progress" element={<h1>Progress</h1>} />
        <Route path="/athlete/activity/:id" element={<h1>Activity</h1>} />
      </Routes>
      <Where />
    </MemoryRouter>,
  )
}

const where = () => screen.getByTestId('where').textContent

function fileInput(): HTMLInputElement {
  const el = document.querySelector('input[type="file"]')
  if (!el) throw new Error('no file input')
  return el as HTMLInputElement
}

function pick(file: File): void {
  const input = fileInput()
  Object.defineProperty(input, 'files', { value: [file], configurable: true })
  fireEvent.change(input)
}

const fixture = (name: string) => new Uint8Array(readFileSync(resolve(process.cwd(), 'src/io/import/__fixtures__', name)))

beforeEach(setUp)
afterEach(() => {
  cleanup()
  setNow(null)
})

describe('log sheet', () => {
  it('defaults to today session, offers Not planned, and shows a live load estimate with its method', () => {
    mount()
    const dialog = screen.getByRole('dialog', { name: 'Log a session' })
    const today = matchOptions(data(), ME, currentDay()).find((o) => o.workout.day === currentDay() && !o.logged)!
    const name = sessionName(today.workout.title, today.workout.sport)
    expect(within(dialog).getAllByText(new RegExp(`Today · .* · ${name}`)).length).toBeGreaterThan(0)
    const estimate = within(dialog).getByTestId('load-estimate').textContent ?? ''
    expect(estimate).toMatch(/^Load \d+, from .+, (high|medium|low) confidence$/)
    fireEvent.click(within(dialog).getByRole('button', { name: /Which session/ }))
    expect(screen.getByRole('option', { name: 'Not planned' })).toBeTruthy()
  })

  it('quick log saves an activity, closes the sheet and returns to Today', () => {
    mount()
    const before = mine().length
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(mine().length).toBe(before + 1)
    const saved = mine().find((a) => a.source === 'manual' && a.title !== undefined && a.rpe === 5)!
    expect(saved).toBeTruthy()
    expect(saved.load.load).toBeGreaterThan(0)
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(where()).toBe('/athlete/today')
  })

  it('uses the pre-matched session from Today, and clears the draft when the sheet closes', () => {
    const options = matchOptions(data(), ME, currentDay())
    const target = options[options.length - 1]!.workout
    useLaree.getState().setDraft(LOG_MATCH_DRAFT, { athleteId: ME, workoutId: target.id, chosenOn: currentDay() })
    const { unmount } = mount()
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getAllByText(new RegExp(sessionName(target.title, target.sport))).length).toBeGreaterThan(0)
    unmount()
    expect(data().drafts[LOG_MATCH_DRAFT]).toBeUndefined()
  })

  it('refuses a zero duration with an inline message', () => {
    mount()
    const duration = screen.getByRole('textbox', { name: /Duration/ })
    fireEvent.change(duration, { target: { value: '0:00' } })
    fireEvent.blur(duration)
    const before = mine().length
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(screen.getByText('Enter a duration of at least one minute.')).toBeTruthy()
    expect(mine().length).toBe(before)
  })

  it('imports a file: preview, then save', async () => {
    mount()
    fireEvent.click(screen.getByText('Import file'))
    const before = mine().length
    const ids = new Set(mine().map((a) => a.id))
    pick(new File([fixture('run.gpx')], 'easy-run.gpx'))
    const preview = await screen.findByTestId('import-preview', undefined, { timeout: 5000 })
    expect(within(preview).getByText('Run')).toBeTruthy()
    expect(within(preview).getByText('Laps')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(mine().length).toBe(before + 1))
    const saved = mine().find((a) => !ids.has(a.id))!
    expect(saved.source).toBe('file')
    expect(saved.sport).toBe('run')
    expect(saved.load.load).toBeGreaterThanOrEqual(0)
    expect(where()).toBe('/athlete/today')
  })

  it('a failed import names the file, stores nothing and keeps the chosen session', async () => {
    const options = matchOptions(data(), ME, currentDay())
    const target = options[options.length - 1]!.workout
    useLaree.getState().setDraft(LOG_MATCH_DRAFT, { athleteId: ME, workoutId: target.id, chosenOn: currentDay() })
    mount()
    fireEvent.click(screen.getByText('Import file'))
    const before = JSON.stringify(data().activities)
    pick(new File([new TextEncoder().encode('just some notes')], 'notes.txt'))
    const error = await screen.findByTestId('import-error', undefined, { timeout: 5000 })
    expect(error.textContent).toContain('notes.txt')
    expect(JSON.stringify(data().activities)).toBe(before)
    expect(within(screen.getByRole('dialog')).getAllByText(new RegExp(sessionName(target.title, target.sport))).length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: 'Save' }).hasAttribute('disabled')).toBe(true)
  })

  it('sync creates one simulated activity from the plan, the same every time', () => {
    mount()
    fireEvent.click(screen.getByText('Sync device'))
    expect(screen.getAllByText('Simulated').length).toBeGreaterThan(0)
    const before = mine().length
    const ids = new Set(mine().map((a) => a.id))
    const planned = matchOptions(data(), ME, currentDay()).find((o) => o.workout.day === currentDay() && !o.logged)!.workout
    fireEvent.click(screen.getByRole('button', { name: 'Sync now' }))
    expect(mine().length).toBe(before + 1)
    const synced = mine().find((a) => !ids.has(a.id))!
    expect(synced.source).toBe('simulatedDevice')
    expect(synced.summary.durationS).toBeGreaterThan(0)
    expect(where()).toBe('/athlete/today')
    const again = buildSyncedActivity({
      id: synced.id,
      athleteId: ME,
      day: synced.day,
      startMinute: synced.startMinute,
      sport: synced.sport,
      workout: planned,
      thresholds: {},
    })
    expect(again.summary.durationS).toBe(synced.summary.durationS)
  })

  it('formats the load line', () => {
    expect(loadLine({ load: 61.6, method: 'pace', confidence: 'medium', intensity: 0.8 })).toBe(
      'Load 62, from pace, medium confidence',
    )
  })
})
