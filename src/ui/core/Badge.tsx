import { forwardRef } from 'react'
import type { HTMLAttributes, ReactNode } from 'react'
import { LockGlyph, MedalGlyph } from './glyphs.tsx'
import styles from './Badge.module.css'

export interface BadgeProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  /** Name of the achievement, for example "First 10 km". */
  label: string
  earned: boolean
  /** Glyph drawn inside the medal. Defaults to a medal. Ignored while locked. */
  glyph?: ReactNode
  /** Show the label under the medal. */
  showLabel?: boolean
}

/** Achievement badge: earned = sun medal with finish-tape ribbon; locked = dashed, muted, lock glyph. */
export const Badge = forwardRef<HTMLDivElement, BadgeProps>(function Badge(
  { label, earned, glyph, showLabel = true, className, ...rest },
  ref,
) {
  const state = earned ? 'earned' : 'locked'
  return (
    <div {...rest} ref={ref} className={[styles.badge, className].filter(Boolean).join(' ')} data-state={state}>
      <div className={styles.medal}>
        <span className="sr-only">{`${label}, ${state}`}</span>
        {earned ? <span className={styles.ribbon} aria-hidden="true" /> : null}
        <span className={styles.disc}>{earned ? (glyph ?? <MedalGlyph size={28} />) : <LockGlyph size={24} />}</span>
      </div>
      {showLabel ? (
        <span className={styles.caption} aria-hidden="true">
          {label}
          <span className={styles.state}>{earned ? 'Earned' : 'Locked'}</span>
        </span>
      ) : null}
    </div>
  )
})

export interface CountBadgeProps extends Omit<HTMLAttributes<HTMLSpanElement>, 'children'> {
  count: number
  /** Accessible name, for example "unread messages". The count is read first. */
  label: string
}

/** Small track-fill count with an ink numeral. */
export const CountBadge = forwardRef<HTMLSpanElement, CountBadgeProps>(function CountBadge(
  { count, label, className, ...rest },
  ref,
) {
  return (
    <span {...rest} ref={ref} className={[styles.count, className].filter(Boolean).join(' ')}>
      <span aria-hidden="true">{count > 99 ? '99+' : count}</span>
      <span className="sr-only">{`${count} ${label}`}</span>
    </span>
  )
})
