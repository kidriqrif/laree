import { forwardRef } from 'react'
import { Button } from 'react-aria-components/Button'
import { ListBox, ListBoxItem } from 'react-aria-components/ListBox'
import { Popover } from 'react-aria-components/Popover'
import { Select as AriaSelect, SelectValue } from 'react-aria-components/Select'
import type { Key, SelectProps as AriaSelectProps } from 'react-aria-components/Select'
import { controlClass, cx, FieldFooter, FieldLabel, fieldClass } from './Field.tsx'
import type { FieldProps } from './Field.tsx'
import styles from './Select.module.css'

export interface SelectOption {
  id: string
  label: string
  isDisabled?: boolean
}

export interface SelectProps
  extends Omit<AriaSelectProps<SelectOption>, 'className' | 'children' | 'isInvalid' | 'items' | 'value' | 'defaultValue' | 'onChange'>,
    FieldProps {
  options: ReadonlyArray<SelectOption>
  value?: string | null
  defaultValue?: string | null
  onChange?: (id: string) => void
}

export const Select = forwardRef<HTMLDivElement, SelectProps>(function Select(
  { label, hint, error, className, options, value, defaultValue, onChange, placeholder = 'Choose one', ...rest },
  ref,
) {
  const controlled: { value?: Key | null; defaultValue?: Key | null } = {}
  if (value !== undefined) controlled.value = value
  if (defaultValue !== undefined) controlled.defaultValue = defaultValue
  return (
    <AriaSelect
      {...rest}
      {...controlled}
      ref={ref}
      placeholder={placeholder}
      onChange={(k) => {
        if (k !== null && k !== undefined) onChange?.(String(k))
      }}
      isInvalid={error ? true : undefined}
      className={cx(fieldClass, className)}
    >
      <FieldLabel>{label}</FieldLabel>
      <Button className={cx(controlClass, styles.trigger)}>
        <SelectValue className={styles.value} />
        <svg className={styles.chevron} viewBox="0 0 24 24" aria-hidden="true">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </Button>
      <FieldFooter hint={hint} error={error} />
      <Popover className={styles.popover}>
        <ListBox className={styles.list} items={options}>
          {(o) => (
            <ListBoxItem id={o.id} textValue={o.label} isDisabled={o.isDisabled} className={styles.item}>
              {o.label}
            </ListBoxItem>
          )}
        </ListBox>
      </Popover>
    </AriaSelect>
  )
})
