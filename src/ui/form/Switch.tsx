import { forwardRef, useId } from 'react'
import type { ReactElement, ReactNode, RefAttributes } from 'react'
import { Switch as AriaSwitch } from 'react-aria-components/Switch'
import type { SwitchProps as AriaSwitchProps } from 'react-aria-components/Switch'
import { cx, describedBy, PlainFooter } from './Field.tsx'
import type { FieldProps } from './Field.tsx'
import styles from './Choice.module.css'

/**
 * The Switch type leaves out isInvalid (validation moved to SwitchField), but its useSwitch hook
 * still reads it and sets aria-invalid on the input. Widened here so an error reaches the input.
 */
const InvalidableSwitch = AriaSwitch as (
  props: AriaSwitchProps & { isInvalid?: boolean } & RefAttributes<HTMLLabelElement>,
) => ReactElement | null

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
      <InvalidableSwitch
        {...rest}
        ref={ref}
        isInvalid={error ? true : undefined}
        aria-describedby={describedBy(hintId, errorId, { hint, error })}
        className={styles.switch}
      >
        <span className={styles.track} aria-hidden="true">
          <span className={styles.thumb} />
        </span>
        {label}
      </InvalidableSwitch>
      <PlainFooter hintId={hintId} errorId={errorId} hint={hint} error={error} />
    </div>
  )
})
