import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { createMemoryRouter } from 'react-router'
import { RouterProvider } from 'react-router/dom'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { routes } from '../../app/router.tsx'
import { useViewer } from '../../app/viewer.ts'
import {
  currentDay,
  selectAiState,
  selectAthleteDay,
  selectHasCheckedIn,
  selectKudosForActivity,
  selectOpenFlagCount,
  selectOpenFlags,
  selectRosterRows,
  selectUnseenKudos,
  selectWeek,
} from '../../data/selectors.ts'
import { useLaree } from '../../data/store.ts'
import type { LareeData } from '../../data/store.ts'
import { setNow, weekOfDay, weekRange } from '../../domain/time.ts'
import type { AthleteId, Phase, PlainStep, WorkoutTemplate } from '../../domain/types.ts'
import { sessionIcs } from '../../io/export/ics.ts'
import { buildFile, buildInput } from '../coach/builder/exportFiles.ts'
import { thresholdsFor } from '../coach/builder/TargetPreview.tsx'
import { EMPTY_SEASON } from '../coach/season/SeasonPage.tsx'
import { SuggestSlot } from '../coach/calendar/SuggestSlot.tsx'
import { CheckInSummaryPanel, WeeklyRecapPanel } from '../shared/ai-panels/index.ts'

// Flows 7.1 to 7.6 of docs/ia/information-architecture.md, run against the real store, the real
// selectors and the real pages. The clock is pinned to Wednesday 11 November 2026, 10:00 in Kuala
// Lumpur, so the seed and "today" are the same on every run.
const WEDNESDAY_10AM_KL = Date.UTC(2026, 10, 11, 2)
const IDS: readonly AthleteId[] = ['amir', 'danial', 'irfan']

const data = (): LareeData => useLaree.getState().data
const today = () => currentDay()

function reset(): void {
  localStorage.clear()
  setNow(WEDNESDAY_10AM_KL)
  useLaree.getState().reset()
}

function viewAs(role: 'athlete' | 'coach', athleteId: AthleteId = 'amir'): void {
  useViewer.setState({ role, athleteId, coachAthleteId: athleteId, chosen: true })
}

function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  render(<RouterProvider router={router} />)
  return router
}

const flagsOf = (id: AthleteId) => data().flagsState[id].flags
const week = (id: AthleteId) => selectWeek(data(), id, weekOfDay(today()), today())
const todayState = () => document.querySelector('[data-today]')?.getAttribute('data-today')

beforeEach(reset)
afterEach(() => {
  cleanup()
  setNow(null)
})

describe('seed coverage for the demo script', () => {
  it('has an open flag, a missing check-in and a recent activity that can still earn kudos', () => {
    expect(selectOpenFlagCount(data())).toBeGreaterThanOrEqual(1)
    const missing = IDS.filter((id) => !selectHasCheckedIn(data(), id, today()))
    expect(missing).toEqual(['danial'])
    const recent = data().activities.filter(
      (a) => a.day >= today() - 7 && a.day < today() && selectKudosForActivity(data(), a.id).length === 0,
    )
    expect(recent.length).toBeGreaterThan(0)
    expect(recent.some((a) => a.athleteId === 'amir')).toBe(true)
  })

  it('has an open flag of each severity and one acknowledged flag', () => {
    const all = IDS.flatMap(flagsOf)
    expect(new Set(all.filter((f) => f.status === 'open').map((f) => f.severity))).toEqual(new Set(['info', 'watch', 'act']))
    expect(all.some((f) => f.status === 'acknowledged')).toBe(true)
  })
})

describe('7.1 Athlete: from today session to a logged activity', () => {
  it('logs the session, the planned item is matched and the week moves', async () => {
    viewAs('athlete', 'amir')
    const before = selectAthleteDay(data(), 'amir', today(), today())
    expect(before.planned.length).toBeGreaterThan(0)
    const open = before.planned.find((p) => p.evaluation?.status === 'open')
    expect(open).toBeTruthy()
    const weekBefore = week('amir')

    const router = renderAt('/athlete/today?sheet=log')
    const dialog = await screen.findByRole('dialog', { name: 'Log a session' })
    expect(within(dialog).getAllByText(new RegExp(open!.workout.title)).length).toBeGreaterThan(0)
    expect(within(dialog).getByTestId('load-estimate').textContent).toMatch(/^Load \d+, from .+, (high|medium|low) confidence$/)
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(router.state.location.pathname + router.state.location.search).toBe('/athlete/today'))
    const after = selectAthleteDay(data(), 'amir', today(), today())
    const done = after.planned.find((p) => p.workout.id === open!.workout.id)!
    expect(done.activity).toBeTruthy()
    expect(done.evaluation?.status).not.toBe('open')
    expect(done.evaluation?.band).toBeTruthy()
    const weekAfter = week('amir')
    expect(weekAfter.doneLoad).toBeGreaterThan(weekBefore.doneLoad)
    expect(weekAfter.compliance).not.toBe(weekBefore.compliance)
    await waitFor(() => expect(todayState()).toBe('sessions'))
  })
})

