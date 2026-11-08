/**
 * How each athlete actually trained, week by week, written as exceptions to "did the plan".
 * Slot keys are `${weekdayIndex}:${sport}` (0 = Monday). Everything not listed is done at
 * about 100% of plan (the generator adds a few percent of noise).
 *
 * The exceptions are chosen so the badge and streak targets in docs/spec/gamification.md
 * section 4.5 come out exactly; seed.test.ts checks them with the real engine.
 */
import type { AthleteId, Sport } from '../../domain/types.ts';

export interface Directive {
  /** Skipped entirely. */
  miss?: true;
  /** Done at this percentage of planned load (or of planned time for strength). */
  pct?: number;
}

export interface Extra {
  /** Weekday index, 0 = Monday. */
  day: number;
  sport: Sport;
  startMinute: number;
  durationMin: number;
  /** Intensity as a fraction of threshold. */
  intensity: number;
  title: string;
}

export interface WeekBehaviour {
  slots?: Record<string, Directive>;
  extras?: Extra[];
}

const miss: Directive = { miss: true };
const at = (pct: number): Directive => ({ pct });

export const BEHAVIOUR: Record<AthleteId, Record<number, WeekBehaviour>> = {
  amir: {
    1: { slots: { '4:swim': miss } },
    2: { slots: { '1:run': at(72) } },
    3: { slots: { '5:bike': at(124) } },
    4: { slots: { '1:run': at(70) } },
    5: { slots: { '5:bike': miss } },
    6: { slots: { '3:strength': at(70) } },
    7: { slots: { '6:run': at(128) } },
    8: { slots: { '4:swim': at(72) } },
    9: { slots: { '4:swim': miss } },
    10: {},
    11: { slots: { '1:run': miss } },
    12: { slots: { '3:strength': at(70) } },
    13: { slots: { '5:bike': miss } },
    14: {
      slots: { '2:bike': at(130), '5:bike': at(130) },
      extras: [
        { day: 0, sport: 'bike', startMinute: 360, durationMin: 150, intensity: 0.72, title: 'Bike: Extra long ride' },
        { day: 4, sport: 'run', startMinute: 1080, durationMin: 50, intensity: 0.85, title: 'Run: Extra tempo' },
      ],
    },
    15: { slots: { '2:bike': at(120), '5:bike': at(120), '6:run': at(110) } },
    16: { slots: { '4:swim': miss } },
  },
  danial: {
    1: { slots: { '2:run': at(75) } },
    2: { slots: { '6:run': miss, '2:run': miss } },
    3: { slots: { '4:strength': miss } },
    4: { slots: { '4:run': at(72) } },
    5: { slots: { '1:strength': miss } },
    6: { slots: { '3:run': at(125) } },
    7: {},
    8: { slots: { '2:run': at(74) } },
    9: { slots: { '4:strength': miss } },
    10: { slots: { '1:strength': at(75) } },
    11: {
      slots: {
        '1:run': miss,
        '1:strength': miss,
        '2:run': miss,
        '3:run': miss,
        '4:run': miss,
        '4:strength': miss,
        '6:run': miss,
      },
    },
    12: {},
    13: { slots: { '4:strength': miss } },
    14: { slots: { '2:run': at(75) } },
    15: { slots: { '4:run': miss } },
    16: {},
  },
  irfan: {
    1: { slots: { '2:strength': miss } },
    2: { slots: { '6:bike': at(75) } },
    3: { slots: { '2:strength': at(70) } },
    4: {
      slots: {
        '1:bike': at(135),
        '2:bike': at(135),
        '3:bike': at(135),
        '5:bike': at(135),
        '6:bike': at(135),
      },
    },
    5: { slots: { '6:bike': miss } },
    6: { slots: { '5:bike': miss, '6:bike': at(70) } },
    7: { slots: { '2:strength': miss } },
    8: { slots: { '2:strength': at(72) } },
    9: { slots: { '6:bike': at(125) } },
    10: { slots: { '2:strength': miss } },
    11: { slots: { '1:bike': at(78) } },
    12: { slots: { '2:strength': at(70) } },
    13: { slots: { '3:bike': at(128) } },
    14: {},
    15: {
      slots: { '5:bike': miss, '1:bike': at(130), '3:bike': at(130) },
      extras: [
        { day: 0, sport: 'bike', startMinute: 360, durationMin: 150, intensity: 0.75, title: 'Bike: Extra hill ride' },
        { day: 4, sport: 'bike', startMinute: 360, durationMin: 120, intensity: 0.75, title: 'Bike: Extra climbing' },
      ],
    },
    16: {
      slots: { '1:bike': at(130), '2:bike': at(130), '3:bike': at(130), '5:bike': at(130), '6:bike': at(130) },
      extras: [
        { day: 0, sport: 'bike', startMinute: 360, durationMin: 150, intensity: 0.8, title: 'Bike: Extra hill ride' },
        { day: 2, sport: 'bike', startMinute: 1110, durationMin: 120, intensity: 0.85, title: 'Bike: Evening climb' },
        { day: 3, sport: 'bike', startMinute: 1110, durationMin: 120, intensity: 0.85, title: 'Bike: Evening climb' },
      ],
    },
  },
};

/** The current week (17): done at plan, with the climbing block pushed a little for Irfan. */
export const CURRENT_WEEK_BEHAVIOUR: Record<AthleteId, WeekBehaviour> = {
  amir: {},
  danial: {},
  irfan: {
    slots: { '1:bike': at(135), '2:bike': at(130), '3:bike': at(135), '5:bike': at(135) },
    extras: [
      { day: 0, sport: 'bike', startMinute: 360, durationMin: 120, intensity: 0.8, title: 'Bike: Extra hill ride' },
      { day: 2, sport: 'bike', startMinute: 1110, durationMin: 90, intensity: 0.85, title: 'Bike: Evening climb' },
    ],
  },
};
