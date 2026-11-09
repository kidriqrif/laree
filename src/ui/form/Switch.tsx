import { forwardRef, useId } from 'react'
import type { ReactNode } from 'react'
import { Switch as AriaSwitch } from 'react-aria-components/Switch'
import type { SwitchProps as AriaSwitchProps } from 'react-aria-components/Switch'
import { cx, describedBy, PlainFooter } from './Field.tsx'
import type { FieldProps } from './Field.tsx'
import styles from './Choice.module.css'

export interface SwitchProps extends Omit<AriaSwitchProps, 'className' | 'children'>, Omit<FieldProps, 'label'> {
  /** The setting the switch controls, phrased so that "on" is clear. */
  label: ReactNode
}

export const Switch = forwardRef<HTMLLabelElement, SwitchProps>(function Switch(
  { label, hint, error, className, ...rest },
  ref,
) {
  const uid = useId()
  const hintId = `${uid}-h`
  const errorId = `${uid}-e`
  return (
    <div className={cx(styles.switchRoot, className)}>
      <AriaSwitch
        {...rest}
        ref={ref}
        aria-describedby={describedBy(hintId, errorId, { hint, error })}
        className={styles.switch}
      >
        <span className={styles.track} aria-hidden="true">
          <span className={styles.thumb} />
        </span>
        {label}
      </AriaSwitch>
      <PlainFooter hintId={hintId} errorId={errorId} hint={hint} error={error} />
    </div>
  )
})
