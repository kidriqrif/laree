import styles from './Button.module.css'

export type ButtonVariant = 'primary' | 'secondary' | 'quiet' | 'danger'

/** The button look as class names, for Button, PlainButton and links that must look like a button. */
export function buttonClass(variant: ButtonVariant, className?: string): string {
  return [styles.button, styles[variant], className].filter(Boolean).join(' ')
}
