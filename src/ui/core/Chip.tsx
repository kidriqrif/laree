import { forwardRef } from 'react'
import type { HTMLAttributes, ReactNode } from 'react'
import { SPORT_LABEL, SportGlyph, STATUS_LABEL, StatusGlyph } from './glyphs.tsx'
import type { SportKey, StatusKey } from './glyphs.tsx'
import styles from './Chip.module.css'

export interface ChipProps extends HTMLAttributes<HTMLSpanElement> {
  /** Optional leading glyph (decorative). */
  glyph?: ReactNode
}

/** Neutral chip: a hairline pill with an optional glyph. */
export const Chip = forwardRef<HTMLSpanElement, ChipProps>(function Chip({ glyph, className, children, ...rest }, ref) {
  return (
    <span {...rest} ref={ref} className={[styles.chip, className].filter(Boolean).join(' ')} data-tone="neutral">
      {glyph ? <span className={styles.glyph}>{glyph}</span> : null}
      <span>{children}</span>
    </span>
  )
})

export interface StatusChipProps extends Omit<HTMLAttributes<HTMLSpanElement>, 'children'> {
  status: StatusKey
  /** Overrides the default label ("On plan", "Partial", "Over", "Missed", "Unplanned"). */
  label?: string
}

const STATUS_CLASS: Record<StatusKey, string | undefined> = {
  'on-plan': styles.sOnPlan,
  partial: styles.sPartial,
  over: styles.sOver,
  missed: styles.sMissed,
  unplanned: styles.sUnplanned,
}

/** Compliance chip: always a glyph plus a word, never brand red. */
export const StatusChip = forwardRef<HTMLSpanElement, StatusChipProps>(function StatusChip(
  { status, label, className, ...rest },
  ref,
) {
  return (
    <span
      {...rest}
      ref={ref}
      className={[styles.chip, styles.status, STATUS_CLASS[status], className].filter(Boolean).join(' ')}
      data-tone="status"
      data-status={status}
    >
      <span className={styles.glyph}>
        <StatusGlyph status={status} />
      </span>
      <span>{label ?? STATUS_LABEL[status]}</span>
    </span>
  )
})

export interface SportChipProps extends Omit<HTMLAttributes<HTMLSpanElement>, 'children'> {
  sport: SportKey
  label?: string
}

/** Sport chip: sport colour on the glyph only; the label stays in text colour. */
export const SportChip = forwardRef<HTMLSpanElement, SportChipProps>(function SportChip(
  { sport, label, className, ...rest },
  ref,
) {
  return (
    <span
      {...rest}
      ref={ref}
      className={[styles.chip, className].filter(Boolean).join(' ')}
      data-tone="sport"
      data-sport={sport}
    >
      <span className={styles.glyph} style={{ color: `var(--sport-${sport})` }}>
        <SportGlyph sport={sport} size={16} />
      </span>
      <span>{label ?? SPORT_LABEL[sport]}</span>
    </span>
  )
})
