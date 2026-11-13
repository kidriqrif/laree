/* oxlint-disable jsx-a11y/prefer-tag-over-role, react/set-state-in-effect -- status region; the toast reports the viewer syncing to the router location */
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Outlet, useLocation, useMatches, useNavigationType } from 'react-router'
import { writeRouteTitle } from './pageTitle.ts'
import { personName } from './people.ts'
import { RoleSwitcher } from './RoleSwitcher.tsx'
import { StorageBanner } from './StorageBanner.tsx'
import { ThemeSync } from './ThemeSync.tsx'
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
  const [arrived, setArrived] = useState('')
  const lastPath = useRef(pathname)
  const scrolledPath = useRef(pathname)
  const navigationType = useNavigationType()

  // A layout effect, so a page's usePageTitle (a passive effect) can name itself after this.
  useLayoutEffect(() => {
    writeRouteTitle(title)
  }, [title])

  // A new page opens at the top, not at the last page's scroll position. Back and Forward keep the
  // browser's own restore, and a change to the search only (a sheet opening) leaves the page where it is.
  useLayoutEffect(() => {
    if (pathname === scrolledPath.current) return
    scrolledPath.current = pathname
    if (navigationType !== 'POP') window.scrollTo(0, 0)
  }, [pathname, navigationType])

  // A new page (not a search-only change) is announced by its title; focus stays where the page puts it.
  useEffect(() => {
    if (pathname === lastPath.current) return
    lastPath.current = pathname
    setArrived(document.title)
  }, [pathname])

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
      <ThemeSync />
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
      <p aria-live="polite" className="sr-only">
        {arrived}
      </p>
    </div>
  )
}
