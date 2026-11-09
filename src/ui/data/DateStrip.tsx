import { forwardRef, useRef } from 'react'
import type { HTMLAttributes, KeyboardEvent, ReactNode } from 'react'
import { dayToDate, today as todayFn, weekRange } from '../../domain/time.ts'
import styles from './DateStrip.module.css'

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const
const WEEKDAYS_LONG = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const

export interface DateStripProps extends Omit<HTMLAttributes<HTMLDivElement>, 'onChange' | 'children'> {
  /** Week number (1-based, Monday first). */
  week: number
  /** Selected day offset. */
  value: number
  onChange: (day: number) => void
  /** Day treated as today; defaults to the clock. */
  today?: number
  /** Small mark under a day, for example a session dot. Keyed by day offset. */
  marks?: Record<number, ReactNode>
  /** Plain-text description of a day's mark for screen readers. */
  markLabels?: Record<number, string>
}

/** One week of days, Monday first. A single tab stop; arrow keys move and select. */
export const DateStrip = forwardRef<HTMLDivElement, DateStripProps>(function DateStrip(
  { week, value, onChange, today, marks, markLabels, className, 'aria-label': ariaLabel = 'Days of the week', ...rest },
  ref,
) {
  const { firstDay } = weekRange(week)
  const todayDay = today ?? todayFn()
  const days = Array.from({ length: 7 }, (_, i) => firstDay + i)
  const inWeek = value >= firstDay && value <= firstDay + 6
  const tabDay = inWeek ? value : days.includes(todayDay) ? todayDay : firstDay
  const refs = useRef<Map<number, HTMLButtonElement>>(new Map())

  const go = (day: number) => {
    onChange(day)
    refs.current.get(day)?.focus()
  }

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = tabDay - firstDay
    let next: number | null = null
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = Math.min(6, i + 1)
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = Math.max(0, i - 1)
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = 6
    if (next === null) return
    e.preventDefault()
    go(firstDay + next)
  }

  return (
    // oxlint-disable-next-line jsx-a11y/interactive-supports-focus
    <div
      {...rest}
      ref={ref}
      role="radiogroup"
      aria-label={ariaLabel}
      onKeyDown={onKeyDown}
      className={[styles.strip, className].filter(Boolean).join(' ')}
    >
      {days.map((day, i) => {
        const d = dayToDate(day)
        const selected = day === value
        const isToday = day === todayDay
        const mark = markLabels?.[day]
        const label = `${WEEKDAYS_LONG[i]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}${isToday ? ', today' : ''}${mark ? `, ${mark}` : ''}`
        return (
          <button
            key={day}
            type="button"
            // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role
            role="radio"
            aria-checked={selected}
            aria-label={label}
            tabIndex={day === tabDay ? 0 : -1}
            data-selected={selected || undefined}
            data-today={isToday || undefined}
            className={styles.day}
            ref={(el) => {
              if (el) refs.current.set(day, el)
              else refs.current.delete(day)
            }}
            onClick={() => onChange(day)}
          >
            <span className={styles.weekday} aria-hidden="true">{WEEKDAYS[i]}</span>
            <span className={styles.date} aria-hidden="true">{d.getUTCDate()}</span>
            <span className={styles.mark} aria-hidden="true">
              {marks?.[day] ?? (isToday ? <span className={styles.todayDot} /> : null)}
            </span>
          </button>
        )
      })}
    </div>
  )
})
