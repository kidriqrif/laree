import { forwardRef } from 'react'
import { Button as AriaButton } from 'react-aria-components/Button'
import type { ButtonProps as AriaButtonProps } from 'react-aria-components/Button'
import { buttonClass, type ButtonVariant } from './buttonClass.ts'
import styles from './Button.module.css'

export { buttonClass } from './buttonClass.ts'
export type { ButtonVariant } from './buttonClass.ts'

export interface ButtonProps extends Omit<AriaButtonProps, 'className'> {
  /** Primary has an ink label on track red. Danger must sit behind a confirm step. */
  variant?: ButtonVariant
  className?: string
}

/** Height follows the register: 48 px for athletes, 28 px for coaches. */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', className, children, ...rest },
  ref,
) {
  return (
    <AriaButton {...rest} ref={ref} className={buttonClass(variant, className)} data-variant={variant}>
      {(state) => (
        <>
          <span className={styles.label}>{typeof children === 'function' ? children(state) : children}</span>
          {state.isPending ? <span className={styles.spinner} aria-hidden="true" /> : null}
        </>
      )}
    </AriaButton>
  )
})
