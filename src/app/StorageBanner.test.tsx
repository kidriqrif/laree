import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { useLaree } from '../data/store.ts'
import { StorageBanner } from './StorageBanner.tsx'

afterEach(() => {
  cleanup()
  useLaree.setState({ storageFailed: false, bannerDismissed: false })
})

describe('StorageBanner', () => {
  it('shows nothing while storage works', () => {
    const { container } = render(<StorageBanner />)
    expect(container.firstChild).toBeNull()
  })

  it('shows the notice, explains why and dismisses', () => {
    render(<StorageBanner />)
    act(() => useLaree.setState({ storageFailed: true }))
    expect(screen.getByRole('status').textContent).toContain('isn’t saving changes')
    fireEvent.click(screen.getByRole('button', { name: 'Why?' }))
    expect(screen.getByText(/private windows/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss storage warning' }))
    expect(screen.queryByRole('status')).toBeNull()
  })
})
