/** Plan helpers: phases worked back from the A race, and weekly targets. Pure. */
import { weekOfDay } from './time.ts';
import type { Phase, PhaseKind, Race, WeeklyTarget } from './types.ts';

export interface DeriveOptions {
  /** First plan week; phases are cut off here. Default 1. */
  firstWeek?: number;
  /** Load in a typical up week of base. Default 300. */
  baseLoad?: number;
  /** Hours in a typical up week of base. Default 8. */
  baseHours?: number;
}

/** Block lengths in weeks, working back from race week (nearest the race first). */
const LENGTHS: { kind: PhaseKind; weeks: number }[] = [
  { kind: 'taper', weeks: 2 },
  { kind: 'peak', weeks: 3 },
  { kind: 'build', weeks: 6 },
];
const RECOVERY_WEEKS = 2;
const BASE_WEEKS = 8;

/** Share of base load by phase kind. */
const PHASE_FACTOR: Record<PhaseKind, number> = {
  base: 1,
  build: 1.2,
  peak: 1.35,
  taper: 0.7,
  race: 0.5,
  recovery: 0.4,
};

/** Within a 4-week cycle, up weeks climb by 5% each. */
const UP_STEP = 0.05;
const DOWN_FACTOR = 0.7;

/** Every fourth week, counted from week 1, is a down week. */
export function isDownWeek(week: number): boolean {
  return week % 4 === 0;
}

/** Targets for each week in a range: three weeks up, one down. */
export function weeklyTargets(
  kind: PhaseKind,
  firstWeek: number,
  lastWeek: number,
  baseLoad = 300,
  baseHours = 8,
): WeeklyTarget[] {
  const out: WeeklyTarget[] = [];
  const flat = kind === 'taper' || kind === 'race' || kind === 'recovery';
  for (let week = firstWeek; week <= lastWeek; week++) {
    const down = isDownWeek(week);
    const climb = flat ? 1 : 1 + UP_STEP * ((week - 1) % 4);
    const f = PHASE_FACTOR[kind] * (down ? DOWN_FACTOR : climb);
    const t: WeeklyTarget = {
      week,
      loadTarget: Math.round(baseLoad * f),
      hoursTarget: Math.round(baseHours * f * 2) / 2,
    };
    if (down) t.downWeek = true;
    out.push(t);
  }
  return out;
}

/**
 * Phases worked back from an A race: taper, peak, build and base, then race week and
 * recovery after. B and C races never move phases, so they give an empty list.
 */
export function derivePhases(race: Race, opts: DeriveOptions = {}): Phase[] {
  if (race.priority !== 'A') return [];
  const first = opts.firstWeek ?? 1;
  const raceWeek = weekOfDay(race.day);
  const blocks: { kind: PhaseKind; a: number; b: number }[] = [];
  let end = raceWeek - 1;
  for (const { kind, weeks } of LENGTHS) {
    blocks.unshift({ kind, a: end - weeks + 1, b: end });
    end -= weeks;
  }
  blocks.unshift({ kind: 'base', a: end - BASE_WEEKS + 1, b: end });
  blocks.push({ kind: 'race', a: raceWeek, b: raceWeek });
  blocks.push({ kind: 'recovery', a: raceWeek + 1, b: raceWeek + RECOVERY_WEEKS });

  const phases: Phase[] = [];
  for (const blk of blocks) {
    const a = Math.max(blk.a, first);
    if (blk.b < a) continue;
    phases.push({
      id: `${race.athleteId}-${blk.kind}-${a}`,
      athleteId: race.athleteId,
      kind: blk.kind,
      firstWeek: a,
      lastWeek: blk.b,
      weeklyTargets: weeklyTargets(blk.kind, a, blk.b, opts.baseLoad, opts.baseHours),
    });
  }
  return phases;
}
