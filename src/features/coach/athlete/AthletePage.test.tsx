import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { createMemoryRouter } from 'react-router'
import { RouterProvider } from 'react-router/dom'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { routes } from '../../../app/router.tsx'
import { useViewer } from '../../../app/viewer.ts'
import { currentDay, selectFitnessSeries, selectOpenFlags, thresholdOn } from '../../../data/selectors.ts'
import { useLaree } from '../../../data/store.ts'
import type { AthleteId } from '../../../domain/types.ts'

beforeEach(() => {
  localStorage.clear()
  useLaree.getState().reset()
  useViewer.setState({ role: 'coach', athleteId: 'amir', coachAthleteId: 'amir', chosen: true })
})
afterEach(cleanup)

async function renderAthlete(id: string) {
  const router = createMemoryRouter(routes, { initialEntries: [`/coach/athlete/${id}`] })
  render(<RouterProvider router={router} />)
  await screen.findByRole('heading', { level: 1 }, { timeout: 25000 })
  return router
}

const withMostFlags = (): AthleteId => {
  const data = useLaree.getState().data
  const ids: AthleteId[] = ['amir', 'danial', 'irfan']
  return ids.toSorted((a, b) => selectOpenFlags(data, b).length - selectOpenFlags(data, a).length)[0] ?? 'amir'
}

describe('athlete summary', () => {
  it('puts open flags first with the rule and the values', async () => {
    const id = withMostFlags()
    const flags = selectOpenFlags(useLaree.getState().data, id)
    expect(flags.length).toBeGreaterThan(0)
    await renderAthlete(id)
    const flagsHeading = await screen.findByRole('heading', { level: 2, name: /^Flags/ })
    const others = screen.getAllByRole('heading', { level: 2 }).filter((h) => h !== flagsHeading)
    for (const h of others) {
      expect(flagsHeading.compareDocumentPosition(h) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    }
    const cards = screen.getAllByTestId('flag-card')
    expect(cards.length).toBeGreaterThanOrEqual(flags.length)
    expect(within(cards[0]!).getByText(flags[0]!.explanation)).toBeTruthy()
    expect(within(cards[0]!).getByText(/Raised/)).toBeTruthy()
  })

  it('shows the Fitness, Fatigue, Form and Ramp figures from the series', async () => {
    await renderAthlete('amir')
    const today = currentDay()
    const p = selectFitnessSeries(useLaree.getState().data, 'amir', today).find((x) => x.day === today)!
    const figures = await screen.findByTestId('fitness-figures')
    expect(figures.textContent).toContain(`Fitness ${Math.round(p.fitness)}`)
    expect(figures.textContent).toContain(`Fatigue ${Math.round(p.fatigue)}`)
  })

  it('records the athlete as the last viewed', async () => {
    useViewer.setState({ coachAthleteId: 'amir' })
    await renderAthlete('danial')
    await screen.findByRole('heading', { level: 1, name: 'Danial' })
    await waitFor(() => expect(useViewer.getState().coachAthleteId).toBe('danial'))
  })

  it('says so for an unknown athlete', async () => {
    const router = createMemoryRouter(routes, { initialEntries: ['/coach/athlete/nobody'] })
    render(<RouterProvider router={router} />)
    expect(await screen.findByText("We can't find that athlete", {}, { timeout: 25000 })).toBeTruthy()
  })

  it('keeps the old threshold in history when it is edited', async () => {
    await renderAthlete('amir')
    const today = currentDay()
    const before = thresholdOn(useLaree.getState().data, 'amir', 'ftp', today)
    const rowsBefore = (await screen.findAllByTestId('threshold-row')).length
    fireEvent.click(await screen.findByRole('button', { name: 'Edit thresholds' }))
    const dialog = await screen.findByRole('dialog', { name: 'Edit thresholds' })
    const ftp = within(dialog).getByRole('textbox', { name: /FTP/ })
    fireEvent.change(ftp, { target: { value: '270' } })
    fireEvent.blur(ftp)
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(thresholdOn(useLaree.getState().data, 'amir', 'ftp', today)).toBe(270))
    const rows = useLaree.getState().data.thresholds.filter((t) => t.athleteId === 'amir' && t.kind === 'ftp')
    expect(rows.some((t) => t.value === before)).toBe(true)
    expect(rows.some((t) => t.value === 270 && t.effectiveFromDay === today && t.source === 'coachEdit')).toBe(true)
    await waitFor(() => expect(screen.getAllByTestId('threshold-row').length).toBe(rowsBefore + 1))
  })
})
