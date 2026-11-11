import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { buttonClass, type ButtonVariant } from './buttonClass.ts'
import styles from './Button.module.css'

export interface PlainButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className' | 'onClick' | 'disabled'> {
  variant?: ButtonVariant
  className?: string
  /** Named as on Button, so the two swap freely. */
  onPress?: () => void
  isDisabled?: boolean
}

/**
 * A native button with Button's look and none of its weight. Use it on a screen that must load
 * fast, such as the athlete's Today: Button brings react-aria's press handling (about 14 KB
 * gzipped), which a plain tap does not need. It has no loading state and cannot be the trigger
 * of a react-aria menu, popover or dialog: use Button for those.
 */
export const PlainButton = forwardRef<HTMLButtonElement, PlainButtonProps>(function PlainButton(
  { variant = 'secondary', className, onPress, isDisabled, type = 'button', children, ...rest },
  ref,
) {
  return (
    <button
      {...rest}
      ref={ref}
      // oxlint-disable-next-line react/button-has-type -- the type is a prop that defaults to "button"
      type={type}
      disabled={isDisabled}
      className={buttonClass(variant, className)}
      data-variant={variant}
      onClick={onPress}
    >
      <span className={styles.label}>{children}</span>
    </button>
  )
})
