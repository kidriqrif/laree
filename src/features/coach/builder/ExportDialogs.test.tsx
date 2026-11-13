import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { Decoder, Stream } from '@garmin/fitsdk'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useViewer } from '../../../app/viewer.ts'
import { currentDay } from '../../../data/selectors.ts'
import { useLaree } from '../../../data/store.ts'
import { dayToIso as dayIso } from '../../../domain/time.ts'
import type { WorkoutTemplate } from '../../../domain/types.ts'
import * as ics from '../../../io/export/ics.ts'
import { CalendarExport } from '../calendar/CalendarExport.tsx'
import { AddToCalendarSlot } from './AddToCalendarSlot.tsx'
import { ExportSlot } from './ExportSlot.tsx'

vi.mock('../../../io/export/ics.ts', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../../io/export/ics.ts')>()
  return { ...real, weekIcs: vi.fn<typeof real.weekIcs>(real.weekIcs), sessionIcs: vi.fn<typeof real.sessionIcs>(real.sessionIcs) }
})

const bike: WorkoutTemplate = {
  id: 'new',
  name: 'Threshold 4 × 8',
  sport: 'bike',
  description: 'Even pacing.',
  tags: { phase: 'build', type: 'threshold' },
  steps: [
    { id: 'w', kind: 'warmup', durationS: 900, target: { kind: 'pctFtp', low: 50, high: 75 } },
    {
      id: 'rep',
      kind: 'repeat',
      repeat: 4,
      steps: [
        { id: 'on', kind: 'interval', durationS: 480, target: { kind: 'pctFtp', low: 95, high: 100 } },
        { id: 'off', kind: 'recovery', durationS: 180, target: { kind: 'pctFtp', low: 50, high: 60 } },
      ],
    },
    { id: 'c', kind: 'cooldown', durationS: 600, target: { kind: 'pctFtp', low: 45, high: 65 } },
  ],
  estimatedDurationS: 4800,
  estimatedLoad: 90,
}

const run: WorkoutTemplate = {
  ...bike,
  name: 'Easy run',
  sport: 'run',
  steps: [{ id: 's', kind: 'steady', durationS: 1800, target: { kind: 'pctThresholdPace', low: 70, high: 80 } }],
}

let blobs: Blob[] = []
let downloads: string[] = []

beforeEach(() => {
  localStorage.clear()
  useLaree.getState().reset()
  useViewer.setState({ role: 'coach', athleteId: 'amir', coachAthleteId: 'amir', chosen: true })
  blobs = []
  downloads = []
  URL.createObjectURL = vi.fn<(b: Blob | MediaSource) => string>((b) => {
    blobs.push(b as Blob)
    return `blob:test/${blobs.length}`
  })
  URL.revokeObjectURL = vi.fn<(u: string) => void>()
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    downloads.push(this.download)
  })
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const wrap = (ui: React.ReactNode) => render(<MemoryRouter>{ui}</MemoryRouter>)

describe('ExportSlot', () => {
  it('disables formats that do not fit and says why', async () => {
    wrap(<ExportSlot template={run} />)
    fireEvent.click(screen.getByRole('button', { name: 'Export' }))
    await screen.findByRole('list', { name: 'Export formats' })
    expect(screen.getByRole('button', { name: 'Download .zwo' })).toHaveProperty('disabled', true)
    expect(screen.getByRole('button', { name: 'Download .erg' })).toHaveProperty('disabled', true)
    expect(screen.getByText('Zwift files need a bike workout with power targets.')).toBeTruthy()
    expect(screen.getByText('.erg needs a bike workout with power targets.')).toBeTruthy()
    expect(screen.getByText('Step notes are not carried in .mrc and .erg files.')).toBeTruthy()
  })

  it('downloads a .fit with a readable name and the file decodes back to the workout', async () => {
    wrap(<ExportSlot template={bike} />)
    fireEvent.click(screen.getByRole('button', { name: 'Export' }))
    await screen.findByRole('list', { name: 'Export formats' })
    const fit = screen.getByRole('button', { name: 'Download .fit' })
    await waitFor(() => expect(fit).toHaveProperty('disabled', false))
    fireEvent.click(fit)
    await waitFor(() => expect(downloads).toHaveLength(1))
    expect(downloads[0]).toBe('laree-amir-threshold-4x8.fit')
    expect(downloads[0]).not.toMatch(/\s/)
    const bytes = new Uint8Array(await blobs[0]!.arrayBuffer())
    expect(Decoder.isFIT(Stream.fromByteArray(bytes))).toBe(true)
    const { messages, errors } = new Decoder(Stream.fromByteArray(bytes)).read()
    expect(errors).toEqual([])
    const m = messages as unknown as Record<string, Record<string, unknown>[]>
    expect(m['workoutMesgs']![0]).toMatchObject({ sport: 'cycling', numValidSteps: 5 })
    expect(URL.revokeObjectURL).not.toHaveBeenCalled()
  })

  it('downloads .zwo, .mrc and .erg for a bike workout', async () => {
    wrap(<ExportSlot template={bike} />)
    fireEvent.click(screen.getByRole('button', { name: 'Export' }))
    await screen.findByRole('list', { name: 'Export formats' })
    fireEvent.click(screen.getByRole('button', { name: 'Download .mrc' }))
    await waitFor(() => expect(downloads).toEqual(['laree-amir-threshold-4x8.mrc']))
  })
})

