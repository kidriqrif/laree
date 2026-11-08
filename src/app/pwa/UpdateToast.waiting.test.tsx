import { fireEvent, render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'

const update = vi.fn<(reload?: boolean) => Promise<void>>(async () => {})
const setNeed = vi.fn<(v: boolean) => void>()

vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: () => ({
    needRefresh: [true, setNeed],
    offlineReady: [false, () => {}],
    updateServiceWorker: update,
  }),
}))

const { UpdateToast } = await import('./UpdateToast.tsx')

it('offers Reload when a new version waits, and only reloads on request', () => {
  render(<UpdateToast />)
  expect(update).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Reload' }))
  expect(update).toHaveBeenCalledWith(true)
  fireEvent.click(screen.getByRole('button', { name: 'Later' }))
  expect(setNeed).toHaveBeenCalledWith(false)
})
