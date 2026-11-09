import { forwardRef, useId } from 'react'
import type { ReactNode } from 'react'
import { ToggleButton } from 'react-aria-components/ToggleButton'
import { ToggleButtonGroup } from 'react-aria-components/ToggleButtonGroup'
import { cx, describedBy, fieldClass, labelClass, PlainFooter } from './Field.tsx'
import type { FieldProps } from './Field.tsx'
import styles from './Choice.module.css'

export interface SegmentOption {
  id: string
  label: ReactNode
  /** Needed when label is not plain text. */
  ariaLabel?: string
  isDisabled?: boolean
}

export interface SegmentedControlProps extends Omit<FieldProps, 'label'> {
  /** Visible label. Omit it and pass ariaLabel to label the group invisibly. */
  label?: ReactNode
  ariaLabel?: string
  options: ReadonlyArray<SegmentOption>
  value?: string
  defaultValue?: string
  onChange?: (id: string) => void
  isDisabled?: boolean
}

/** One-of-n choice. Renders as a radio group; arrow keys move and select. */
export const SegmentedControl = forwardRef<HTMLDivElement, SegmentedControlProps>(function SegmentedControl(
  { label, ariaLabel, hint, error, className, options, value, defaultValue, onChange, isDisabled },
  ref,
) {
  const uid = useId()
  const labelId = `${uid}-l`
  const hintId = `${uid}-h`
  const errorId = `${uid}-e`
  const selection: { selectedKeys?: string[]; defaultSelectedKeys?: string[] } = {}
  if (value !== undefined) selection.selectedKeys = [value]
  if (defaultValue !== undefined) selection.defaultSelectedKeys = [defaultValue]
  return (
    <div className={cx(fieldClass, className)}>
      {label ? (
        <span id={labelId} className={labelClass}>
          {label}
        </span>
      ) : null}
      <ToggleButtonGroup
        {...selection}
        ref={ref}
        selectionMode="single"
        disallowEmptySelection
        isDisabled={isDisabled}
        aria-labelledby={label ? labelId : undefined}
        aria-label={label ? undefined : ariaLabel}
        aria-describedby={describedBy(hintId, errorId, { hint, error })}
        aria-invalid={error ? true : undefined}
        onSelectionChange={(keys) => {
          const first = [...keys][0]
          if (first !== undefined) onChange?.(String(first))
        }}
        className={styles.segments}
      >
        {options.map((o) => (
          <ToggleButton key={o.id} id={o.id} aria-label={o.ariaLabel} isDisabled={o.isDisabled} className={styles.segment}>
            {o.label}
          </ToggleButton>
        ))}
      </ToggleButtonGroup>
      <PlainFooter hintId={hintId} errorId={errorId} hint={hint} error={error} />
    </div>
  )
})
