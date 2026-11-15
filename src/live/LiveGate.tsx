/* oxlint-disable jsx-a11y/prefer-tag-over-role -- status region for the loading screen */
import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router'
import { isSelfCoached, useAccount } from './account.ts'
import { useSyncStatus } from './sync/engine.ts'
import { Onboarding } from './Onboarding.tsx'
import { boot, refreshAccount } from './session.ts'
import { SignInPage } from './SignInPage.tsx'
import styles from './live.module.css'

const COACH_PATH = /^\/coach(\/|$)/
const ATHLETE_PATH = /^\/athlete(\/|$)/
/** Demo-only pages, and the role picker, have no place in the live app. */
const DEMO_PATH = /^\/(brand|kit|reset)?(\/|$)/
/** Readable before signing in. */
const PUBLIC_PATH = /^\/privacy(\/|$)/

/**
 * The live app's front door: sign in, onboarding, then the app. It also keeps each account to its
 * own side: a coach to coach pages, a coached athlete to athlete pages. A self-coached athlete
 * plans their own training, so they may open both.
 */
export default function LiveGate({ children }: { children: ReactNode }) {
  const { pathname } = useLocation()
  const status = useAccount((s) => s.status)
  const account = useAccount((s) => s.account)
  const invitations = useAccount((s) => s.invitations)
  const error = useAccount((s) => s.error)
  const [laterInvites, setLaterInvites] = useState(false)

  useEffect(() => boot(), [])

  if (PUBLIC_PATH.test(pathname)) return children
  if (status === 'loading') {
    return (
      <div className={styles.page} role="status">
        <p className={styles.lede}>Opening Laree…</p>
      </div>
    )
  }
  if (status === 'error') {
    return (
      <div className={styles.page}>
        <h1 className={styles.title}>Laree could not open your account</h1>
        <p className={styles.lede}>{error ?? 'Check your connection and try again.'}</p>
        <button type="button" className={styles.primary} onClick={() => void refreshAccount()}>
          Try again
        </button>
      </div>
    )
  }
  if (status === 'signed-out' || !account) return <SignInPage />
  if (!account.profile.onboarded_at || (invitations.length > 0 && !laterInvites)) {
    return <Onboarding account={account} invitations={invitations} onLater={() => setLaterInvites(true)} />
  }

  const coach = account.profile.role === 'coach'
  const landing = coach ? '/coach/overview' : '/athlete/today'
  if (DEMO_PATH.test(pathname) && !COACH_PATH.test(pathname) && !ATHLETE_PATH.test(pathname)) {
    return <Navigate to={landing} replace />
  }
  if (coach && ATHLETE_PATH.test(pathname)) return <Navigate to="/coach/overview" replace />
  if (!coach && !isSelfCoached(account) && COACH_PATH.test(pathname)) return <Navigate to="/athlete/today" replace />
  return (
    <>
      <OfflineNote />
      {children}
    </>
  )
}

/** While changes wait on the device, say so, so nobody wonders whether a log was kept. */
function OfflineNote() {
  const waiting = useSyncStatus((s) => (s.offline ? s.pending : 0))
  return (
    <p role="status" className={styles.offline}>
      {waiting > 0 ? `Saved on this phone. ${waiting === 1 ? 'It sends' : `${waiting} changes send`} when you're online.` : ''}
    </p>
  )
}
