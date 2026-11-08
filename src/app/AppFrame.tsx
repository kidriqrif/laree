/* oxlint-disable jsx-a11y/prefer-tag-over-role, react/set-state-in-effect -- status region; the toast reports the viewer syncing to the router location */
import { useEffect, useState } from 'react'
import { Link, Outlet, useLocation, useMatches } from 'react-router'
import { Logo } from '../ui/brand/Logo.tsx'
import { personName } from './people.ts'
import { RoleSwitcher } from './RoleSwitcher.tsx'
import { StorageBanner } from './StorageBanner.tsx'
import { UpdateToast } from './pwa/UpdateToast.tsx'
import { setLastCoachRoute, useViewer } from './viewer.ts'
import styles from './AppFrame.module.css'

export interface RouteHandle {
  title?: string
}

/** The title of the deepest matched route, from its `handle`. */
export function useRouteTitle(): string | undefined {
  const matches = useMatches()
  for (let i = matches.length - 1; i >= 0; i--) {
    const handle = matches[i]?.handle as RouteHandle | undefined
    if (handle?.title) return handle.title
  }
  return undefined
}

const COACH_PATH = /^\/coach(\/|$)/
const ATHLETE_PATH = /^\/athlete(\/|$)/

/** Root of every route: the switcher bar, the toast region, the two slots, then the frame or shell. */
export function AppFrame() {
  const { pathname, search } = useLocation()
  const title = useRouteTitle()
  const [toast, setToast] = useState('')

  useEffect(() => {
    document.title = title ? `${title} · Laree` : 'Laree'
  }, [title])

  // Role follows route (IA section 9.5): the address decides, the switcher catches up, a toast says so.
  useEffect(() => {
    const v = useViewer.getState()
    if (COACH_PATH.test(pathname)) {
      if (pathname !== '/coach') setLastCoachRoute(`${pathname}${search}`)
      if (v.role !== 'coach') {
        v.viewAs('coach')
        setToast('Viewing as Coach, because this is a coach page.')
      }
    } else if (ATHLETE_PATH.test(pathname) && v.role === 'coach') {
      v.viewAs(v.athleteId)
      setToast(`Viewing as ${personName(v.athleteId)}, because this is an athlete page.`)
    }
  }, [pathname, search])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(''), 4000)
    return () => clearTimeout(t)
  }, [toast])

  return (
    <div className={styles.frame}>
      <button
        type="button"
        className={styles.skip}
        onClick={() => document.getElementById('main')?.focus()}
      >
        Skip to content
      </button>
      <RoleSwitcher />
      <StorageBanner />
      <div className={styles.body}>
        <Outlet />
      </div>
      <UpdateToast />
      <div role="status" className={styles.toastRegion}>
        {toast ? <p className={styles.toast}>{toast}</p> : null}
      </div>
    </div>
  )
}

/** Standalone frame (IA 4.6): the Laree mark linking to the role picker, then the content. */
export function StandaloneFrame() {
  const { pathname } = useLocation()
  return (
    <div className={styles.standalone}>
      {pathname === '/' ? null : (
        <header className={styles.standaloneHeader}>
          <Link to="/" aria-label="Laree, role picker">
            <Logo size={28} />
          </Link>
        </header>
      )}
      <main id="main" tabIndex={-1} className={styles.standaloneMain}>
        <Outlet />
      </main>
    </div>
  )
}
