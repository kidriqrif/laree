import { Link, Outlet, useLocation } from 'react-router'
import { Logo } from '../ui/brand/Logo.tsx'
import styles from './AppFrame.module.css'

/**
 * Standalone frame (IA 4.6): the Laree mark linking to the role picker, then the content.
 * It is its own chunk, with the logo code, so an athlete who opens Today never loads it.
 */
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
