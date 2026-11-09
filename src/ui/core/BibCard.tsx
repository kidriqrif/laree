import { forwardRef } from 'react'
import type { HTMLAttributes, ReactNode } from 'react'
import styles from './BibCard.module.css'

export interface BibCardProps extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  /** The big figure: a bib number or a time, for example "42" or "1:45:00". */
  figure: ReactNode
  /** Short line under the figure, for example "Tempo run". */
  caption: ReactNode
  /** Sport mark shown top centre (a SportMark is a good fit). */
  mark?: ReactNode
  /** Tear-off stub below the dashed line: date, duration. */
  stub?: ReactNode
  as?: 'div' | 'article' | 'section' | 'li'
}

/**
 * Race-bib card (athlete register): paper card, inner rule, two pin holes, tear line above the stub.
 * In the coach register it falls back to a plain hairline box.
 */
export const BibCard = forwardRef<HTMLElement, BibCardProps>(function BibCard(
  { figure, caption, mark, stub, as: Tag = 'article', className, ...rest },
  ref,
) {
  return (
    <Tag {...rest} ref={ref as never} className={[styles.bib, className].filter(Boolean).join(' ')}>
      <span className={`${styles.pin} ${styles.pinLeft}`} aria-hidden="true" />
      <span className={`${styles.pin} ${styles.pinRight}`} aria-hidden="true" />
      <div className={styles.body}>
        {mark ? <div className={styles.mark}>{mark}</div> : null}
        <div className={styles.figure} data-numeric="display">
          {figure}
        </div>
        <div className={styles.caption}>{caption}</div>
      </div>
      {stub ? <div className={styles.stub}>{stub}</div> : null}
    </Tag>
  )
})
