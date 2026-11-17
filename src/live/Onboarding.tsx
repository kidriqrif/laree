/* oxlint-disable jsx-a11y/prefer-tag-over-role -- status region for save errors */
import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router'
import { CONSENT_VERSION, FREE_COACH_ATHLETES } from './account.ts'
import type { Account, Invitation } from './account.ts'
import { deviceLocale, deviceTimeZone, inMalaysia } from './region.ts'
import { refreshAccount, supabase } from './session.ts'
import styles from './live.module.css'

interface OnboardingProps {
  account: Account
  invitations: Invitation[]
  /** Close the invitations for this visit; they come back next time. */
  onLater: () => void
}

/** First visit: the steps that set up the account. Later visits: invitations to accept. */
export function Onboarding({ account, invitations, onLater }: OnboardingProps) {
  return account.profile.onboarded_at ? (
    <Invitations invitations={invitations} onLater={onLater} />
  ) : (
    <Start account={account} invitations={invitations} />
  )
}

type Role = 'athlete' | 'coach'
type Step = 'role' | 'about' | 'agree' | 'invite'

const SPORTS = [
  { id: 'run', label: 'Run' },
  { id: 'bike', label: 'Bike' },
  { id: 'swim', label: 'Swim' },
  { id: 'strength', label: 'Strength' },
  { id: 'other', label: 'Other' },
] as const

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

/** An invitation already says which side the person is on: start them there. */
function suggestedRole(invitations: Invitation[]): Role | null {
  if (invitations.some((i) => i.role === 'coach')) return 'coach'
  if (invitations.some((i) => i.role === 'athlete')) return 'athlete'
  return null
}

/**
 * Who you are (athlete or coach), your name and sports, the agreements, and for a coach their
 * first invitation. Only a device in Malaysia is asked to agree to storage abroad (region.ts).
 */
