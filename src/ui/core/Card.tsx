import { forwardRef } from 'react'
import type { HTMLAttributes } from 'react'
import styles from './Card.module.css'

export interface CardProps extends HTMLAttributes<HTMLElement> {
  /** Element to render. Use `section` or `article` when the card has its own heading. */
  as?: 'div' | 'section' | 'article' | 'li'
  /** Remove the inner padding, for cards that hold a table or list. */
  flush?: boolean
}

/** Surface card: soft panel for athletes, hairline box for coaches. No shadow. */
export const Card = forwardRef<HTMLElement, CardProps>(function Card(
  { as: Tag = 'div', flush = false, className, ...rest },
  ref,
) {
  return (
    <Tag
      {...rest}
      ref={ref as never}
      className={[styles.card, flush ? styles.flush : '', className].filter(Boolean).join(' ')}
    />
  )
})
