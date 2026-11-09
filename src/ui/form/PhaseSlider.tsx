import { forwardRef, useId, useState } from 'react'
import { Label } from 'react-aria-components/Label'
import { Slider as AriaSlider, SliderThumb, SliderTrack } from 'react-aria-components/Slider'
import { cx, describedBy, labelClass, PlainFooter } from './Field.tsx'
import type { FieldProps } from './Field.tsx'
import styles from './Slider.module.css'

export interface PhaseSegment {
  id: string
  /** Shown on the segment and spoken, e.g. "Build". */
  label: string
}

export interface PhaseSliderProps extends FieldProps {
  phases: ReadonlyArray<PhaseSegment>
  /** Weeks per phase, same order as phases. Must sum to the season length. Controlled. */
  weeks?: ReadonlyArray<number>
  defaultWeeks?: ReadonlyArray<number>
  onChange?: (weeks: number[]) => void
  isDisabled?: boolean
}

const toBoundaries = (weeks: ReadonlyArray<number>): number[] => {
  let sum = 0
  return weeks.slice(0, -1).map((w) => (sum += w))
}

const toWeeks = (bounds: ReadonlyArray<number>, total: number): number[] => {
  const out: number[] = []
  let prev = 0
  for (const b of bounds) {
    out.push(b - prev)
    prev = b
  }
  out.push(total - prev)
  return out
}

/**
 * One thumb per boundary between phases, over the season's weeks. Thumbs cannot cross
 * and every phase keeps at least one week. Each segment shows its phase name and length.
 */
export const PhaseSlider = forwardRef<HTMLDivElement, PhaseSliderProps>(function PhaseSlider(
  { label, hint, error, className, phases, weeks, defaultWeeks, onChange, isDisabled },
  ref,
) {
  const uid = useId()
  const hintId = `${uid}-h`
  const errorId = `${uid}-e`
  const [inner, setInner] = useState<number[]>(() => [...(weeks ?? defaultWeeks ?? phases.map(() => 1))])
  const current = weeks ? [...weeks] : inner
  const total = current.reduce((a, b) => a + b, 0)
  const bounds = toBoundaries(current)

  const handle = (next: number[]) => {
    // The first phase and the last must keep a week, which the slider's own bounds cannot say.
    if ((next[0] ?? 1) < 1 || (next[next.length - 1] ?? 0) > total - 1) return
    const w = toWeeks(next, total)
    if (w.some((x) => x < 1)) return
    setInner(w)
    onChange?.(w)
  }

  return (
    <div className={cx(styles.slider, className)}>
      <AriaSlider
        ref={ref}
        minValue={0}
        maxValue={total}
        step={1}
        value={bounds}
        onChange={handle}
        isDisabled={isDisabled}
        aria-describedby={describedBy(hintId, errorId, { hint, error })}
        className={styles.slider}
      >
        <Label className={labelClass}>{label}</Label>
        <SliderTrack className={styles.phaseTrack}>
          {({ state }) => (
            <>
              <div className={styles.segments} aria-hidden="true">
                {current.map((w, i) => (
                  <div key={phases[i]?.id ?? i} className={styles.segment} style={{ flexGrow: w, flexBasis: 0 }}>
                    <span className={styles.segName}>{phases[i]?.label}</span>
                    <span className={styles.segWeeks}>{w === 1 ? '1 wk' : `${w} wks`}</span>
                  </div>
                ))}
              </div>
              {bounds.map((_, i) => (
                <SliderThumb
                  key={phases[i]?.id ?? i}
                  index={i}
                  className={cx(styles.thumb, styles.phaseThumb)}
                  aria-label={`End of ${phases[i]?.label ?? `phase ${i + 1}`}`}
                  aria-valuetext={`${phases[i]?.label ?? 'Phase'} ends after week ${state.values[i] ?? 0} of ${total}`}
                />
              ))}
            </>
          )}
        </SliderTrack>
      </AriaSlider>
      <PlainFooter hintId={hintId} errorId={errorId} hint={hint} error={error} />
    </div>
  )
})
