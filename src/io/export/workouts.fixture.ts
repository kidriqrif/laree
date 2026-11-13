/** Sample workouts for the exporter tests. The threshold sample is the one in docs/spec/io.md section 3.6. */
import type { ExportInput } from './common.ts';
import type { PlainStep, Step } from '../../domain/types.ts';

const amir = { id: 'amir' as const, name: 'Amir' };

/** Amir's threshold session: warm-up, 4 x (8 min interval + 3 min recovery), cool-down. */
export const thresholdSession: ExportInput = {
  athlete: amir,
  thresholds: { ftp: 255 },
  date: '2026-11-10',
  workout: {
    title: 'Threshold 4 × 8',
    sport: 'bike',
    description: 'Even pacing. If interval 4 drops below 242 W, stop there.',
    tags: ['build', 'threshold'],
    steps: [
      { id: 'w', kind: 'warmup', durationS: 900, target: { kind: 'pctFtp', low: 50, high: 75 } },
      {
        id: 'rep',
        kind: 'repeat',
        repeat: 4,
        steps: [
          {
            id: 'on',
            kind: 'interval',
            durationS: 480,
            target: { kind: 'pctFtp', low: 95, high: 100 },
            note: 'Seated. Cadence 90 or more.',
          },
          { id: 'off', kind: 'recovery', durationS: 180, target: { kind: 'pctFtp', low: 50, high: 60 } },
        ],
      },
      { id: 'c', kind: 'cooldown', durationS: 600, target: { kind: 'pctFtp', low: 45, high: 65 } },
    ],
  },
};

/** A steady endurance ride: one flat step, no ramps. */
export const steadySession: ExportInput = {
  athlete: amir,
  thresholds: { ftp: 255 },
  date: '2026-11-12',
  workout: {
    title: 'Steady endurance',
    sport: 'bike',
    steps: [{ id: 's', kind: 'steady', durationS: 3600, target: { kind: 'pctFtp', low: 65, high: 75 } }],
  },
};

/** Single intervals with recoveries between them, no repeat block, and a ramp at each end. */
export const intervalSession: ExportInput = {
  athlete: amir,
  thresholds: { ftp: 255 },
  date: '2026-11-14',
  workout: {
    title: 'Over-unders',
    sport: 'bike',
    steps: [
      { id: 'w', kind: 'warmup', durationS: 600, target: { kind: 'pctFtp', low: 50, high: 65 } },
      { id: 'i1', kind: 'interval', durationS: 180, target: { kind: 'pctFtp', low: 110, high: 110 } },
      { id: 'r1', kind: 'recovery', durationS: 120, target: { kind: 'pctFtp', low: 50, high: 50 } },
      { id: 'i2', kind: 'interval', durationS: 180, target: { kind: 'pctFtp', low: 110, high: 110 } },
      { id: 'c', kind: 'cooldown', durationS: 300, target: { kind: 'pctFtp', low: 45, high: 65 } },
    ] as Step[],
  },
};

/** A plain step with the given target, for tests that build their own workouts. */
export function plain(id: string, kind: PlainStep['kind'], durationS: number, low: number, high: number): PlainStep {
  return { id, kind, durationS, target: { kind: 'pctFtp', low, high } };
}
