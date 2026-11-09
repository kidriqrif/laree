import type { ReactNode } from 'react'
import { FieldError } from 'react-aria-components/FieldError'
import { Label } from 'react-aria-components/Label'
import { Text } from 'react-aria-components/Text'
import styles from './Field.module.css'

/** Props every form control shares: label above, hint then error below. */
export interface FieldProps {
  label: ReactNode
  hint?: ReactNode
  /** When set the control is invalid and the text shows under the hint. */
  error?: ReactNode
  className?: string
}

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ')
}

export const fieldClass = styles.field as string
export const controlClass = styles.control as string
export const inputClass = styles.input as string
export const numericClass = styles.numeric as string
export const unitClass = styles.unit as string
export const labelClass = styles.label as string

/** For use inside a react-aria field root: the label, hint and error wire themselves up. */
export function FieldLabel({ children }: { children: ReactNode }) {
  return <Label className={styles.label}>{children}</Label>
}

export function FieldFooter({ hint, error }: Pick<FieldProps, 'hint' | 'error'>) {
  return (
    <>
      {hint ? (
        <Text slot="description" className={styles.hint}>
          {hint}
        </Text>
      ) : null}
      <FieldError className={styles.error}>{error}</FieldError>
    </>
  )
}

/** For controls that are not react-aria field roots: plain text with ids for aria-describedby. */
export function PlainFooter({
  hintId,
  errorId,
  hint,
  error,
}: { hintId: string; errorId: string } & Pick<FieldProps, 'hint' | 'error'>) {
  return (
    <>
      {hint ? (
        <span id={hintId} className={styles.hint}>
          {hint}
        </span>
      ) : null}
      {error ? (
        <span id={errorId} className={styles.error}>
          {error}
        </span>
      ) : null}
    </>
  )
}

export function describedBy(hintId: string, errorId: string, { hint, error }: Pick<FieldProps, 'hint' | 'error'>): string | undefined {
  const ids = [hint ? hintId : null, error ? errorId : null].filter(Boolean)
  return ids.length ? ids.join(' ') : undefined
}
