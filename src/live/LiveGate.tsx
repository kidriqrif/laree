/* oxlint-disable jsx-a11y/prefer-tag-over-role -- status regions for the loading screen and the offline note */
import { lazy, Suspense, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router'
import { isSelfCoached, openFromCache, useAccount } from './account.ts'
import { useSyncStatus } from './sync/syncStatus.ts'
import styles from './live.module.css'

// The Supabase client lives in session.ts and the screens below. None of them is on the path to
// the first paint of a signed-in device: that opens from the copy kept on the device.
const SignInPage = lazy(() => import('./SignInPage.tsx').then((m) => ({ default: m.SignInPage })))
const Onboarding = lazy(() => import('./Onboarding.tsx').then((m) => ({ default: m.Onboarding })))
const session = () => import('./session.ts')

const COACH_PATH = /^\/coach(\/|$)/
const ATHLETE_PATH = /^\/athlete(\/|$)/
/** The role picker and the demo-only pages have no place in the live app. */
const DEMO_PATH = /^\/(brand|kit|reset)?(\/|$)/
/** Readable before signing in. */
const PUBLIC_PATH = /^\/privacy(\/|$)/

// This module loads only in the live app, once. Open on the device's copy before the first draw.
openFromCache()

function Loading() {
  return (
    <div className={styles.page} role="status">
      <p className={styles.lede}>Opening Laree…</p>
    </div>
  )
}

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

  useEffect(() => {
    void session().then((m) => m.boot())
  }, [])

  if (PUBLIC_PATH.test(pathname)) return children
  if (status === 'loading') return <Loading />
  if (status === 'error') {
    return (
      <div className={styles.page}>
        <h1 className={styles.title}>Laree could not open your account</h1>
        <p className={styles.lede}>{error ?? 'Check your connection and try again.'}</p>
        <button type="button" className={styles.primary} onClick={() => void session().then((m) => m.refreshAccount())}>
          Try again
        </button>
      </div>
    )
  }
  if (status === 'signed-out' || !account) {
    return (
      <Suspense fallback={<Loading />}>
        <SignInPage />
      </Suspense>
    )
  }
  if (!account.profile.onboarded_at || (invitations.length > 0 && !laterInvites)) {
    return (
      <Suspense fallback={<Loading />}>
        <Onboarding account={account} invitations={invitations} onLater={() => setLaterInvites(true)} />
      </Suspense>
    )
  }

  const coach = account.profile.role === 'coach'
  if (DEMO_PATH.test(pathname)) return <Navigate to={coach ? '/coach/overview' : '/athlete/today'} replace />
  if (coach && ATHLETE_PATH.test(pathname)) return <Navigate to="/coach/overview" replace />
  if (!coach && !isSelfCoached(account) && COACH_PATH.test(pathname)) return <Navigate to="/athlete/today" replace />
  return (
    <>
      <SyncNote />
      {children}
    </>
  )
}

/** While changes wait on the device, say so, and say it straight when they could not even be kept. */
function SyncNote() {
  const waiting = useSyncStatus((s) => (s.offline ? s.pending : 0))
  const unsaved = useSyncStatus((s) => s.unsaved)
  const text = unsaved
    ? 'Changes could not be saved on this device. Keep Laree open until they are sent.'
    : waiting > 0
      ? `Saved on this phone. ${waiting === 1 ? 'It sends' : `${waiting} changes send`} when you're online.`
      : ''
  return (
    <p role="status" className={styles.offline}>
      {text}
    </p>
  )
}
