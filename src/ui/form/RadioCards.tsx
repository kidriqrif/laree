import { forwardRef } from 'react'
import type { ReactNode } from 'react'
import { Radio, RadioGroup } from 'react-aria-components/RadioGroup'
import type { RadioGroupProps } from 'react-aria-components/RadioGroup'
import { cx, FieldFooter, FieldLabel, fieldClass } from './Field.tsx'
import type { FieldProps } from './Field.tsx'
import styles from './Choice.module.css'

export interface RadioCardOption {
  id: string
  title: string
  description?: ReactNode
  isDisabled?: boolean
}

export interface RadioCardsProps
  extends Omit<RadioGroupProps, 'className' | 'children' | 'isInvalid' | 'value' | 'defaultValue' | 'onChange'>,
    FieldProps {
  options: ReadonlyArray<RadioCardOption>
  value?: string
  defaultValue?: string
  onChange?: (id: string) => void
}

/** Large radio choices with a title and a short description, e.g. the session type in the log sheet. */
export const RadioCards = forwardRef<HTMLDivElement, RadioCardsProps>(function RadioCards(
  { label, hint, error, className, options, onChange, ...rest },
  ref,
) {
  return (
    <RadioGroup
      {...rest}
      ref={ref}
      onChange={(v) => onChange?.(v)}
      isInvalid={error ? true : undefined}
      className={cx(fieldClass, className)}
    >
      <FieldLabel>{label}</FieldLabel>
      <div className={styles.cards}>
        {options.map((o) => (
          <Radio key={o.id} value={o.id} isDisabled={o.isDisabled} className={styles.radioCard}>
            <span className={styles.cardTitle}>
              <span className={styles.cardMark} aria-hidden="true" />
              {o.title}
            </span>
            {o.description ? <span className={styles.cardText}>{o.description}</span> : null}
          </Radio>
        ))}
      </div>
      <FieldFooter hint={hint} error={error} />
    </RadioGroup>
  )
})
