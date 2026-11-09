import { forwardRef } from 'react'
import type { HTMLAttributes, ReactNode } from 'react'
import styles from './EmptyState.module.css'

export interface EmptyStateProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  /** What is missing, in a few plain words. Never "Oops". */
  title: ReactNode
  /** One sentence saying what to do or why it is empty. */
  description?: ReactNode
  /** At most one action, usually a primary Button. */
  action?: ReactNode
  /** Coach register: a keyboard hint beside the action, for example "Press N". */
  hint?: ReactNode
  /** Heading level for the title. */
  headingLevel?: 2 | 3 | 4
  /** Show the small track-lane drawing (athlete register only; hidden for coaches). */
  illustration?: boolean
}

function Lanes() {
  return (
    <svg className={styles.lanes} viewBox="0 0 120 48" width="120" height="48" aria-hidden="true" focusable="false">
      {[8, 18, 28, 38].map((y) => (
        <line key={y} x1="4" y1={y} x2="116" y2={y} stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      ))}
      <line x1="20" y1="4" x2="20" y2="42" stroke="currentColor" strokeWidth="2" strokeDasharray="2 4" />
    </svg>
  )
}

/** Empty state: lane drawing (athlete), title, one sentence and one optional action. */
export const EmptyState = forwardRef<HTMLDivElement, EmptyStateProps>(function EmptyState(
  { title, description, action, hint, headingLevel = 3, illustration = true, className, ...rest },
  ref,
) {
  const Heading = `h${headingLevel}` as 'h2' | 'h3' | 'h4'
  return (
    <div {...rest} ref={ref} className={[styles.empty, className].filter(Boolean).join(' ')}>
      {illustration ? <Lanes /> : null}
      <Heading className={styles.title}>{title}</Heading>
      {description ? <p className={styles.description}>{description}</p> : null}
      {action || hint ? (
        <div className={styles.actions}>
          {action}
          {hint ? <span className={styles.hint}>{hint}</span> : null}
        </div>
      ) : null}
    </div>
  )
})
