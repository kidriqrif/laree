import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { currentDay } from '../../../data/selectors.ts'
import { useLaree } from '../../../data/store.ts'
import { KudosSlot } from '../../athlete/today/KudosSlot.tsx'
import { KudosButtonSlot } from '../../coach/activity/KudosButtonSlot.tsx'
import { ToastRegion } from '../../../ui/overlay/index.ts'

beforeEach(() => useLaree.getState().reset())
afterEach(cleanup)

const mine = () => useLaree.getState().data.activities.find((a) => a.athleteId === 'amir')!

describe('kudos', () => {
  it('sends from an activity, links it, toasts, and shows on Today', async () => {
    const activity = mine()
    render(
      <MemoryRouter>
        <ToastRegion />
        <KudosButtonSlot athleteId="amir" activityId={activity.id} />
        <KudosSlot athleteId="amir" />
      </MemoryRouter>,
    )
    expect(screen.queryByText('Kudos for Amir')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Send kudos' }))
    fireEvent.change(await screen.findByLabelText(/Message/), { target: { value: 'Smart pacing.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    expect(await screen.findByText('Kudos sent to Amir.')).toBeTruthy()
    const k = useLaree.getState().data.kudos.filter((x) => x.athleteId === 'amir').at(-1)!
    expect(k.activityId).toBe(activity.id)
    expect(k.message).toBe('Smart pacing.')
    expect(await screen.findByText('Smart pacing.')).toBeTruthy()
    expect(screen.getByRole('link', { name: activity.title })).toBeTruthy()
  })

  it('shows the newest unseen kudos and nothing once all are seen', async () => {
    const { sendKudos } = useLaree.getState()
    act(() => {
      sendKudos({ athleteId: 'amir', message: 'FIRST' })
      sendKudos({ athleteId: 'amir', message: 'SECOND' })
    })
    const { container } = render(
      <MemoryRouter>
        <KudosSlot athleteId="amir" />
      </MemoryRouter>,
    )
    expect(await screen.findByText('SECOND')).toBeTruthy()
    expect(screen.queryByText('FIRST')).toBeNull()
    cleanup()
    act(() => useLaree.getState().markKudosSeen('amir'))
    const again = render(
      <MemoryRouter>
        <KudosSlot athleteId="amir" />
      </MemoryRouter>,
    )
    expect(again.container.textContent).toBe('')
    expect(container).toBeTruthy()
  })

  it('renders nothing without kudos', () => {
    act(() => useLaree.setState((s) => ({ data: { ...s.data, kudos: [] } })))
    const { container } = render(
      <MemoryRouter>
        <KudosSlot athleteId="amir" />
      </MemoryRouter>,
    )
    expect(container.textContent).toBe('')
  })

  it('awards the coach kudos badge once', () => {
    act(() => useLaree.setState((s) => ({ data: { ...s.data, kudos: [], badges: s.data.badges.filter((b) => b.key !== 'coach-kudos') } })))
    const send = useLaree.getState().sendKudos
    act(() => send({ athleteId: 'amir', message: 'One' }, currentDay()))
    act(() => send({ athleteId: 'amir', message: 'Two' }, currentDay()))
    const n = useLaree.getState().data.badges.filter((b) => b.athleteId === 'amir' && b.key === 'coach-kudos').length
    expect(n).toBe(1)
  })
})
