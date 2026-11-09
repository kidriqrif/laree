import { forwardRef } from 'react'
import { Button as AriaButton } from 'react-aria-components/Button'
import type { ButtonProps as AriaButtonProps } from 'react-aria-components/Button'
import { buttonClass } from './Button.tsx'
import type { ButtonVariant } from './Button.tsx'
import styles from './IconButton.module.css'

export interface IconButtonProps extends Omit<AriaButtonProps, 'className' | 'aria-label' | 'aria-labelledby'> {
  /** Required: icon-only controls have no visible text. */
  'aria-label': string
  variant?: ButtonVariant
  className?: string
}

/** Square button for one icon. Pass the icon as children. */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { variant = 'quiet', className, ...rest },
  ref,
) {
  const cls = [buttonClass(variant), styles.icon, className].filter(Boolean).join(' ')
  return <AriaButton {...rest} ref={ref} className={cls} data-variant={variant} />
})