describe('AddToCalendarSlot', () => {
  it('copies the workout into the chosen athlete plan on the chosen day', () => {
    const before = useLaree.getState().data.planned.length
    const day = currentDay() + 3
    wrap(<AddToCalendarSlot template={bike} />)
    fireEvent.click(screen.getByRole('button', { name: 'Add to calendar' }))
    // The athlete choice has a name, so a screen reader says what the three names are for.
    expect(screen.getByRole('radiogroup', { name: 'Athlete' })).toBeTruthy()
    fireEvent.click(screen.getByRole('radio', { name: 'Danial' }))
    const input = screen.getByLabelText('Day')
    fireEvent.change(input, { target: { value: dayIso(day) } })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    const planned = useLaree.getState().data.planned
    expect(planned).toHaveLength(before + 1)
    const added = planned.find((p) => p.athleteId === 'danial' && p.day === day && p.title === 'Threshold 4 × 8')
    expect(added).toBeTruthy()
    expect(added?.steps).toHaveLength(3)
  })

  it('opens on the athlete the builder previews', () => {
    render(
      <MemoryRouter initialEntries={['/coach/library/new?athlete=irfan']}>
        <AddToCalendarSlot template={bike} />
      </MemoryRouter>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Add to calendar' }))
    expect(screen.getByRole('radio', { name: 'Irfan' }).getAttribute('aria-checked')).toBe('true')
  })

  it('refuses a past day', async () => {
    wrap(<AddToCalendarSlot template={bike} />)
    fireEvent.click(screen.getByRole('button', { name: 'Add to calendar' }))
    fireEvent.change(screen.getByLabelText('Day'), { target: { value: dayIso(currentDay() - 2) } })
    expect(screen.getByRole('button', { name: 'Add' })).toHaveProperty('disabled', true)
    expect(screen.getByText('Pick today or a later day.')).toBeTruthy()
  })
})

describe('CalendarExport', () => {
  it('week export calls the ics exporter and names the file without spaces', async () => {
    const week = currentDay() - 2
    wrap(<CalendarExport athleteId="amir" weekStartDay={week} />)
    expect(screen.getByRole('button', { name: 'Export session (.ics)' })).toHaveProperty('disabled', true)
    fireEvent.click(screen.getByRole('button', { name: 'Export week (.ics)' }))
    await waitFor(() => expect(downloads).toHaveLength(1))
    expect(ics.weekIcs).toHaveBeenCalledTimes(1)
    expect(downloads[0]).toMatch(/^laree-amir-week-\d{4}-\d{2}-\d{2}\.ics$/)
    expect(blobs[0]!.type).toContain('text/calendar')
  })

  it('exports the selected session', async () => {
    const s = useLaree.getState().data.planned.find((p) => p.athleteId === 'amir')!
    wrap(<CalendarExport athleteId="amir" weekStartDay={s.day} selectedWorkoutId={s.id} />)
    fireEvent.click(screen.getByRole('button', { name: 'Export session (.ics)' }))
    await waitFor(() => expect(downloads).toHaveLength(1))
    expect(ics.sessionIcs).toHaveBeenCalledTimes(1)
    expect(downloads[0]).toMatch(/^laree-amir-\d{4}-\d{2}-\d{2}-[a-z0-9-]+\.ics$/)
  })
})
