/* oxlint-disable jsx-a11y/prefer-tag-over-role -- status region for invite and access messages */
import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { useAccount } from './account.ts'
import { refreshAccount, supabase } from './session.ts'
import styles from './live.module.css'

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

interface Sent {
  id: string
  email: string
  expires_at: string
}

const dateFmt = new Intl.DateTimeFormat('en-MY', { day: 'numeric', month: 'short' })

async function openInvitations(): Promise<Sent[] | null> {
  const { data, error } = await supabase()
    .from('invitations')
    .select('id, email, expires_at')
    .is('accepted_at', null)
    .gt('expires_at', new Date().toISOString())
    .order('created_at')
  return error ? null : ((data ?? []) as Sent[])
}

/** The coach's team: invite athletes by email, withdraw invitations, grant AI access per athlete. */
export default function CoachTeamPanel({ headingId = 'team-h' }: { headingId?: string }) {
  const account = useAccount((s) => s.account)
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState<Sent[]>([])
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  const [version, setVersion] = useState(0)
  const load = useCallback(() => setVersion((v) => v + 1), [])

  useEffect(() => {
    let gone = false
    void openInvitations().then((rows) => {
      if (!gone && rows) setSent(rows)
    })
    return () => {
      gone = true
    }
  }, [version])

  if (!account || account.profile.role !== 'coach') return null

  const invite = async (e: FormEvent) => {
    e.preventDefault()
    const address = email.trim().toLowerCase()
    if (!EMAIL.test(address)) return setMessage('Enter the athlete’s email address.')
    setBusy(true)
    const { error } = await supabase().from('invitations').insert({ coach_id: account.uid, email: address })
    setBusy(false)
    if (error) {
      return setMessage(error.code === '23505' ? `${address} is already invited.` : `Could not invite: ${error.message}`)
    }
    setEmail('')
    setMessage(`Invited ${address}. Ask them to open ${location.origin} and sign in with that email.`)
    load()
  }

  const withdraw = async (id: string) => {
    const { error } = await supabase().from('invitations').delete().eq('id', id)
    if (error) return setMessage(`Could not withdraw: ${error.message}`)
    load()
  }

  const setAi = async (athleteId: string, on: boolean) => {
    const { error } = await supabase()
      .from('coach_athletes')
      .update({ ai_access: on })
      .eq('coach_id', account.uid)
      .eq('athlete_id', athleteId)
      .eq('status', 'active')
    if (error) return setMessage(`Could not change AI access: ${error.message}`)
    await refreshAccount()
  }

  return (
    <section className={styles.form} aria-labelledby={headingId}>
      <h2 id={headingId} tabIndex={-1} className={styles.title}>
        Team
      </h2>
      <form className={styles.card} onSubmit={(e) => void invite(e)} noValidate>
        <label className={styles.field}>
          <span>Invite an athlete by email</span>
          <input type="email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <button type="submit" className={styles.primary} disabled={busy}>
          Invite
        </button>
        <p className={styles.small}>
          They sign in to Laree with this email and accept. Then you see their training and plan their sessions.
        </p>
      </form>
      {sent.length > 0 ? (
        <div className={styles.card}>
          <h3>Waiting to accept</h3>
          <ul className={styles.list}>
            {sent.map((s) => (
              <li key={s.id} className={styles.listRow}>
                <span>
                  {s.email}
                  <br />
                  <span className={styles.small}>Open until {dateFmt.format(new Date(s.expires_at))}</span>
                </span>
                <button type="button" className={styles.link} onClick={() => void withdraw(s.id)}>
                  Withdraw
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <div className={styles.card}>
        <h3>AI access</h3>
        <p className={styles.small}>
          AI is part of your premium plan. Turn it on for an athlete here; it runs only once they agree too.
        </p>
        {account.athletes.length === 0 ? (
          <p>No athletes yet. Invite one above.</p>
        ) : (
          <ul className={styles.list}>
            {account.athletes.map((a) => {
              const on = account.links.some((l) => l.athlete_id === a.id && l.ai_access)
              return (
                <li key={a.id} className={styles.listRow}>
                  <label className={styles.check}>
                    <input type="checkbox" checked={on} onChange={(e) => void setAi(a.id, e.target.checked)} />
                    <span>{a.display_name || 'Athlete'}</span>
                  </label>
                </li>
              )
            })}
          </ul>
        )}
      </div>
      <p role="status" className={styles.message}>
        {message}
      </p>
    </section>
  )
}
