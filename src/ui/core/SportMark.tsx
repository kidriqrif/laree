import { forwardRef } from 'react'
import type { HTMLAttributes } from 'react'
import { SPORT_LABEL, SportGlyph } from './glyphs.tsx'
import type { SportKey } from './glyphs.tsx'
import styles from './SportMark.module.css'

export interface SportMarkProps extends Omit<HTMLAttributes<HTMLSpanElement>, 'children'> {
  sport: SportKey
  /** Show the sport name beside the glyph. Without it the mark is still named for screen readers. */
  showLabel?: boolean
  /** Glyph size in px. */
  size?: number
}

/** Sport glyph in the sport colour. The glyph shape is the cue, so colour is never alone. */
export const SportMark = forwardRef<HTMLSpanElement, SportMarkProps>(function SportMark(
  { sport, showLabel = false, size = 20, className, ...rest },
  ref,
) {
  const label = SPORT_LABEL[sport]
  return (
    <span
      {...rest}
      ref={ref}
      className={[styles.mark, className].filter(Boolean).join(' ')}
      data-sport={sport}
      role={showLabel ? undefined : 'img'}
      aria-label={showLabel ? undefined : label}
    >
      <span className={styles.glyph} style={{ color: `var(--sport-${sport})` }}>
        <SportGlyph sport={sport} size={size} />
      </span>
      {showLabel ? <span className={styles.label}>{label}</span> : null}
    </span>
  )
})
