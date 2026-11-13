import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { formatDuration, parseDuration, parsePace } from './clock.ts'
import { DurationField, NumberField, PaceField, PhaseSlider, Rating, SegmentedControl, Slider, Switch, TextField } from './index.ts'

afterEach(cleanup)

const thumbs = () => screen.getAllByRole('slider') as HTMLInputElement[]

describe('clock parsing', () => {
  it('parses h:mm:ss, m:ss and bare minutes', () => {
    expect(parseDuration('1:05:30')).toBe(3930)
    expect(parseDuration('45:00')).toBe(2700)
    expect(parseDuration('90')).toBe(5400)
    expect(parseDuration('1:75')).toBeNull()
    expect(parseDuration('abc')).toBeNull()
    expect(parsePace('5:30')).toBe(330)
    expect(parsePace('1:02:03')).toBeNull()
    expect(formatDuration(3930)).toBe('1:05:30')
    expect(formatDuration(95)).toBe('1:35')
  })
})

describe('field layout', () => {
  it('announces label and links hint and error with aria-describedby', () => {
    render(<TextField label="Session title" hint="Shown on the calendar" error="Give it a title" />)
    const input = screen.getByRole('textbox', { name: 'Session title' })
    const ids = (input.getAttribute('aria-describedby') ?? '').split(' ')
    const text = ids.map((id) => document.getElementById(id)?.textContent)
    expect(text).toContain('Shown on the calendar')
    expect(text).toContain('Give it a title')
    expect(input.getAttribute('aria-invalid')).toBe('true')
  })

  it('marks plain-footer controls invalid and announces their error', () => {
    render(
      <>
        <Switch label="Key session" error="Pick a key session" />
        <Slider label="Effort" defaultValue={5} minValue={0} maxValue={10} error="Too hard for a recovery week" />
        <PhaseSlider label="Season phases" phases={[{ id: 'a', label: 'Base' }, { id: 'b', label: 'Build' }]} weeks={[4, 4]} error="Build is too short" />
        <Switch label="Share check-ins" />
      </>,
    )
    expect(screen.getByRole('switch', { name: 'Key session' }).getAttribute('aria-invalid')).toBe('true')
    expect(screen.getByRole('switch', { name: 'Share check-ins' }).getAttribute('aria-invalid')).toBeNull()
    expect(thumbs().map((t) => t.getAttribute('aria-invalid'))).toEqual(['true', 'true'])
    expect(screen.getAllByRole('alert').map((a) => a.textContent)).toEqual(['Pick a key session', 'Too hard for a recovery week', 'Build is too short'])
  })

  it('names the unit for screen readers', () => {
    render(<NumberField label="Threshold power" unit="W" defaultValue={250} />)
    expect(screen.getByRole('textbox', { name: /Threshold power \(W\)/ })).toBeTruthy()
  })
})

describe('NumberField', () => {
  it('clamps typed values to min and max', () => {
    const onChange = vi.fn<(v: number) => void>()
    render(<NumberField label="Heart rate" unit="bpm" minValue={40} maxValue={220} defaultValue={150} onChange={onChange} />)
    const input = screen.getByRole('textbox') as HTMLInputElement
    fireEvent.change(input, { target: { value: '999' } })
    fireEvent.blur(input)
    expect(input.value).toBe('220')
    fireEvent.change(input, { target: { value: '5' } })
    fireEvent.blur(input)
    expect(input.value).toBe('40')
  })
})

describe('DurationField', () => {
  it('parses on blur, clamps and reports seconds', () => {
    const onChange = vi.fn<(v: number | null) => void>()
    render(<DurationField label="Duration" max={7200} onChange={onChange} />)
    const input = screen.getByRole('textbox', { name: 'Duration' }) as HTMLInputElement
    fireEvent.change(input, { target: { value: '1:05:30' } })
    fireEvent.blur(input)
    expect(onChange).toHaveBeenLastCalledWith(3930)
    expect(input.value).toBe('1:05:30')
    fireEvent.change(input, { target: { value: '3:00:00' } })
    fireEvent.blur(input)
    expect(onChange).toHaveBeenLastCalledWith(7200)
    expect(input.value).toBe('2:00:00')
  })

  it('shows an announced error for text that is not a time', () => {
    render(<DurationField label="Duration" />)
    const input = screen.getByRole('textbox', { name: 'Duration' })
    fireEvent.change(input, { target: { value: 'soon' } })
    fireEvent.blur(input)
    expect(input.getAttribute('aria-invalid')).toBe('true')
    const ids = (input.getAttribute('aria-describedby') ?? '').split(' ')
    expect(ids.map((id) => document.getElementById(id)?.textContent).join(' ')).toContain('Enter a time')
  })
})