describe('7.2 Athlete: morning check-in', () => {
  it('shows the prompt, submits, and the strip reads the summary', async () => {
    viewAs('athlete', 'danial')
    expect(selectHasCheckedIn(data(), 'danial', today())).toBe(false)
    expect(selectRosterRows(data(), today()).find((r) => r.athleteId === 'danial')?.daysSinceCheckIn).toBeGreaterThan(0)

    const router = renderAt('/athlete/today')
    expect(await screen.findByText('Morning check-in')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Check in' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(/From your watch \(simulated\)/)).toBeTruthy()
    expect(router.state.location.search).toBe('?sheet=check-in')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Submit' }))

    await waitFor(() => expect(selectHasCheckedIn(data(), 'danial', today())).toBe(true))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(await screen.findByText(/^Checked in\. Sleep /)).toBeTruthy()
    expect(router.state.location.search).toBe('')
    // The athlete sees no flag wording, whatever the rules did.
    expect(document.body.textContent ?? '').not.toMatch(/flag|alert|overtrain/i)
  })

  it('Not today leaves no check-in', async () => {
    viewAs('athlete', 'danial')
    renderAt('/athlete/today')
    fireEvent.click(await screen.findByRole('button', { name: 'Not today' }))
    expect(selectHasCheckedIn(data(), 'danial', today())).toBe(false)
    expect(data().skippedCheckIns.some((c) => c.athleteId === 'danial' && c.day === today())).toBe(true)
  })
})

describe('7.3 Coach: morning review', () => {
  it('finds the open flag, acknowledges it on opening, resolves it with a note, moves a session and sends kudos', async () => {
    viewAs('coach', 'danial')
    // Step 2: the status line facts.
    const flag = selectOpenFlags(data(), 'danial')[0]!
    expect(flag).toBeTruthy()
    const row = selectRosterRows(data(), today()).find((r) => r.athleteId === 'danial')!
    expect(row.openFlags).toBeGreaterThanOrEqual(1)
    expect(IDS.filter((id) => !selectHasCheckedIn(data(), id, today())).length).toBe(1)

    // Steps 3 and 4: opening the flag marks it acknowledged.
    renderAt(`/coach/check-ins?flag=${encodeURIComponent(flag.id)}`)
    const drawer = await screen.findByTestId('flag-detail')
    await waitFor(() => expect(flagsOf('danial').find((f) => f.id === flag.id)?.status).toBe('acknowledged'))

    // Step 8: resolve with a note.
    fireEvent.click(within(drawer).getByRole('button', { name: 'Resolve' }))
    fireEvent.change(within(drawer).getByRole('textbox'), { target: { value: 'Moved threshold to Saturday.' } })
    fireEvent.click(within(drawer).getByRole('button', { name: 'Resolve flag' }))
    await waitFor(() => expect(flagsOf('danial').find((f) => f.id === flag.id)?.status).toBe('resolved'))
    expect(flagsOf('danial').find((f) => f.id === flag.id)?.notes.at(-1)?.text).toBe('Moved threshold to Saturday.')
    expect(selectOpenFlags(data(), 'danial').some((f) => f.id === flag.id)).toBe(false)

    // Step 7: move the next session, then undo.
    const next = data().planned
      .filter((p) => p.athleteId === 'danial' && p.day > today())
      .toSorted((a, b) => a.day - b.day)[0]!
    act(() => useLaree.getState().moveWorkout(next.id, next.day + 1))
    expect(data().planned.find((p) => p.id === next.id)?.day).toBe(next.day + 1)
    act(() => useLaree.getState().undo())
    expect(data().planned.find((p) => p.id === next.id)?.day).toBe(next.day)

    // Step 9: kudos on a recent activity, seen by the athlete on Today.
    const ride = data().activities
      .filter((a) => a.athleteId === 'amir' && a.day < today() && selectKudosForActivity(data(), a.id).length === 0)
      .toSorted((a, b) => b.day - a.day)[0]!
    act(() => useLaree.getState().sendKudos({ athleteId: 'amir', activityId: ride.id, message: 'Great pacing on the climbs' }))
    expect(selectKudosForActivity(data(), ride.id)).toHaveLength(1)
    expect(selectUnseenKudos(data(), 'amir').some((k) => k.activityId === ride.id)).toBe(true)
  })
})

describe('7.4 Coach: season setup', () => {
  const phasesOf = (id: AthleteId): Phase[] => data().phases.filter((p) => p.athleteId === id)

  it('derives phases back from the A race and leaves them alone for B and C races', async () => {
    viewAs('coach', 'irfan')
    act(() =>
      useLaree.setState((s) => ({
        data: {
          ...s.data,
          races: s.data.races.filter((r) => r.athleteId !== 'irfan'),
          phases: s.data.phases.filter((p) => p.athleteId !== 'irfan'),
        },
      })),
    )
    renderAt('/coach/season/irfan')
    expect(await screen.findByText(EMPTY_SEASON)).toBeTruthy()
    expect(phasesOf('irfan')).toHaveLength(0)

    const raceWeek = weekOfDay(today()) + 9
    const raceId = useLaree.getState().addRace({
      athleteId: 'irfan',
      name: 'Cameron Gran Fondo',
      day: weekRange(raceWeek).lastDay,
      sport: 'bike',
      distancesKm: [160],
      climbingM: 2400,
      priority: 'A',
    })
    const derived = useLaree.getState().derivePhasesFromRace(raceId, { firstWeek: weekOfDay(today()) })
    const mine = phasesOf('irfan')
    expect(mine).toEqual(derived)
    const kinds = mine.map((p) => p.kind)
    for (const k of ['build', 'peak', 'taper'] as const) expect(kinds).toContain(k)
    expect(kinds.indexOf('build')).toBeLessThan(kinds.indexOf('peak'))
    expect(kinds.indexOf('peak')).toBeLessThan(kinds.indexOf('taper'))
    expect(Math.max(...mine.map((p) => p.lastWeek))).toBeGreaterThanOrEqual(raceWeek)
    expect(mine.every((p) => p.weeklyTargets.length > 0)).toBe(true)

    // Step 5: a C race adds a marker and moves no phase.
    const before = JSON.stringify(phasesOf('irfan'))
    useLaree.getState().addRace({
      athleteId: 'irfan',
      name: 'Bukit Tinggi Hill Climb',
      day: weekRange(weekOfDay(today()) + 3).lastDay,
      sport: 'bike',
      distancesKm: [40],
      priority: 'C',
    })
    expect(JSON.stringify(phasesOf('irfan'))).toBe(before)
    expect(data().races.filter((r) => r.athleteId === 'irfan')).toHaveLength(2)
  })
})

describe('7.5 Coach: build a workout and export it', () => {
  const step = (id: string, kind: 'warmup' | 'interval' | 'recovery' | 'cooldown', min: number, low: number, high: number): PlainStep => ({
    id,
    kind,
    durationS: min * 60,
    target: { kind: 'pctFtp', low, high },
  })
  const sweetSpot: WorkoutTemplate = {
    id: 'flow-sweet-spot',
    name: 'Sweet spot 3 × 12',
    sport: 'bike',
    description: 'Three blocks just under threshold.',
    tags: { phase: 'build', type: 'sweet spot' },
    steps: [
      step('w', 'warmup', 10, 50, 70),
      { id: 'rep', kind: 'repeat', repeat: 3, steps: [step('on', 'interval', 12, 88, 93), step('off', 'recovery', 4, 55, 55)] },
      step('c', 'cooldown', 10, 45, 60),
    ],
    estimatedDurationS: 68 * 60,
    estimatedLoad: 80,
  }

  it('saves to the library, writes all four formats for a bike workout and refuses power formats for a run', async () => {
    viewAs('coach', 'amir')
    act(() => useLaree.getState().saveTemplate(sweetSpot))
    const saved = data().templates.find((t) => t.id === sweetSpot.id)
    expect(saved?.name).toBe('Sweet spot 3 × 12')

    // Step 4: targets for Amir and Irfan come from their own FTP.
    const input = buildInput(saved!, 'amir', 'Amir', thresholdsFor(data(), 'amir', today()))
    expect(input.thresholds.ftp).toBeGreaterThan(0)
    expect(thresholdsFor(data(), 'irfan', today()).ftp).not.toBe(input.thresholds.ftp)

    for (const f of ['zwo', 'fit', 'mrc', 'erg'] as const) {
      const r = await buildFile(f, input)
      expect(r.ok ? r.file.bytes.length : 0).toBeGreaterThan(0)
    }
    const run: WorkoutTemplate = {
      ...saved!,
      sport: 'run',
      steps: [{ id: 's', kind: 'steady', durationS: 1800, target: { kind: 'pctThresholdPace', low: 70, high: 80 } }],
    }
    const refused = await buildFile('erg', buildInput(run, 'amir', 'Amir', input.thresholds))
    expect(refused.ok ? '' : refused.reason).not.toBe('')

    // Step 7: copy it into Amir's plan on Thursday of next week, then export the .ics.
    const thursday = weekRange(weekOfDay(today()) + 1).firstDay + 3
    const id = useLaree.getState().addPlannedFromTemplate(sweetSpot.id, 'amir', thursday)
    expect(id).toBeTruthy()
    const planned = data().planned.find((p) => p.id === id)!
    expect(planned.day).toBe(thursday)
    expect(planned.title).toBe('Sweet spot 3 × 12')
    const ics = sessionIcs({
      athlete: { id: 'amir', name: 'Amir' },
      session: planned,
      thresholds: thresholdsFor(data(), 'amir', thursday),
      now: new Date(WEDNESDAY_10AM_KL),
    })
    const text = new TextDecoder().decode(ics.bytes)
    expect(text).toContain('BEGIN:VEVENT')
    expect(text).toContain('Sweet spot 3')
  })
})

describe('7.6 Turning AI on', () => {
  const recap = (id: AthleteId) => (
    <>
      <WeeklyRecapPanel athleteId={id} weekStartDay={weekRange(weekOfDay(today()) - 1).firstDay} />
      <CheckInSummaryPanel athleteId={id} day={today() - 1} />
      <SuggestSlot athleteId={id} weekStartDay={weekRange(weekOfDay(today()) + 1).firstDay} />
    </>
  )

  it('needs both sides, shows simulated panels for Amir only, and goes quiet when either turns it off', () => {
    for (const id of IDS) expect(selectAiState(data(), id)).toBe('off')

    // Steps 1 to 3: Amir turns it on.
    viewAs('athlete', 'amir')
    expect(useLaree.getState().setAiConsent('amir', true)).toBe(true)
    expect(selectAiState(data(), 'amir')).toBe('athlete-only')
    const quiet = render(recap('amir'))
    expect(quiet.container.textContent).toBe('')
    quiet.unmount()

    // Steps 4 and 5: Coach turns it on; the coach cannot switch an athlete on.
    viewAs('coach', 'amir')
    expect(useLaree.getState().setAiConsent('danial', true)).toBe(false)
    expect(useLaree.getState().setAiConsent('coach', true)).toBe(true)
    expect(selectAiState(data(), 'amir')).toBe('active')
    expect(selectAiState(data(), 'danial')).toBe('waiting-for-athlete')
    expect(selectAiState(data(), 'irfan')).toBe('waiting-for-athlete')

    // Step 6: panels for Amir carry the label and the model; nobody else gets any.
    const shown = render(recap('amir'))
    const panels = screen.getAllByTestId('ai-panel')
    expect(panels.length).toBeGreaterThanOrEqual(2)
    for (const p of panels) {
      expect(p.textContent).toContain('Simulated AI - prototype')
      expect(p.textContent).toContain('claude-haiku-5-5')
    }
    expect(screen.getByRole('button', { name: 'Suggest next week' })).toBeTruthy()
    shown.unmount()
    const other = render(recap('danial'))
    expect(other.container.textContent).toBe('')
    other.unmount()

    // Step 8: either side turning off removes every panel at once.
    useLaree.getState().setAiConsent('coach', false)
    expect(selectAiState(data(), 'amir')).toBe('athlete-only')
    const off = render(recap('amir'))
    expect(off.container.textContent).toBe('')
  })

  it('Coach turning it on first leaves every athlete waiting', () => {
    viewAs('coach', 'amir')
    useLaree.getState().setAiConsent('coach', true)
    for (const id of IDS) expect(selectAiState(data(), id)).toBe('waiting-for-athlete')
  })
})

describe('repeatability', () => {
  it('a reset store gives the same seed facts every time', () => {
    const facts = () =>
      JSON.stringify({
        open: IDS.map((id) => selectOpenFlags(data(), id).map((f) => f.id)),
        missing: IDS.filter((id) => !selectHasCheckedIn(data(), id, today())),
        week: IDS.map((id) => [week(id).plannedLoad, week(id).doneLoad, week(id).compliance]),
      })
    const first = facts()
    reset()
    expect(facts()).toBe(first)
  })
})
