import { useEffect, useRef } from 'react'
import { Link, useLocation } from 'react-router'
import styles from './NotFound.module.css'

export type NotFoundScope = 'athlete' | 'coach' | 'standalone'

const MAIN: Record<NotFoundScope, { to: string; label: string }> = {
  athlete: { to: '/athlete/today', label: 'Go to Today' },
  coach: { to: '/coach/overview', label: 'Go to Overview' },
  standalone: { to: '/', label: 'Back to the role picker' },
}

/** S6, page variant. Shown inside the side's shell when the address is under that side. */
export function NotFound({ scope }: { scope: NotFoundScope }) {
  const { pathname, search } = useLocation()
  const heading = useRef<HTMLHeadingElement>(null)
  // Move focus to the heading on every new address, including a second bad address in a row.
  // oxlint-disable-next-line react/exhaustive-effect-dependencies
  useEffect(() => {
    heading.current?.focus()
  }, [pathname])
  const main = MAIN[scope]
  const others = (Object.keys(MAIN) as NotFoundScope[]).filter((s) => s !== scope)
  return (
    <section className={styles.notFound} data-screen="S6">
      <h1 ref={heading} tabIndex={-1}>
        Off course
      </h1>
      <p>
        There's no page at <code>{`#${pathname}${search}`}</code>.
      </p>
      <nav aria-label="Where to next" className={styles.links}>
        <Link to={main.to} className={styles.primary}>
          {main.label}
        </Link>
        {others.map((s) => (
          <Link key={s} to={MAIN[s].to} className={styles.secondary}>
            {MAIN[s].label}
          </Link>
        ))}
      </nav>
    </section>
  )
}
