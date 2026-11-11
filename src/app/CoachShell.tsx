/* oxlint-disable jsx-a11y/no-redundant-roles -- role="list" keeps list semantics in Safari when list-style is none */
import { useEffect, useState, type ReactNode } from 'react'
import { Link, Outlet, useLocation, useParams } from 'react-router'
import { selectHasCheckedIn, selectOpenFlagCount, currentDay } from '../data/selectors.ts'
import { useLaree } from '../data/store.ts'
import type { AthleteId } from '../domain/types.ts'
import { Logo } from '../ui/brand/Logo.tsx'
import {
  AnalyticsIcon,
  CalendarIcon,
  CheckInsIcon,
  IconFlag,
  IconKeyboard,
  IconSearch,
  LibraryIcon,
  MenuIcon,
  OverviewIcon,
  SeasonIcon,
  SettingsIcon,
} from '../ui/icons/index.ts'
import { useRouteTitle } from './AppFrame.tsx'
import { CoachKeyboard, describeKeys, useKeyboardDialogs } from './keyboard/index.ts'
import { ATHLETES, isAthleteId } from './people.ts'
import { Toasts } from './Toasts.tsx'
import { useViewer } from './viewer.ts'
import styles from './CoachShell.module.css'

interface RailItem {
  to: string
  label: string
  icon: ReactNode
  hint?: string
}

const TOP: RailItem[] = [{ to: '/coach/overview', label: 'Overview', icon: <OverviewIcon size={24} />, hint: 'g o' }]
const BOTTOM: RailItem[] = [
  { to: '/coach/calendar', label: 'Calendar', icon: <CalendarIcon size={24} />, hint: 'g c' },
  { to: '/coach/season', label: 'Season', icon: <SeasonIcon size={24} />, hint: 'g s' },
  { to: '/coach/library', label: 'Library', icon: <LibraryIcon size={24} />, hint: 'g l' },
  { to: '/coach/analytics', label: 'Analytics', icon: <AnalyticsIcon size={24} />, hint: 'g a' },
  { to: '/coach/check-ins', label: 'Check-ins', icon: <CheckInsIcon size={24} />, hint: 'g i' },
  { to: '/coach/settings', label: 'Settings', icon: <SettingsIcon size={24} /> },
]

/** Coach shell, "results sheet" register: left rail from 1024 px, top bar with a Sections menu below. */
export default function CoachShell() {
  // Settings can turn single-key shortcuts off (WCAG 2.1.4). Ctrl shortcuts stay on.
  const singleKeys = useLaree((s) => s.data.settings.coach?.singleKeyShortcuts !== false)
  return (
    <CoachKeyboard singleKeys={singleKeys}>
      <Shell />
    </CoachKeyboard>
  )
}

/** The glyphs beside an athlete in the rail: a flag when one is open, a hollow dot with no check-in today. */
function AthleteMarks({ id }: { id: AthleteId }) {
  const flags = useLaree((s) => selectOpenFlagCount(s.data, id))
  const checkedIn = useLaree((s) => selectHasCheckedIn(s.data, id, currentDay()))
  if (flags === 0 && checkedIn) return null
  return (
    <span className={styles.marks}>
      {flags > 0 ? (
        <span className={styles.flag}>
          <IconFlag size={16} aria-hidden="true" />
          <span className={styles.srOnly}>{flags === 1 ? 'Open flag' : `${flags} open flags`}</span>
        </span>
      ) : null}
      {checkedIn ? null : (
        <span className={styles.dot}>
          <span className={styles.srOnly}>No check-in today</span>
        </span>
      )}
    </span>
  )
}

function Shell() {
  const { openJumpTo, openHelp } = useKeyboardDialogs()
  const openFlags = useLaree((s) => selectOpenFlagCount(s.data))
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

  const link = (item: RailItem, extra?: ReactNode) => (
    <li key={item.to}>
      <Link to={item.to} className={styles.item} aria-current={isOn(item.to) ? 'page' : undefined}>
        <span className={styles.glyph}>{item.icon}</span>
        <span className={styles.itemLabel}>{item.label}</span>
        {extra}
        {item.hint ? (
          <kbd className={styles.hint} aria-hidden="true">
            {item.hint}
          </kbd>
        ) : null}
      </Link>
    </li>
  )

  return (
    <>
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
          <button type="button" className={styles.jump} onClick={openJumpTo}>
            <IconSearch size={24} />
            <span className={styles.itemLabel}>Jump to</span>
            <kbd className={styles.hint} aria-hidden="true">
              {describeKeys('/')}
            </kbd>
          </button>
          <ul role="list" className={styles.list}>
            {TOP.map((i) => link(i))}
            <li>
              <p className={styles.group} data-label>
                Athletes
              </p>
              <ul role="list" className={styles.list}>
                {ATHLETES.map((a, i) =>
                  link(
                    {
                      to: `/coach/athlete/${a.id}`,
                      label: a.name,
                      icon: <span className={styles.initial}>{a.name.slice(0, 1)}</span>,
                      hint: `g ${i + 1}`,
                    },
                    <AthleteMarks id={a.id} />,
                  ),
                )}
              </ul>
            </li>
            {BOTTOM.map((i) =>
              i.to === '/coach/check-ins'
                ? link(
                    i,
                    openFlags > 0 ? (
                      <span className={styles.count}>
                        {openFlags}
                        <span className={styles.srOnly}> open {openFlags === 1 ? 'flag' : 'flags'}</span>
                      </span>
                    ) : null,
                  )
                : link(i),
            )}
          </ul>
          <div className={styles.footer}>
            <button type="button" className={styles.footerButton} onClick={openHelp}>
              <span className={styles.glyph}>
                <IconKeyboard size={24} />
              </span>
              <span className={styles.itemLabel}>Keyboard</span>
              <kbd className={styles.hint} aria-hidden="true">
                {describeKeys('?')}
              </kbd>
            </button>
          </div>
        </nav>
        <div className={styles.content}>
          <p className={styles.readOnly} role="note">
            Planning and editing need a screen at least 1024 px wide. Everything here is read-only.
          </p>
          <main id="main" tabIndex={-1} className={styles.main}>
            <Outlet />
          </main>
        </div>
        <Toasts register="coach" />
      </div>
    </>
  )
}
