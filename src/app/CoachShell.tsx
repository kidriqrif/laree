/* oxlint-disable jsx-a11y/no-redundant-roles -- role="list" keeps list semantics in Safari when list-style is none */
import { useEffect, useState, type ReactNode } from 'react'
import { Link, Outlet, useLocation, useParams } from 'react-router'
import { Logo } from '../ui/brand/Logo.tsx'
import {
  AnalyticsIcon,
  CalendarIcon,
  CheckInsIcon,
  LibraryIcon,
  MenuIcon,
  OverviewIcon,
  SeasonIcon,
  SettingsIcon,
} from '../ui/icons/index.ts'
import { useRouteTitle } from './AppFrame.tsx'
import { ATHLETES, isAthleteId } from './people.ts'
import { useViewer } from './viewer.ts'
import styles from './CoachShell.module.css'

interface RailItem {
  to: string
  label: string
  icon: ReactNode
  hint?: string
}

const TOP: RailItem[] = [{ to: '/coach/overview', label: 'Overview', icon: <OverviewIcon size={20} />, hint: 'g o' }]
const BOTTOM: RailItem[] = [
  { to: '/coach/calendar', label: 'Calendar', icon: <CalendarIcon size={20} />, hint: 'g c' },
  { to: '/coach/season', label: 'Season', icon: <SeasonIcon size={20} />, hint: 'g s' },
  { to: '/coach/library', label: 'Library', icon: <LibraryIcon size={20} />, hint: 'g l' },
  { to: '/coach/analytics', label: 'Analytics', icon: <AnalyticsIcon size={20} />, hint: 'g a' },
  { to: '/coach/check-ins', label: 'Check-ins', icon: <CheckInsIcon size={20} />, hint: 'g i' },
  { to: '/coach/settings', label: 'Settings', icon: <SettingsIcon size={20} /> },
]

/** Coach shell, "results sheet" register: left rail from 1024 px, top bar with a Sections menu below. */
export default function CoachShell() {
  const { pathname } = useLocation()
  const { athleteId } = useParams()
  const setCoachAthlete = useViewer((s) => s.setCoachAthlete)
  const section = useRouteTitle()
  // The Sections menu is open for one pathname only, so it closes when the coach moves on.
  const [openFor, setOpenFor] = useState<string | null>(null)
  const open = openFor === pathname
  const setOpen = (fn: (o: boolean) => boolean) => setOpenFor(fn(open) ? pathname : null)

  // Any coach screen that names an athlete updates the "last athlete viewed".
  useEffect(() => {
    if (isAthleteId(athleteId)) setCoachAthlete(athleteId)
  }, [athleteId, setCoachAthlete])

  const isOn = (to: string) => pathname === to || pathname.startsWith(`${to}/`)

  const link = (item: RailItem) => (
    <li key={item.to}>
      <Link to={item.to} className={styles.item} aria-current={isOn(item.to) ? 'page' : undefined}>
        <span className={styles.glyph}>{item.icon}</span>
        <span className={styles.itemLabel}>{item.label}</span>
        {item.hint ? (
          <kbd className={styles.hint} aria-hidden="true">
            {item.hint}
          </kbd>
        ) : null}
      </Link>
    </li>
  )

  return (
    <div className={styles.shell} data-register="coach">
      <header className={styles.topBar}>
        <Link to="/" aria-label="Laree, role picker" className={styles.mark}>
          <Logo variant="mark" size={28} />
        </Link>
        <p className={styles.section}>{section ?? 'Laree'}</p>
        <button
          type="button"
          className={styles.sectionsButton}
          aria-expanded={open}
          aria-controls="coach-rail"
          onClick={() => setOpen((o) => !o)}
        >
          <MenuIcon size={20} />
          <span>Sections</span>
        </button>
      </header>
      <nav id="coach-rail" className={styles.rail} data-open={open} aria-label="Coach sections">
        <Link to="/" aria-label="Laree, role picker" className={styles.railLogo}>
          <Logo size={28} />
        </Link>
        <ul role="list" className={styles.list}>
          {TOP.map(link)}
          <li>
            <p className={styles.group} data-label>
              Athletes
            </p>
            <ul role="list" className={styles.list}>
              {ATHLETES.map((a, i) =>
                link({
                  to: `/coach/athlete/${a.id}`,
                  label: a.name,
                  icon: <span className={styles.initial}>{a.name.slice(0, 1)}</span>,
                  hint: `g ${i + 1}`,
                }),
              )}
            </ul>
          </li>
          {BOTTOM.map(link)}
        </ul>
      </nav>
      <div className={styles.content}>
        <p className={styles.readOnly} role="note">
          Planning and editing need a screen at least 1024 px wide. Everything here is read-only.
        </p>
        <main id="main" tabIndex={-1} className={styles.main}>
          <Outlet />
        </main>
      </div>
    </div>
  )
}
