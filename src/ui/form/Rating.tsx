import { forwardRef } from 'react'
import { Radio, RadioGroup } from 'react-aria-components/RadioGroup'
import type { RadioGroupProps } from 'react-aria-components/RadioGroup'
import { VisuallyHidden } from 'react-aria-components/VisuallyHidden'
import { cx, FieldFooter, FieldLabel, fieldClass } from './Field.tsx'
import type { FieldProps } from './Field.tsx'
import styles from './Choice.module.css'

export interface RatingProps
  extends Omit<RadioGroupProps, 'className' | 'children' | 'isInvalid' | 'value' | 'defaultValue' | 'onChange' | 'orientation'>,
    FieldProps {
  /** 5 for check-in questions, 10 for session effort. */
  max?: 5 | 10
  /** 1 to max, or null for no answer. */
  value?: number | null
  defaultValue?: number | null
  onChange?: (value: number) => void
  /** Spoken names for each value, lowest first, e.g. ["Very easy", ..., "Maximal"]. Also shown under the ends. */
  valueNames?: ReadonlyArray<string>
  /** Show the first and last value names under the row. */
  showEnds?: boolean
}

const asString = (v: number | null | undefined) => (v === undefined ? undefined : v === null ? '' : String(v))


/** A radio group of numbered buttons. Each value is named for screen readers: "7 of 10, Hard". */
export const Rating = forwardRef<HTMLDivElement, RatingProps>(function Rating(
  { label, hint, error, className, max = 5, value, defaultValue, onChange, valueNames, showEnds, ...rest },
  ref,
) {
  const values = Array.from({ length: max }, (_, i) => i + 1)
  const controlled: { value?: string; defaultValue?: string } = {}
  const v = asString(value)
  const d = asString(defaultValue)
  if (v !== undefined) controlled.value = v
  if (d !== undefined) controlled.defaultValue = d
  const nameOf = (n: number) => {
    const named = valueNames?.[n - 1]
    return named ? `${n} of ${max}, ${named}` : `${n} of ${max}`
  }
  return (
    <RadioGroup
      {...rest}
      {...controlled}
      ref={ref}
      orientation="horizontal"
      onChange={(s) => onChange?.(Number(s))}
      isInvalid={error ? true : undefined}
      className={cx(fieldClass, className)}
    >
      <FieldLabel>{label}</FieldLabel>
      <div className={styles.rates}>
        {values.map((n) => (
          <Radio key={n} value={String(n)} className={styles.rate}>
            <span aria-hidden="true">{n}</span>
            <VisuallyHidden>{nameOf(n)}</VisuallyHidden>
          </Radio>
        ))}
      </div>
      {showEnds && valueNames?.[0] && valueNames[max - 1] ? (
        <div className={styles.scale} aria-hidden="true">
          <span>{valueNames[0]}</span>
          <span>{valueNames[max - 1]}</span>
        </div>
      ) : null}
      <FieldFooter hint={hint} error={error} />
    </RadioGroup>
  )
})