function Start({ account, invitations }: { account: Account; invitations: Invitation[] }) {
  const [step, setStep] = useState<Step>('role')
  const [role, setRole] = useState<Role | null>(() => suggestedRole(invitations))
  const [name, setName] = useState(account.profile.display_name)
  const [sports, setSports] = useState<string[]>(account.profile.sports)
  const [health, setHealth] = useState(false)
  const [abroad, setAbroad] = useState(false)
  const [malaysia] = useState(() => inMalaysia())
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const heading = useRef<HTMLHeadingElement>(null)

  // Each step is a new screen: move focus to its heading, so a screen reader starts there.
  const shown = useRef(step)
  useEffect(() => {
    if (shown.current === step) return
    shown.current = step
    heading.current?.focus()
  }, [step])

  const coach = role === 'coach'
  const steps: Step[] = coach ? ['role', 'about', 'agree', 'invite'] : ['role', 'about', 'agree']
  const go = (next: Step) => {
    setError('')
    setStep(next)
  }

  const toSport = (id: string, on: boolean) =>
    setSports((list) => (on ? [...list.filter((s) => s !== id), id] : list.filter((s) => s !== id)))

  const chooseRole = (e: FormEvent) => {
    e.preventDefault()
    if (!role) return setError('Choose how you will use Laree.')
    go('about')
  }

  const about = (e: FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return setError(coach ? 'Enter the name your athletes will see.' : 'Enter the name your coach will see.')
    go('agree')
  }

  const finish = async (e: FormEvent) => {
    e.preventDefault()
    if (!role) return go('role')
    if (!coach && !health) return setError('Laree needs this agreement to keep your training.')
    if (malaysia && !abroad) return setError('Laree needs this agreement to store your data in Singapore.')
    setBusy(true)
    const db = supabase()
    const consents = [
      ...(coach ? [] : [{ purpose: 'health_data', granted: true, text_version: CONSENT_VERSION }]),
      ...(malaysia ? [{ purpose: 'cross_border', granted: true, text_version: CONSENT_VERSION }] : []),
    ]
    const timeZone = deviceTimeZone()
    const agreed = consents.length > 0 ? await db.from('consents').insert(consents) : { error: null }
    // The role first: it can be chosen only until the account has started.
    const chosen = agreed.error ? agreed : await db.rpc('choose_role', { chosen: role })
    const saved = chosen.error
      ? chosen
      : await db
          .from('profiles')
          .update({
            display_name: name.trim(),
            sports: SPORTS.map((s) => s.id).filter((id) => sports.includes(id)),
            locale: deviceLocale(),
            ...(timeZone && timeZone.length <= 60 ? { time_zone: timeZone } : {}),
            onboarded_at: new Date().toISOString(),
          })
          .eq('id', account.uid)
    setBusy(false)
    if (saved.error) return setError(`Could not save: ${saved.error.message}`)
    if (coach) return go('invite')
    await refreshAccount()
  }

  const invite = async (e: FormEvent) => {
    e.preventDefault()
    const address = email.trim().toLowerCase()
    if (!EMAIL.test(address)) return setError('Enter the athlete’s email address, or skip this for now.')
    setBusy(true)
    const { error: inviteError } = await supabase().from('invitations').insert({ coach_id: account.uid, email: address })
    setBusy(false)
    if (inviteError) return setError(`Could not invite: ${inviteError.message}`)
    await refreshAccount()
  }

  const number = steps.indexOf(step) + 1
  const progress = (
    <p className={styles.small}>
      Step {number} of {steps.length}
    </p>
  )

  return (
    <div className={styles.page} data-register={coach ? 'coach' : 'athlete'}>
      {step === 'role' ? (
        <form className={styles.form} onSubmit={chooseRole} noValidate>
          <h1 ref={heading} tabIndex={-1} className={styles.title}>
            Welcome to Laree
          </h1>
          {progress}
          <fieldset className={styles.choices}>
            <legend className={styles.lede}>How will you use Laree?</legend>
            <label className={styles.choice}>
              <input type="radio" name="role" checked={role === 'athlete'} onChange={() => setRole('athlete')} />
              <span>
                I train
                <span className={styles.small}>
                  Log sessions and check-ins, and follow a plan from your coach or one you write yourself.
                </span>
              </span>
            </label>
            <label className={styles.choice}>
              <input type="radio" name="role" checked={role === 'coach'} onChange={() => setRole('coach')} />
              <span>
                I coach
                <span className={styles.small}>
                  Plan training for your athletes and see how they are doing. Free for up to {FREE_COACH_ATHLETES}{' '}
                  athletes.
                </span>
              </span>
            </label>
          </fieldset>
          <button type="submit" className={styles.primary}>
            Next
          </button>
        </form>
      ) : null}

      {step === 'about' ? (
        <form className={styles.form} onSubmit={about} noValidate>
          <h1 ref={heading} tabIndex={-1} className={styles.title}>
            About you
          </h1>
          {progress}
          <label className={styles.field}>
            <span>{coach ? 'Your name, as your athletes see it' : 'Your name'}</span>
            <input type="text" autoComplete="name" maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <fieldset className={styles.consents}>
            <legend>{coach ? 'Sports you coach' : 'Your sports'}</legend>
            <div className={styles.row}>
              {SPORTS.map((s) => (
                <label key={s.id} className={styles.check}>
                  <input type="checkbox" checked={sports.includes(s.id)} onChange={(e) => toSport(s.id, e.target.checked)} />
                  <span>{s.label}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <div className={styles.row}>
            <button type="button" className={styles.link} onClick={() => go('role')}>
              Back
            </button>
            <button type="submit" className={styles.primary}>
              Next
            </button>
          </div>
        </form>
      ) : null}

      {step === 'agree' ? (
        <form className={styles.form} onSubmit={(e) => void finish(e)} noValidate>
          <h1 ref={heading} tabIndex={-1} className={styles.title}>
            Before you start
          </h1>
          {progress}
          {coach ? (
            <p className={styles.card}>
              The free coach plan has room for {FREE_COACH_ATHLETES} athletes at a time. AI summaries for your athletes
              come with Premium.
            </p>
          ) : null}
          {!coach || malaysia ? (
            <fieldset className={styles.consents}>
              <legend>Your agreement</legend>
              {coach ? null : (
                <label className={styles.check}>
                  <input type="checkbox" checked={health} onChange={(e) => setHealth(e.target.checked)} />
                  <span>
                    I agree that Laree keeps my training and health data: sessions, heart rate, sleep, soreness, mood and
                    check-ins.
                  </span>
                </label>
              )}
              {malaysia ? (
                <label className={styles.check}>
                  <input type="checkbox" checked={abroad} onChange={(e) => setAbroad(e.target.checked)} />
                  <span>I understand my data is stored in Singapore, outside Malaysia.</span>
                </label>
              ) : null}
            </fieldset>
          ) : null}
          {!coach && invitations.length === 0 ? (
            <p className={styles.small}>
              Training with a coach? Ask them to invite {account.email}. Until then you plan your own training.
            </p>
          ) : null}
          <p className={styles.small}>
            Your data is stored in Singapore. You can download or delete everything at any time from{' '}
            {coach ? 'Settings' : 'Me'}. <Link to="/privacy">Read how Laree uses your data</Link>.
          </p>
          <div className={styles.row}>
            <button type="button" className={styles.link} disabled={busy} onClick={() => go('about')}>
              Back
            </button>
            <button type="submit" className={styles.primary} disabled={busy}>
              {busy ? 'Saving…' : 'Start'}
            </button>
          </div>
        </form>
      ) : null}

      {step === 'invite' ? (
        <form className={styles.form} onSubmit={(e) => void invite(e)} noValidate>
          <h1 ref={heading} tabIndex={-1} className={styles.title}>
            Invite your first athlete
          </h1>
          {progress}
          <label className={styles.field}>
            <span>Their email</span>
            <input type="email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <p className={styles.small}>
            They sign in to Laree with this email and accept. You can invite more later in Settings, under Team.
          </p>
          <div className={styles.row}>
            <button type="button" className={styles.link} disabled={busy} onClick={() => void refreshAccount()}>
              Skip for now
            </button>
            <button type="submit" className={styles.primary} disabled={busy}>
              {busy ? 'Sending…' : 'Invite'}
            </button>
          </div>
        </form>
      ) : null}

      <p role="status" className={styles.message}>
        {error}
      </p>
    </div>
  )
}

/** Invitations to accept, after the account has started. */
function Invitations({ invitations, onLater }: { invitations: Invitation[]; onLater: () => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const accept = async (inv: Invitation) => {
    setBusy(true)
    const db = supabase()
    const consent =
      inv.role === 'athlete'
        ? await db.from('consents').insert({ purpose: 'coach_sharing', granted: true, text_version: CONSENT_VERSION })
        : { error: null }
    const result = consent.error ? consent : await db.rpc('accept_invitation', { invitation: inv.id })
    setBusy(false)
    if (result.error?.code === 'LA001') {
      return setError('This coach has no room for another athlete on their free plan. Ask them about it.')
    }
    if (result.error) return setError(`Could not accept: ${result.error.message}`)
    await refreshAccount()
  }

  return (
    <div className={styles.page} data-register="athlete">
      <h1 className={styles.title}>You have an invitation</h1>
      <section className={styles.form} aria-label="Invitations">
        {invitations.map((inv) => (
          <div key={inv.id} className={styles.card}>
            {inv.role === 'coach' ? (
              <p>You are invited to coach on Laree. Accepting gives your account the coach tools on the premium plan.</p>
            ) : (
              <p>
                <strong>{inv.coach_name || 'A coach'}</strong> invited you to train with them. Accepting lets them see
                your training and check-ins and plan your sessions. If you have a coach already, that ends.
              </p>
            )}
            <button type="button" className={styles.primary} disabled={busy} onClick={() => void accept(inv)}>
              Accept
            </button>
          </div>
        ))}
        <button type="button" className={styles.link} onClick={onLater}>
          Not now
        </button>
      </section>
      <p role="status" className={styles.message}>
        {error}
      </p>
    </div>
  )
}
