import { forwardRef, useEffect, useState } from 'react'
import { Group } from 'react-aria-components/Group'
import { Input } from 'react-aria-components/Input'
import { TextField as AriaTextField } from 'react-aria-components/TextField'
import { VisuallyHidden } from 'react-aria-components/VisuallyHidden'
import { formatDuration, formatPace, parseDuration, parsePace } from './clock.ts'
import { controlClass, cx, FieldFooter, FieldLabel, fieldClass, inputClass, numericClass, unitClass } from './Field.tsx'
import type { FieldProps } from './Field.tsx'

interface ClockFieldBase extends FieldProps {
  /** Seconds, or null when empty. Controlled. */
  value?: number | null
  defaultValue?: number | null
  /** Called on commit (blur or Enter) with the clamped seconds, or null when cleared. */
  onChange?: (seconds: number | null) => void
  /** Smallest and largest accepted value in seconds. */
  min?: number
  max?: number
  isDisabled?: boolean
  isRequired?: boolean
  name?: string
  placeholder?: string
}

interface ClockInternalProps extends ClockFieldBase {
  parse: (text: string) => number | null
  format: (seconds: number) => string
  invalidMessage: string
  unit?: string
  unitSpoken?: string
}

const ClockField = forwardRef<HTMLDivElement, ClockInternalProps>(function ClockField(
  { label, hint, error, className, value, defaultValue, onChange, min = 0, max = Number.POSITIVE_INFINITY, parse, format, invalidMessage, unit, unitSpoken, placeholder, ...rest },
  ref,
) {
  const initial = value ?? defaultValue
  const [text, setText] = useState(initial == null ? '' : format(initial))
  const [local, setLocal] = useState<string | null>(null)

  // Follow outside changes, but never overwrite what the person is mid-way through typing.
  useEffect(() => {
    if (value === undefined) return
    setText((prev) => {
      const parsed = parse(prev)
      if (value === null) return parsed === null && prev.trim() !== '' ? prev : ''
      return parsed === value ? prev : format(value)
    })
  }, [value, parse, format])

  const commit = () => {
    if (text.trim() === '') {
      setLocal(null)
      onChange?.(null)
      return
    }
    const seconds = parse(text)
    if (seconds === null) {
      setLocal(invalidMessage)
      return
    }
    const clamped = Math.min(max, Math.max(min, seconds))
    setLocal(null)
    setText(format(clamped))
    onChange?.(clamped)
  }

  const shown = error ?? local
  return (
    <AriaTextField
      {...rest}
      ref={ref}
      value={text}
      onChange={(v) => {
        setText(v)
        if (local) setLocal(null)
      }}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit()
      }}
      isInvalid={shown ? true : undefined}
      className={cx(fieldClass, className)}
    >
      <FieldLabel>
        {label}
        {unitSpoken ? <VisuallyHidden> ({unitSpoken})</VisuallyHidden> : null}
      </FieldLabel>
      <Group className={controlClass} data-invalid={shown ? true : undefined}>
        <Input className={cx(inputClass, numericClass)} inputMode="numeric" placeholder={placeholder} />
        {unit ? (
          <span className={unitClass} aria-hidden="true">
            {unit}
          </span>
        ) : null}
      </Group>
      <FieldFooter hint={hint} error={shown} />
    </AriaTextField>
  )
})

export type DurationFieldProps = ClockFieldBase

/** Accepts h:mm:ss or m:ss (a bare number is minutes) and reports whole seconds. */
export const DurationField = forwardRef<HTMLDivElement, DurationFieldProps>(function DurationField(props, ref) {
  return (
    <ClockField
      placeholder="0:00"
      {...props}
      ref={ref}
      parse={parseDuration}
      format={formatDuration}
      invalidMessage="Enter a time like 45:00 or 1:05:30."
    />
  )
})

export interface PaceFieldProps extends ClockFieldBase {
  /** Per kilometre for run and bike, per 100 metres for swim. */
  per?: 'km' | '100m'
}

/** Accepts m:ss and reports seconds per kilometre or per 100 metres. */
export const PaceField = forwardRef<HTMLDivElement, PaceFieldProps>(function PaceField({ per = 'km', ...props }, ref) {
  const unit = per === 'km' ? '/km' : '/100 m'
  return (
    <ClockField
      placeholder="0:00"
      {...props}
      ref={ref}
      parse={parsePace}
      format={formatPace}
      invalidMessage={`Enter a pace like ${per === 'km' ? '5:30' : '1:45'}.`}
      unit={unit}
      unitSpoken={per === 'km' ? 'minutes per kilometre' : 'minutes per 100 metres'}
    />
  )
})
