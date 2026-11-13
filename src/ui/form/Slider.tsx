import { forwardRef, useId } from 'react'
import { Label } from 'react-aria-components/Label'
import { Slider as AriaSlider, SliderOutput, SliderThumb, SliderTrack } from 'react-aria-components/Slider'
import type { SliderProps as AriaSliderProps } from 'react-aria-components/Slider'
import { cx, describedBy, labelClass, PlainFooter } from './Field.tsx'
import type { FieldProps } from './Field.tsx'
import styles from './Slider.module.css'

export interface SliderProps extends Omit<AriaSliderProps<number>, 'className' | 'children' | 'value' | 'defaultValue' | 'onChange' | 'onChangeEnd'>, FieldProps {
  value?: number
  defaultValue?: number
  onChange?: (value: number) => void
  /** Suffix shown after the value, e.g. "%" or " km". */
  unit?: string
}

/** Single-thumb slider. Arrow keys step, Home and End jump, Page keys move by ten steps. */
export const Slider = forwardRef<HTMLDivElement, SliderProps>(function Slider(
  { label, hint, error, className, unit = '', onChange, ...rest },
  ref,
) {
  const uid = useId()
  const hintId = `${uid}-h`
  const errorId = `${uid}-e`
  return (
    <div className={cx(styles.slider, className)}>
      <AriaSlider
        {...rest}
        ref={ref}
        onChange={(v) => onChange?.(v as number)}
        aria-describedby={describedBy(hintId, errorId, { hint, error })}
        className={styles.slider}
      >
        <div className={styles.head}>
          <Label className={labelClass}>{label}</Label>
          <SliderOutput className={styles.output}>{({ state }) => `${state.getThumbValueLabel(0)}${unit}`}</SliderOutput>
        </div>
        <SliderTrack className={styles.track}>
          {({ state }) => (
            <>
              <div className={styles.rail}>
                <div className={styles.fill} style={{ inlineSize: `${state.getThumbPercent(0) * 100}%` }} />
              </div>
              <SliderThumb
                className={styles.thumb}
                isInvalid={error ? true : undefined}
                aria-valuetext={`${state.getThumbValueLabel(0)}${unit}`} />
            </>
          )}
        </SliderTrack>
      </AriaSlider>
      <PlainFooter hintId={hintId} errorId={errorId} hint={hint} error={error} />
    </div>
  )
})
