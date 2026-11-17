/* oxlint-disable jsx-a11y/prefer-tag-over-role -- status region for invite and access messages */
import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { useLaree } from '../data/store.ts'
import { coachRoom, useAccount } from './account.ts'
import { pendingWrites, refreshAccount, supabase, syncNow } from './session.ts'
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
  const settings = useLaree((s) => s.data.settings)

  const [version, setVersion] = useState(0)
  const load = useCallback(() => setVersion((v) => v + 1), [])
  /** The time of the last load: "expired" is judged against it, so rendering reads no clock. */
  const [loadedAt, setLoadedAt] = useState(0)

  useEffect(() => {
    let gone = false
    void openInvitations().then((rows) => {
      if (gone || !rows) return
      setSent(rows)
      setLoadedAt(Date.now())
    })
    return () => {
      gone = true
    }
  }, [version])

  if (!account || account.profile.role !== 'coach') return null
  const room = coachRoom(account)
  // Open invitations take a place on the free plan too, as the database counts them.
  const open = sent.filter((s) => Date.parse(s.expires_at) > loadedAt).length
  const full = room.limit !== null && room.used + open >= room.limit

  const invite = async (e: FormEvent) => {
    e.preventDefault()
    const address = email.trim().toLowerCase()
    if (!EMAIL.test(address)) return setMessage('Enter the athlete’s email address.')
    setBusy(true)
    const { error } = await supabase().from('invitations').insert({ coach_id: account.uid, email: address })
    setBusy(false)
    if (error) {
      return setMessage(
        error.code === '23505'
          ? `${address} is already invited. Withdraw that invitation to send a new one.`
          : error.code === 'LA001'
            ? `Your free plan has room for ${room.limit ?? 0} athletes, open invitations included, and it is full.`
            : `Could not invite: ${error.message}`,
      )
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

  const stop = async (athleteId: string, name: string) => {
    if (!globalThis.confirm(`Stop coaching ${name}? You lose access to their training. They keep it all.`)) return
    // An edit still waiting to be sent would be refused once the link has ended: send it first.
    await syncNow()
    if (pendingWrites() > 0) {
      return setMessage(`Some of your changes have not been sent yet. Stop coaching ${name} once they are saved.`)
    }
    const { error } = await supabase()
      .from('coach_athletes')
      .update({ status: 'ended' })
      .eq('coach_id', account.uid)
      .eq('athlete_id', athleteId)
      .eq('status', 'active')
    if (error) return setMessage(`Could not stop coaching ${name}: ${error.message}`)
    setMessage(`You no longer coach ${name}.`)
    await refreshAccount()
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
      {room.premium ? null : (
        <p className={styles.card}>
          Free coach plan: {room.used} {room.used === 1 ? 'athlete' : 'athletes'} and {open} open{' '}
          {open === 1 ? 'invitation' : 'invitations'}, of {room.limit} places. Premium lifts the limit and adds AI
          summaries for your athletes.
        </p>
      )}
      <form className={styles.card} onSubmit={(e) => void invite(e)} noValidate>
        <label className={styles.field}>
          <span>Invite an athlete by email</span>
          <input
            type="email"
            autoComplete="off"
            value={email}
            disabled={full}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <button type="submit" className={styles.primary} disabled={busy || full}>
          Invite
        </button>
        <p className={styles.small}>
          {full
            ? 'Your free plan is full. To invite someone new, withdraw an invitation or stop coaching an athlete below.'
            : 'They sign in to Laree with this email and accept. Then you see their training and plan their sessions.'}
        </p>
      </form>
      {sent.length > 0 ? (
        <div className={styles.card}>
          <h3>Invitations not accepted yet</h3>
          <ul className={styles.list}>
            {sent.map((s) => (
              <li key={s.id} className={styles.listRow}>
                <span>
                  {s.email}
                  <br />
                  <span className={styles.small}>
                    {Date.parse(s.expires_at) > loadedAt
                      ? `Open until ${dateFmt.format(new Date(s.expires_at))}`
                      : 'Expired. Withdraw it to invite this email again.'}
                  </span>
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
        <h3>Your athletes</h3>
        <p className={styles.small}>
          {room.premium
            ? 'AI is part of your premium plan. Turn it on for an athlete here; it runs only once they agree too.'
            : 'AI summaries for your athletes come with the premium plan.'}
        </p>
        {account.athletes.length === 0 ? (
          <p>No athletes yet. Invite one above.</p>
        ) : (
          <ul className={styles.list}>
            {account.athletes.map((a) => {
              const on = account.links.some((l) => l.athlete_id === a.id && l.ai_access)
              const name = a.display_name || 'Athlete'
              return (
                <li key={a.id} className={styles.listRow}>
                  <strong>{name}</strong>
                  <label className={styles.check}>
                    <input
                      type="checkbox"
                      checked={on && room.premium}
                      disabled={!room.premium}
                      aria-label={`AI for ${name}`}
                      onChange={(e) => void setAi(a.id, e.target.checked)}
                    />
                    <span className={styles.small}>
                      AI · {settings[a.id]?.aiConsent ? 'they have agreed' : 'they have not agreed yet'}
                    </span>
                  </label>
                  <button type="button" className={styles.link} onClick={() => void stop(a.id, name)}>
                    Stop coaching
                  </button>
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
