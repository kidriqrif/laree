/* oxlint-disable jsx-a11y/prefer-tag-over-role -- status region for the sent-code note */
import { useEffect, useRef, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { Link } from 'react-router'
import { Logo } from '../ui/brand/Logo.tsx'
import { IconCalendar, IconCheckIns, IconWatch } from '../ui/icons/index.ts'
import { FREE_COACH_ATHLETES, useAccount } from './account.ts'
import { sendCode, verifyCode } from './session.ts'
import styles from './SignInPage.module.css'

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/
const RESEND_AFTER_S = 60
const ERROR_ID = 'sign-in-error'

/** What Laree is, for someone who has not used it yet. Each line says only what the app does today. */
const POINTS: ReadonlyArray<{ icon: ReactNode; title: string; text: string }> = [
  {
    icon: <IconCheckIns size={24} aria-hidden="true" />,
    title: 'For athletes',
    text: 'Today’s session, a morning check-in in a few taps, and your watch files (.FIT, .GPX or .TCX) in one place.',
  },
  {
    icon: <IconCalendar size={24} aria-hidden="true" />,
    title: 'For coaches',
    text: 'Plan each athlete’s weeks and season, and see first who needs your attention.',
  },
  {
    icon: <IconWatch size={24} aria-hidden="true" />,
    title: 'On your phone',
    text: 'Add Laree to your home screen. It saves without a signal and sends once you are back online.',
  },
]

/**
 * The live app's front page: what Laree is, and sign-in with a 6-digit code sent by email. The code
 * is typed into the app, so it works in an installed PWA.
 */
export function SignInPage() {
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [step, setStep] = useState<'email' | 'code'>('email')
  const [busy, setBusy] = useState(false)
  /** A problem with what was typed or sent: shown under the field, which takes the focus. */
  const [error, setError] = useState('')
  /** Progress, such as "the code is on its way". */
  const [note, setNote] = useState('')
  const [wait, setWait] = useState(0)
  const notice = useAccount((s) => s.notice)
  const field = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (wait <= 0) return
    const t = setTimeout(() => setWait((w) => w - 1), 1000)
    return () => clearTimeout(t)
  }, [wait])

  // A new step puts the focus on its field. The first render leaves it alone: on a phone it would
  // open the keyboard over the page before it has been read.
  const shown = useRef(step)
  useEffect(() => {
    if (shown.current === step) return
    shown.current = step
    field.current?.focus()
  }, [step])

  const fail = (text: string) => {
    setError(text)
    field.current?.focus()
  }

  const send = async (e?: FormEvent) => {
    e?.preventDefault()
    const address = email.trim().toLowerCase()
    if (!EMAIL.test(address)) return fail('Enter your email address, like name@example.com.')
    setError('')
    setBusy(true)
    // A note left by the last account (e.g. "your account is deleted") has been read by now.
    useAccount.setState({ notice: null })
    const problem = await sendCode(address)
    setBusy(false)
    if (problem) return fail(`Laree could not send the code: ${problem}. Check the address, or try again in a minute.`)
    setEmail(address)
    setCode('')
    setStep('code')
    setWait(RESEND_AFTER_S)
    setNote(`Check ${address} for a 6-digit code. It works for 10 minutes.`)
  }

  const verify = async (e: FormEvent) => {
    e.preventDefault()
    const token = code.replace(/\D/g, '')
    if (token.length !== 6) return fail('The code has 6 digits. Copy it from the email.')
    setError('')
    setBusy(true)
    const problem = await verifyCode(email, token)
    setBusy(false)
    if (problem) fail('That code did not work. Check it, or send a new one.')
  }

  const restart = () => {
    setStep('email')
    setCode('')
    setError('')
    setNote('')
  }

  const describedBy = error ? ERROR_ID : undefined

  return (
    <div className={styles.page} data-register="athlete">
      <header className={styles.intro}>
        <Logo size={56} title="Laree" />
        <p className={styles.tagline}>Every lane counts.</p>
        <h1 className={styles.headline}>Training plans and check-ins for coaches and their athletes.</h1>
      </header>

      <section className={styles.card} aria-labelledby="sign-in-h">
        <h2 id="sign-in-h" className={styles.cardTitle}>
          {step === 'email' ? 'Sign in or create an account' : 'Enter your code'}
        </h2>
        {/* Always in the page, so a screen reader announces what appears in it. */}
        <p role="status" className={styles.note}>
          {(step === 'code' ? note : '') || notice}
        </p>
        {step === 'email' ? (
          <form className={styles.form} onSubmit={(e) => void send(e)} noValidate>
            <label className={styles.field}>
              <span>Email</span>
              <input
                ref={field}
                type="email"
                name="email"
                autoComplete="email"
                inputMode="email"
                autoCapitalize="none"
                spellCheck={false}
                required
                value={email}
                aria-invalid={error ? true : undefined}
                aria-describedby={describedBy}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            {error ? (
              <p id={ERROR_ID} className={styles.error}>
                {error}
              </p>
            ) : null}
            <button type="submit" className={styles.primary} disabled={busy}>
              {busy ? <span className={styles.spinner} aria-hidden="true" /> : null}
              {busy ? 'Sending…' : 'Send sign-in code'}
            </button>
            <p className={styles.small}>
              New to <span translate="no">Laree</span>? The same code creates your account. There is no password to
              remember.
            </p>
          </form>
        ) : (
          <form className={styles.form} onSubmit={(e) => void verify(e)} noValidate>
            <label className={styles.field}>
              <span>6-digit code</span>
              <input
                ref={field}
                type="text"
                name="code"
                autoComplete="one-time-code"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                spellCheck={false}
                required
                className={styles.code}
                value={code}
                aria-invalid={error ? true : undefined}
                aria-describedby={describedBy}
                onChange={(e) => setCode(e.target.value)}
              />
            </label>
            {error ? (
              <p id={ERROR_ID} className={styles.error}>
                {error}
              </p>
            ) : null}
            <button type="submit" className={styles.primary} disabled={busy}>
              {busy ? <span className={styles.spinner} aria-hidden="true" /> : null}
              {busy ? 'Checking…' : 'Sign in'}
            </button>
            <div className={styles.row}>
              <button type="button" className={styles.link} disabled={busy || wait > 0} onClick={() => void send()}>
                {wait > 0 ? `Send a new code in ${wait} s` : 'Send a new code'}
              </button>
              <button type="button" className={styles.link} disabled={busy} onClick={restart}>
                Use a different email
              </button>
            </div>
          </form>
        )}
      </section>

      <ul className={styles.points} aria-label="What Laree does">
        {POINTS.map((p) => (
          <li key={p.title} className={styles.point}>
            <span className={styles.pointIcon}>{p.icon}</span>
            <span>
              <strong>{p.title}.</strong> {p.text}
            </span>
          </li>
        ))}
      </ul>

      <footer className={styles.footer}>
        <p>Free to start. On the free plan a coach has room for {FREE_COACH_ATHLETES}&nbsp;athletes.</p>
        <Link to="/privacy">How Laree uses your data</Link>
      </footer>
    </div>
  )
}
