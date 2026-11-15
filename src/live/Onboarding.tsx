/* oxlint-disable jsx-a11y/prefer-tag-over-role -- status region for save errors */
import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router'
import { CONSENT_VERSION } from './account.ts'
import type { Account, Invitation } from './account.ts'
import { refreshAccount, supabase } from './session.ts'
import styles from './live.module.css'


interface OnboardingProps {
  account: Account
  invitations: Invitation[]
  /** Close the invitations for this visit; they come back next time. */
  onLater: () => void
}

/** First visit: your name and the two consents the app needs. Also where invitations are accepted. */
export function Onboarding({ account, invitations, onLater }: OnboardingProps) {
  const first = !account.profile.onboarded_at
  const [name, setName] = useState(account.profile.display_name)
  const [health, setHealth] = useState(false)
  const [abroad, setAbroad] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const finish = async (e: FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return setError('Enter the name your coach will see.')
    if (!health || !abroad) return setError('Laree needs both agreements to keep your training.')
    setBusy(true)
    const db = supabase()
    const consents = await db.from('consents').insert([
      { purpose: 'health_data', granted: true, text_version: CONSENT_VERSION },
      { purpose: 'cross_border', granted: true, text_version: CONSENT_VERSION },
    ])
    const profile = consents.error
      ? consents
      : await db
          .from('profiles')
          .update({ display_name: name.trim(), onboarded_at: new Date().toISOString() })
          .eq('id', account.uid)
    setBusy(false)
    if (profile.error) return setError(`Could not save: ${profile.error.message}`)
    await refreshAccount()
  }

  const accept = async (inv: Invitation) => {
    setBusy(true)
    const db = supabase()
    const consent =
      inv.role === 'athlete'
        ? await db.from('consents').insert({ purpose: 'coach_sharing', granted: true, text_version: CONSENT_VERSION })
        : { error: null }
    const result = consent.error ? consent : await db.rpc('accept_invitation', { invitation: inv.id })
    setBusy(false)
    if (result.error) return setError(`Could not accept: ${result.error.message}`)
    await refreshAccount()
  }

  return (
    <div className={styles.page} data-register="athlete">
      <h1 className={styles.title}>{first ? 'Welcome to Laree' : 'You have an invitation'}</h1>
      {first ? (
        <form className={styles.form} onSubmit={(e) => void finish(e)} noValidate>
          <label className={styles.field}>
            <span>Your name</span>
            <input type="text" autoComplete="name" maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <fieldset className={styles.consents}>
            <legend>Before you start</legend>
            <label className={styles.check}>
              <input type="checkbox" checked={health} onChange={(e) => setHealth(e.target.checked)} />
              <span>
                I agree that Laree keeps my training and health data: sessions, heart rate, sleep, soreness, mood and
                check-ins.
              </span>
            </label>
            <label className={styles.check}>
              <input type="checkbox" checked={abroad} onChange={(e) => setAbroad(e.target.checked)} />
              <span>I understand my data is stored in Singapore, outside Malaysia.</span>
            </label>
            <p className={styles.small}>
              You can download or delete everything at any time from Me. <Link to="/privacy">Read how Laree uses your data</Link>.
            </p>
          </fieldset>
          <button type="submit" className={styles.primary} disabled={busy}>
            {busy ? 'Saving…' : 'Start'}
          </button>
        </form>
      ) : null}
      {!first && invitations.length > 0 ? (
        <section className={styles.form} aria-label="Invitations">
          {invitations.map((inv) => (
            <div key={inv.id} className={styles.card}>
              {inv.role === 'coach' ? (
                <p>You are invited to coach on Laree. Accepting gives your account the coach tools.</p>
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
      ) : null}
      <p role="status" className={styles.message}>
        {error}
      </p>
    </div>
  )
}
