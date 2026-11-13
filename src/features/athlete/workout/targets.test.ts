import { describe, expect, it } from 'vitest'
import type { LoadThresholds } from '../../../domain/metrics/load.ts'
import type { PlainStep } from '../../../domain/types.ts'
import { durationLabel, segmentsOf, stepSentence, targetText } from './targets.ts'

const amir: LoadThresholds = { ftp: 255, thresholdPaceSPerKm: 265, lthr: 166 }
const step = (p: Partial<PlainStep>): PlainStep => ({ id: 's', kind: 'interval', ...p }) as PlainStep

describe('target text for Amir', () => {
  it('resolves a run threshold range', () => {
    const s = step({ durationS: 600, target: { kind: 'pctThresholdPace', low: 95, high: 100 } })
    expect(stepSentence(s, amir)).toBe('10 min at 95-100% threshold, 4:25-4:39 /km')
  })
  it('resolves a power range from FTP 255 W', () => {
    const s = step({ durationS: 720, target: { kind: 'pctFtp', low: 88, high: 93 } })
    expect(stepSentence(s, amir)).toBe('12 min at 88-93% FTP, 224-237 W')
  })
  it('shows the percentage only when a threshold is missing', () => {
    const t = targetText({ kind: 'pctCss', low: 100, high: 105 }, amir)
    expect(t.absolute).toBeNull()
    expect(t.missing).toBe('Ask Coach to set your swim threshold.')
  })
  it('carries effort as text', () => {
    expect(targetText({ kind: 'rpe', low: 7, high: 7 }, amir).basis).toBe('RPE 7')
  })
  it('labels durations', () => {
    expect([45, 480, 150, 4140].map(durationLabel)).toEqual(['45 s', '8 min', '2 min 30 s', '1 h 09 min'])
  })
  it('expands repeats and slopes a warm-up', () => {
    const segs = segmentsOf(
      [
        step({ kind: 'warmup', durationS: 600, target: { kind: 'pctFtp', low: 50, high: 70 } }),
        {
          id: 'r',
          kind: 'repeat',
          repeat: 3,
          steps: [step({ durationS: 300, target: { kind: 'pctFtp', low: 100, high: 100 } })],
        },
      ],
      'bike',
      amir,
    )
    expect(segs).toHaveLength(4)
    expect(segs[0]).toMatchObject({ from: 50, to: 70, zone: 2 })
    expect(segs[3]?.startS).toBe(1200)
  })
})
