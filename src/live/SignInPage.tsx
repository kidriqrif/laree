/* oxlint-disable jsx-a11y/prefer-tag-over-role -- status region for sent-code and error messages */
import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router'
import { Logo } from '../ui/brand/Logo.tsx'
import { sendCode, verifyCode } from './session.ts'
import styles from './live.module.css'

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/
const RESEND_AFTER_S = 60

/** Sign in with a 6-digit code sent by email. The code is typed into the app, so it works in an installed PWA. */
export function SignInPage() {
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [step, setStep] = useState<'email' | 'code'>('email')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [wait, setWait] = useState(0)

  useEffect(() => {
    if (wait <= 0) return
    const t = setTimeout(() => setWait((w) => w - 1), 1000)
    return () => clearTimeout(t)
  }, [wait])

  const send = async (e?: FormEvent) => {
    e?.preventDefault()
    const address = email.trim().toLowerCase()
    if (!EMAIL.test(address)) {
      setMessage('Enter your email address, like name@example.com.')
      return
    }
    setBusy(true)
    const error = await sendCode(address)
    setBusy(false)
    if (error) {
      setMessage(`The code could not be sent: ${error}`)
      return
    }
    setEmail(address)
    setStep('code')
    setWait(RESEND_AFTER_S)
    setMessage(`We sent a 6-digit code to ${address}. It works for 10 minutes.`)
  }

  const verify = async (e: FormEvent) => {
    e.preventDefault()
    const token = code.replace(/\D/g, '')
    if (token.length !== 6) {
      setMessage('The code has 6 digits.')
      return
    }
    setBusy(true)
    const error = await verifyCode(email, token)
    setBusy(false)
    if (error) setMessage('That code did not work. Check it, or send a new one.')
  }

  return (
    <div className={styles.page} data-register="athlete">
      <header className={styles.hero}>
        <Logo size={64} title="Laree" />
        <p className={styles.tagline}>Every lane counts.</p>
      </header>
      <h1 className={styles.title}>Sign in</h1>
      {step === 'email' ? (
        <form className={styles.form} onSubmit={(e) => void send(e)} noValidate>
          <label className={styles.field}>
            <span>Email</span>
            <input
              type="email"
              autoComplete="email"
              inputMode="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <button type="submit" className={styles.primary} disabled={busy}>
            {busy ? 'Sending…' : 'Send me a code'}
          </button>
          <p className={styles.small}>New to Laree? The same code creates your account.</p>
        </form>
      ) : (
        <form className={styles.form} onSubmit={(e) => void verify(e)} noValidate>
          <label className={styles.field}>
            <span>6-digit code</span>
            <input
              type="text"
              autoComplete="one-time-code"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              required
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          </label>
          <button type="submit" className={styles.primary} disabled={busy}>
            {busy ? 'Checking…' : 'Sign in'}
          </button>
          <div className={styles.row}>
            <button type="button" className={styles.link} disabled={busy || wait > 0} onClick={() => void send()}>
              {wait > 0 ? `Send a new code in ${wait} s` : 'Send a new code'}
            </button>
            <button
              type="button"
              className={styles.link}
              onClick={() => {
                setStep('email')
                setCode('')
                setMessage('')
              }}
            >
              Use a different email
            </button>
          </div>
        </form>
      )}
      <p role="status" className={styles.message}>
        {message}
      </p>
      <p className={styles.small}>
        <Link to="/privacy">How Laree uses your data</Link>
      </p>
    </div>
  )
}