describe('PaceField', () => {
  it('reports seconds per unit', () => {
    const onChange = vi.fn<(v: number | null) => void>()
    render(<PaceField label="Easy pace" onChange={onChange} />)
    const input = screen.getByRole('textbox', { name: /Easy pace/ })
    fireEvent.change(input, { target: { value: '5:30' } })
    fireEvent.blur(input)
    expect(onChange).toHaveBeenLastCalledWith(330)
  })
})

describe('Rating', () => {
  it('is a radio group with each value named', () => {
    const onChange = vi.fn<(v: number) => void>()
    render(<Rating label="How did it feel?" max={10} valueNames={['Very easy', 'Easy', 'Light', 'Steady', 'Moderate', 'Firm', 'Hard', 'Very hard', 'Severe', 'Maximal']} onChange={onChange} />)
    expect(screen.getByRole('radiogroup', { name: 'How did it feel?' })).toBeTruthy()
    expect(screen.getAllByRole('radio')).toHaveLength(10)
    const seven = screen.getByRole('radio', { name: '7 of 10, Hard' })
    fireEvent.click(seven)
    expect(onChange).toHaveBeenCalledWith(7)
  })

  it('has five values by default', () => {
    render(<Rating label="Sleep" />)
    expect(screen.getAllByRole('radio')).toHaveLength(5)
    expect(screen.getByRole('radio', { name: '3 of 5' })).toBeTruthy()
  })
})

describe('SegmentedControl', () => {
  it('is a labelled radio group', () => {
    render(
      <SegmentedControl
        label="Units"
        defaultValue="km"
        options={[
          { id: 'km', label: 'Kilometres' },
          { id: 'm', label: 'Metres' },
        ]}
      />,
    )
    expect(screen.getByRole('radiogroup', { name: 'Units' })).toBeTruthy()
    expect(screen.getByRole('radio', { name: 'Kilometres' }).getAttribute('aria-checked')).toBe('true')
  })
})

describe('PhaseSlider', () => {
  const phases = [
    { id: 'base', label: 'Base' },
    { id: 'build', label: 'Build' },
    { id: 'taper', label: 'Taper' },
  ]

  function Harness({ onChange }: { onChange: (w: number[]) => void }) {
    const [weeks, setWeeks] = useState([4, 4, 2])
    return (
      <PhaseSlider
        label="Season phases"
        phases={phases}
        weeks={weeks}
        onChange={(w) => {
          setWeeks(w)
          onChange(w)
        }}
      />
    )
  }

  it('has one named thumb per boundary', () => {
    render(<Harness onChange={() => {}} />)
    const t = thumbs()
    expect(t).toHaveLength(2)
    expect(t[0]?.getAttribute('aria-label')).toBe('End of Base')
    expect(t[1]?.getAttribute('aria-label')).toBe('End of Build')
    expect(t[0]?.value).toBe('4')
    expect(t[1]?.value).toBe('8')
  })

  it('moves with the keyboard and cannot cross', () => {
    const onChange = vi.fn<(v: number[]) => void>()
    render(<Harness onChange={onChange} />)
    const first = thumbs()[0] as HTMLInputElement
    act(() => first.focus())
    fireEvent.keyDown(first, { key: 'ArrowRight' })
    expect(onChange).toHaveBeenLastCalledWith([5, 3, 2])
    // Push the first thumb as far right as it will go: it stops one week before the second.
    for (let i = 0; i < 10; i++) fireEvent.keyDown(first, { key: 'ArrowRight' })
    const [a, b] = thumbs().map((t) => Number(t.value)) as [number, number]
    expect(a).toBeLessThan(b)
    expect(b).toBe(8)
    // And never below one week for the first phase.
    for (let i = 0; i < 12; i++) fireEvent.keyDown(first, { key: 'ArrowLeft' })
    expect(Number(thumbs()[0]?.value)).toBeGreaterThanOrEqual(1)
  })
})
