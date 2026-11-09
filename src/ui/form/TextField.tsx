import { forwardRef } from 'react'
import { Input } from 'react-aria-components/Input'
import { TextField as AriaTextField } from 'react-aria-components/TextField'
import type { TextFieldProps as AriaTextFieldProps } from 'react-aria-components/TextField'
import { controlClass, cx, FieldFooter, FieldLabel, fieldClass, inputClass } from './Field.tsx'
import type { FieldProps } from './Field.tsx'

export interface TextFieldProps extends Omit<AriaTextFieldProps, 'className' | 'children' | 'isInvalid'>, FieldProps {
  placeholder?: string
}

export const TextField = forwardRef<HTMLDivElement, TextFieldProps>(function TextField(
  { label, hint, error, className, placeholder, ...rest },
  ref,
) {
  return (
    <AriaTextField {...rest} ref={ref} isInvalid={error ? true : undefined} className={cx(fieldClass, className)}>
      <FieldLabel>{label}</FieldLabel>
      <Input className={cx(controlClass, inputClass)} placeholder={placeholder} />
      <FieldFooter hint={hint} error={error} />
    </AriaTextField>
  )
})
