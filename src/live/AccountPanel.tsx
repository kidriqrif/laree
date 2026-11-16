/* oxlint-disable jsx-a11y/prefer-tag-over-role -- status region for sync and sign-out messages */
import { useState } from 'react'
import { Link } from 'react-router'
import { isSelfCoached, useAccount } from './account.ts'
import { deleteMyAccount, exportMyData, saveBlob } from './privacy.ts'
import { pendingWrites, signOut, syncNow } from './session.ts'
import { useSyncStatus } from './sync/syncStatus.ts'
import styles from './live.module.css'

const timeFmt = new Intl.DateTimeFormat('en-MY', { hour: 'numeric', minute: '2-digit' })
const changes = (n: number): string => `${n} ${n === 1 ? 'change' : 'changes'}`

/** Account, sync and sign-out, in Me (athletes) and Settings (coaches). Live app only. */
export default function AccountPanel({ headingId = 'account-h' }: { headingId?: string }) {
  const account = useAccount((s) => s.account)
  const sync = useSyncStatus()
  const [confirming, setConfirming] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  if (!account) return null

  const download = async () => {
    setBusy(true)
    setNote('')
    try {
      saveBlob(await exportMyData(account), `laree-data-${new Date().toISOString().slice(0, 10)}.json`)
    } catch {
      setNote('Your data could not be downloaded. Check your connection and try again.')
    }
    setBusy(false)
  }

  const remove = async () => {
    setBusy(true)
    try {
      const error = await deleteMyAccount()
      if (error) setNote(error)
    } catch {
      setNote('Your account may be deleted, but this device could not finish. Reload the page.')
    } finally {
      setBusy(false)
    }
  }
  const selfCoached = isSelfCoached(account)

  const leave = async () => {
    if (pendingWrites() > 0 && !confirming) {
      setConfirming(true)
      return
    }
    setBusy(true)
    try {
      const error = await signOut()
      if (error) setNote(error)
    } catch {
      setNote('Signing out failed. Check your connection and try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className={styles.form} aria-labelledby={headingId}>
      <h2 id={headingId} tabIndex={-1} className={styles.title}>
        Account
      </h2>
      <div className={styles.card}>
        <p>
          Signed in as <strong>{account.email}</strong>
          <br />
          <span className={styles.small}>
            {account.profile.role === 'coach' ? 'Coach' : 'Athlete'} · {account.profile.plan === 'premium' ? 'Premium' : 'Free'} plan
          </span>
        </p>
        {account.profile.role === 'athlete' ? (
          selfCoached ? (
            <p>
              You have no coach, so you plan your own training.{' '}
              <Link to={`/coach/calendar/${account.uid}`}>Open the planner</Link>
            </p>
          ) : (
            <p>Coached by {account.coach?.display_name || 'your coach'}.</p>
          )
        ) : null}
      </div>
      <div className={styles.card}>
        <p role="status">
          {sync.syncing
            ? 'Syncing…'
            : sync.pending > 0
              ? sync.unsaved
                ? // Never claim a change is kept on the device when the save failed.
                  `${changes(sync.pending)} could not be saved on this device. Keep Laree open until ${sync.pending === 1 ? 'it is' : 'they are'} sent.`
                : `${changes(sync.pending)} saved on this device. ${sync.offline ? `${sync.pending === 1 ? 'It sends' : 'They send'} when you are online.` : 'Sending…'}`
              : sync.lastSyncedAt
                ? `Up to date at ${timeFmt.format(sync.lastSyncedAt)}.`
                : 'Not synced yet.'}
          {sync.problem && !sync.offline ? ` ${sync.problem}` : ''}
        </p>
        <button type="button" className={styles.link} onClick={() => void syncNow()} disabled={sync.syncing}>
          Sync now
        </button>
      </div>
      <div className={styles.card}>
        <h3>Your data</h3>
        <div className={styles.row}>
          {/* The file holds what the server has: wait until this device's changes are there too. */}
          <button type="button" className={styles.link} disabled={busy || sync.pending > 0} onClick={() => void download()}>
            Download my data
          </button>
          <Link to="/privacy">How Laree uses your data</Link>
        </div>
        {sync.pending > 0 ? (
          <p className={styles.small}>You can download your data once the changes above have been sent.</p>
        ) : null}
        {deleting ? (
          <div className={styles.form}>
            <p>
              This deletes your account, your training, check-ins and files for good.
              {account.profile.role === 'coach' ? ' Your athletes keep their own data.' : ''} It cannot be undone.
            </p>
            <label className={styles.field}>
              <span>Type DELETE to confirm</span>
              <input type="text" autoComplete="off" value={typed} onChange={(e) => setTyped(e.target.value)} />
            </label>
            <div className={styles.row}>
              <button
                type="button"
                className={`${styles.primary} ${styles.danger}`}
                disabled={busy || typed !== 'DELETE'}
                onClick={() => void remove()}
              >
                Delete my account
              </button>
              <button type="button" className={styles.link} onClick={() => setDeleting(false)}>
                Keep my account
              </button>
            </div>
          </div>
        ) : (
          <button type="button" className={styles.link} onClick={() => setDeleting(true)}>
            Delete my account…
          </button>
        )}
        <p role="status" className={styles.message}>
          {note}
        </p>
      </div>
      {confirming ? (
        <p role="status" className={styles.message}>
          {changes(sync.pending)} {sync.pending === 1 ? 'has' : 'have'} not reached the server yet.{' '}
          {sync.unsaved
            ? `Signing out now loses ${sync.pending === 1 ? 'it' : 'them'}: ${sync.pending === 1 ? 'it' : 'they'} could not be saved on this device.`
            : `Signing out now keeps ${sync.pending === 1 ? 'it' : 'them'} on this device until you sign in again.`}{' '}
          Sign out anyway?
        </p>
      ) : null}
      <button type="button" className={styles.primary} disabled={busy} onClick={() => void leave()}>
        {confirming ? 'Sign out anyway' : 'Sign out'}
      </button>
    </section>
  )
}
