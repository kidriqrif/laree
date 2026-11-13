/** Morning check-ins, with the scripted stories from docs/spec/checkins-flags.md "Demo coverage". */
import type { AthleteId, CheckIn, DayOffset } from '../../domain/types.ts';
import { ATHLETES, weekFirstDay } from './people.ts';
import { clamped, gauss, rngFor } from './rng.ts';

/** A check-in as the seed stores it: the domain CheckIn plus the optional unwell marker. */
export interface SeedCheckIn extends CheckIn {
  unwell?: { kind: 'ill' | 'injured'; note: string };
}

const NOTES = [
  'Calves a bit tight.',
  'Slept badly, woke twice.',
  'Feeling fresh.',
  'Long day at work yesterday.',
  'Legs heavy on the stairs.',
  'Good energy this morning.',
];

/** Days when a check-in is always present or always absent. */
function forced(athleteId: AthleteId): { present: (d: DayOffset) => boolean; absent: (d: DayOffset) => boolean } {
  if (athleteId === 'irfan') {
    return {
      // Seven mornings in a row first happen on the Sunday of week 3 (day 20).
      present: (d) => d >= 14 && d <= 20,
      absent: (d) => d === 6 || d === 13,
    };
  }
  return { present: (d) => d <= 6, absent: () => false };
}

/** Danial's sick week 11: days 70 (Monday) to 76 (Sunday). */
const DANIAL_RHR_ADD: Record<number, number> = { 70: 5, 71: 9, 72: 10, 73: 9, 74: 8, 75: 8, 76: 7, 77: 3, 78: 2 };
const DANIAL_HRV: Record<number, number> = {
  70: 80, 71: 66, 72: 62, 73: 64, 74: 68, 75: 70, 76: 74,
  77: 84, 78: 88, 79: 91, 80: 92, 81: 91, 82: 90, 83: 89,
};
const SICK_FIRST = 71;
const SICK_LAST = 76;

interface Override {
  sleepHours?: number;
  soreness?: number;
  mood?: number;
  note?: string;
}

/**
 * One-off stories in the history so every flag rule fires at least once in the 16 weeks.
 * Two nights of short sleep, two days of high soreness, and a low-mood morning under heavy load.
 */
const HISTORY_STORIES: Record<AthleteId, Record<number, Override>> = {
  amir: {
    40: { sleepHours: 5.4, note: 'Baby was up most of the night.' },
    41: { sleepHours: 5.6 },
  },
  danial: {
    62: { soreness: 4 },
    63: { soreness: 4, note: 'Calves very tight after the hill session.' },
  },
  irfan: {
    109: { mood: 2, note: 'Flat and tired. Too many rides this week.' },
  },
};

export function buildCheckIns(athleteId: AthleteId, today: DayOffset): SeedCheckIn[] {
  const athlete = ATHLETES.find((a) => a.id === athleteId);
  if (!athlete) return [];
  const rng = rngFor('checkin', athleteId);
  const rule = forced(athleteId);
  const out: SeedCheckIn[] = [];
  const storyFrom = weekFirstDay(17) - 1;
  const danialSick = athleteId === 'danial';

  for (let day = 0; day <= today; day++) {
    // Draw first so the stream stays the same whatever is forced.
    const presentRoll = rng();
    const sleepRoll = clamped(rng, 7.3, 0.45, 6.4, 8.6);
    const rhrNoise = gauss(rng);
    const hrvNoise = gauss(rng);
    const sorenessRoll = rng();
    const moodRoll = rng();
    const noteRoll = rng();
    const noteIndex = rng();

    const sickWindow = danialSick && day >= 69 && day <= 84;
    const story = HISTORY_STORIES[athleteId][day];
    const present = rule.present(day) || sickWindow || story !== undefined || (!rule.absent(day) && presentRoll < 0.88);
    if (!present) continue;
    // The demo's missing check-in: Danial has not checked in yet this morning. Monday keeps it,
    // because his open soreness flag opens that day from two high mornings in a row.
    if (athleteId === 'danial' && day === today && today > weekFirstDay(17)) continue;

    let sleepHours = Math.round(sleepRoll * 10) / 10;
    let soreness = sorenessRoll < 0.25 ? 1 : sorenessRoll < 0.8 ? 2 : 3;
    let mood = moodRoll < 0.15 ? 3 : moodRoll < 0.6 ? 4 : 5;
    let restingHr = Math.round(athlete.baselines.restingHr + rhrNoise * 1.3);
    let hrvMs = Math.round(athlete.baselines.hrvMs * (1 + hrvNoise * 0.045));
    let note: string | undefined = noteRoll < 0.08 ? NOTES[Math.floor(noteIndex * NOTES.length)] : undefined;
    let unwell: SeedCheckIn['unwell'];

    if (danialSick && day >= 70 && day <= 84) {
      const add = DANIAL_RHR_ADD[day];
      if (add !== undefined) restingHr = athlete.baselines.restingHr + add;
      const hrv = DANIAL_HRV[day];
      if (hrv !== undefined) hrvMs = hrv;
      if (day >= 70 && day <= 76) {
        soreness = 3;
        mood = 2;
      }
      if (day >= SICK_FIRST && day <= SICK_LAST) {
        unwell = { kind: 'ill', note: 'Fever and a heavy cold.' };
        if (day === SICK_FIRST) note = 'Woke up with a fever. Skipping training.';
      }
    }

    if (story) {
      if (story.sleepHours !== undefined) sleepHours = story.sleepHours;
      if (story.soreness !== undefined) soreness = story.soreness;
      if (story.mood !== undefined) mood = story.mood;
      if (story.note) note = story.note;
    }

    // Current-week stories. Each runs from the Sunday before the week through today.
    if (day >= storyFrom) {
      const bad = 5.2 + 0.1 * ((day * 7) % 6);
      if (athleteId === 'amir' || athleteId === 'irfan') sleepHours = Math.round(bad * 10) / 10;
      if (athleteId === 'danial') {
        soreness = day === storyFrom ? 4 : 4 + (day % 2);
        note = day === storyFrom + 1 ? 'Quads sore after the long run. Marathon block is biting.' : note;
      }
      if (athleteId === 'amir' && day === storyFrom + 1) note = 'Late shifts all week, not sleeping enough.';
      if (athleteId === 'irfan' && day === storyFrom + 1) note = 'Legs tired. Climbing block is hard.';
    }

    const c: SeedCheckIn = {
      id: `${athleteId}-c-${day}`,
      athleteId,
      day,
      sleepHours,
      soreness,
      mood,
      restingHr,
      hrvMs,
    };
    if (note) c.note = note;
    if (unwell) c.unwell = unwell;
    out.push(c);
  }
  return out;
}
