/* oxlint-disable jsx-a11y/no-redundant-roles -- role="list" keeps list semantics in Safari when list-style is none */
import type { ReactNode } from 'react'
import { Link, Outlet, useLocation, useNavigate } from 'react-router'
import { MeIcon, PlusIcon, ProgressIcon, TodayIcon, WeekIcon } from '../ui/icons/index.ts'
import { Toasts } from './Toasts.tsx'
import styles from './AthleteShell.module.css'

const DETAIL = /^\/athlete\/(workout|activity)\//

/** Athlete shell, "race day" register: a centred column and the bottom bar (DESIGN.md section 4). */
export function AthleteShell() {
  const { pathname, key } = useLocation()
  const navigate = useNavigate()
  const isDetail = DETAIL.test(pathname)
  // The tab that opened a detail page stays highlighted; on a cold deep link that is Week.
  const on = (section: string) => pathname === `/athlete/${section}` || pathname.startsWith(`/athlete/${section}/`)
  const weekActive = on('week') || isDetail

  return (
    <div className={styles.shell} data-register="athlete">
      <div className={styles.column}>
        {isDetail ? (
          <button
            type="button"
            className={styles.back}
            // A cold deep link has no history inside the app, so Back goes to Week.
            onClick={() => (key === 'default' ? void navigate('/athlete/week', { replace: true }) : void navigate(-1))}
          >
            <span aria-hidden="true">←</span> Back
          </button>
        ) : null}
        <main id="main" tabIndex={-1} className={styles.main}>
          <Outlet />
        </main>
      </div>
      <nav className={styles.bar} data-bar aria-label="Athlete">
        <ul className={styles.items} role="list">
          <li>
            <Item to="/athlete/today" label="Today" icon={<TodayIcon />} active={on('today')} />
          </li>
          <li>
            <Item to="/athlete/week" label="Week" icon={<WeekIcon />} active={weekActive} />
          </li>
          <li className={styles.logSlot}>
            <Link to="/athlete/today?sheet=log" className={styles.log}>
              <span className={styles.disc}>
                <PlusIcon size={28} />
              </span>
              <span className={styles.logLabel}>Log</span>
            </Link>
          </li>
          <li>
            <Item to="/athlete/progress" label="Progress" icon={<ProgressIcon />} active={on('progress')} />
          </li>
          <li>
            <Item to="/athlete/me" label="Me" icon={<MeIcon />} active={on('me')} />
          </li>
        </ul>
      </nav>
      <Toasts register="athlete" />
    </div>
  )
}

function Item({ to, label, icon, active }: { to: string; label: string; icon: ReactNode; active: boolean }) {
  return (
    <Link to={to} className={`${styles.item} ${active ? styles.current : ''}`} aria-current={active ? 'page' : undefined}>
      <span className={styles.glyph}>{icon}</span>
      <span className={styles.label}>{label}</span>
    </Link>
  )
}
