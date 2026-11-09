import { forwardRef } from 'react'
import { Group } from 'react-aria-components/Group'
import { Input } from 'react-aria-components/Input'
import { NumberField as AriaNumberField } from 'react-aria-components/NumberField'
import type { NumberFieldProps as AriaNumberFieldProps } from 'react-aria-components/NumberField'
import { VisuallyHidden } from 'react-aria-components/VisuallyHidden'
import { controlClass, cx, FieldFooter, FieldLabel, fieldClass, inputClass, numericClass, unitClass } from './Field.tsx'
import type { FieldProps } from './Field.tsx'

export interface NumberFieldProps extends Omit<AriaNumberFieldProps, 'className' | 'children' | 'isInvalid'>, FieldProps {
  /** Suffix such as W, km or bpm. Read out after the label. */
  unit?: string
  placeholder?: string
}

/** Right-aligned tabular number with a unit suffix. Typed values are clamped to min and max on commit. */
export const NumberField = forwardRef<HTMLDivElement, NumberFieldProps>(function NumberField(
  { label, hint, error, unit, className, placeholder, ...rest },
  ref,
) {
  return (
    <AriaNumberField {...rest} ref={ref} isInvalid={error ? true : undefined} className={cx(fieldClass, className)}>
      <FieldLabel>
        {label}
        {unit ? <VisuallyHidden> ({unit})</VisuallyHidden> : null}
      </FieldLabel>
      <Group className={controlClass} data-invalid={error ? true : undefined}>
        <Input className={cx(inputClass, numericClass)} placeholder={placeholder} />
        {unit ? (
          <span className={unitClass} aria-hidden="true">
            {unit}
          </span>
        ) : null}
      </Group>
      <FieldFooter hint={hint} error={error} />
    </AriaNumberField>
  )
})
