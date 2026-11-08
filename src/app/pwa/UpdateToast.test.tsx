import { render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import { UpdateToast } from './UpdateToast.tsx'

it('renders an empty status region when no update waits', () => {
  render(<UpdateToast />)
  expect(screen.getByRole('status')).toBeTruthy()
  expect(screen.queryByRole('button', { name: 'Reload' })).toBeNull()
})
