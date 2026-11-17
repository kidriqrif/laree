import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SignInPage } from './SignInPage.tsx'

const fake = vi.hoisted(() => ({
  sent: [] as string[],
  sendProblem: null as string | null,
  verifyProblem: null as string | null,
}))

// What sign-in asks for, recorded instead of reaching a server.
vi.mock('./session.ts', () => ({
  sendCode: async (email: string) => {
    fake.sent.push(email)
    return fake.sendProblem
  },
  verifyCode: async () => fake.verifyProblem,
}))

afterEach(() => {
  cleanup()
  fake.sent = []
  fake.sendProblem = null
  fake.verifyProblem = null
})

const show = () =>
  render(
    <MemoryRouter>
      <SignInPage />
    </MemoryRouter>,
  )

describe('the sign-in page', () => {
  it('says what is wrong with the address under the field, and puts the focus there', () => {
    show()
    const email = screen.getByLabelText('Email')
    fireEvent.change(email, { target: { value: 'not-an-address' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send sign-in code' }))
    expect(screen.getByText('Enter your email address, like name@example.com.')).toBeTruthy()
    expect(email.getAttribute('aria-invalid')).toBe('true')
    expect(email.getAttribute('aria-describedby')).toBe('sign-in-error')
    expect(document.activeElement).toBe(email)
    expect(fake.sent).toEqual([])
  })

  it('clears the error once the address is edited', () => {
    show()
    const email = screen.getByLabelText('Email')
    fireEvent.change(email, { target: { value: 'not-an-address' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send sign-in code' }))
    fireEvent.change(email, { target: { value: 'coach@example.com' } })
    expect(screen.queryByText('Enter your email address, like name@example.com.')).toBeNull()
    expect(email.hasAttribute('aria-invalid')).toBe(false)
    expect(email.hasAttribute('aria-describedby')).toBe(false)
  })

  it('sends the code to the tidied address, then asks for it', async () => {
    show()
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: '  Coach@Example.com ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send sign-in code' }))
    const code = await screen.findByLabelText('6-digit code')
    expect(fake.sent).toEqual(['coach@example.com'])
    expect(screen.getByRole('status').textContent).toContain('Check coach@example.com for a 6-digit code.')
    await waitFor(() => expect(document.activeElement).toBe(code))
    expect(screen.getByRole('button', { name: /Send a new code in/ }).hasAttribute('disabled')).toBe(true)
  })

  it('says what to do next when the code cannot be sent', async () => {
    fake.sendProblem = 'rate limited'
    show()
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'coach@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send sign-in code' }))
    expect(await screen.findByText(/could not send the code: rate limited\. Check the address, or try again/)).toBeTruthy()
    expect(screen.queryByLabelText('6-digit code')).toBeNull()
  })

  it('asks for all 6 digits before checking the code', async () => {
    show()
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'coach@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send sign-in code' }))
    const code = await screen.findByLabelText('6-digit code')
    fireEvent.change(code, { target: { value: '123' } })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(screen.getByText('The code has 6 digits. Copy it from the email.')).toBeTruthy()
    expect(code.getAttribute('aria-invalid')).toBe('true')
  })

  it('goes back to the address with "Use a different email"', async () => {
    show()
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'coach@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send sign-in code' }))
    await screen.findByLabelText('6-digit code')
    fireEvent.click(screen.getByRole('button', { name: 'Use a different email' }))
    expect(screen.getByRole('heading', { name: 'Sign in or create an account' })).toBeTruthy()
    expect(screen.getByRole('status').textContent).toBe('')
  })
})
