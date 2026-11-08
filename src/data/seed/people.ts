/** People, thresholds and races for the seed. All fictional. Dates are day offsets. */
import type { LoadThresholds } from '../../domain/metrics/load.ts';
import type { Athlete, AthleteId, Coach, DayOffset, Race, Threshold } from '../../domain/types.ts';

export const ATHLETE_IDS: readonly AthleteId[] = ['amir', 'danial', 'irfan'];

/** History weeks 1 to 16; the current week is 17; the plan runs 12 weeks beyond it. */
export const HISTORY_LAST_WEEK = 16;
export const CURRENT_WEEK = 17;
/**
 * Last planned week. The brief says "12 weeks of plan" and "+n" counts from the current week,
 * so Danial's marathon at +12 is week 29. The plan therefore covers the current week plus the
 * 12 weeks after it (weeks 17 to 29), so every race lands inside it.
 */
export const PLAN_LAST_WEEK = 29;

export const weekFirstDay = (week: number): DayOffset => 7 * (week - 1);

export const COACH: Coach = { id: 'coach', displayName: 'Coach' };

export const ATHLETES: Athlete[] = [
  {
    id: 'amir',
    name: 'Amir',
    sports: ['swim', 'bike', 'run', 'strength'],
    weightKg: 72,
    baselines: { restingHr: 48, hrvMs: 72 },
  },
  {
    id: 'danial',
    name: 'Danial',
    sports: ['run', 'strength'],
    weightKg: 63,
    baselines: { restingHr: 44, hrvMs: 88 },
  },
  {
    id: 'irfan',
    name: 'Irfan',
    sports: ['bike', 'strength'],
    weightKg: 64,
    baselines: { restingHr: 50, hrvMs: 65 },
  },
];

/** Seconds per kilometre to metres per second. */
const paceSpeed = (sPerKm: number): number => 1000 / sPerKm;
/** Seconds per 100 m to metres per second. */
const cssSpeed = (sPer100m: number): number => 100 / sPer100m;

/** FTP rises on the Monday of history week 9. */
export const AMIR_FTP_RISE_DAY = weekFirstDay(9);

function th(
  athleteId: AthleteId,
  kind: Threshold['kind'],
  value: number,
  effectiveFromDay = 0,
  source: Threshold['source'] = 'seed',
): Threshold {
  return { athleteId, kind, value, effectiveFromDay, source };
}

export const THRESHOLDS: Threshold[] = [
  th('amir', 'ftp', 245),
  th('amir', 'ftp', 255, AMIR_FTP_RISE_DAY, 'coachEdit'),
  th('amir', 'thresholdPace', paceSpeed(265)),
  th('amir', 'css', cssSpeed(108)),
  th('amir', 'lthr', 166),
  th('amir', 'restingHr', 48),
  th('danial', 'thresholdPace', paceSpeed(238)),
  th('danial', 'lthr', 173),
  th('danial', 'restingHr', 44),
  th('irfan', 'ftp', 280),
  th('irfan', 'lthr', 168),
  th('irfan', 'restingHr', 50),
];

/** Thresholds in force for an athlete on a day, in the units the load engine takes. */
export function thresholdsOn(
  athleteId: AthleteId,
  day: DayOffset,
  all: readonly Threshold[] = THRESHOLDS,
): LoadThresholds {
  const latest = (kind: Threshold['kind']): number | undefined => {
    let best: Threshold | undefined;
    for (const t of all) {
      if (t.athleteId !== athleteId || t.kind !== kind || t.effectiveFromDay > day) continue;
      if (!best || t.effectiveFromDay >= best.effectiveFromDay) best = t;
    }
    return best?.value;
  };
  const out: LoadThresholds = {};
  const ftp = latest('ftp');
  const pace = latest('thresholdPace');
  const css = latest('css');
  const lthr = latest('lthr');
  const rhr = latest('restingHr');
  if (ftp !== undefined) out.ftp = ftp;
  if (pace !== undefined) out.thresholdPaceSPerKm = 1000 / pace;
  if (css !== undefined) out.cssSPer100m = 100 / css;
  if (lthr !== undefined) out.lthr = lthr;
  if (rhr !== undefined) out.restingHr = rhr;
  return out;
}

/** The Sunday of a week (races are on Sundays, B and C races on Saturdays). */
const sunday = (week: number): DayOffset => weekFirstDay(week) + 6;
const saturday = (week: number): DayOffset => weekFirstDay(week) + 5;

/** "+n" is n weeks after the current week 17. */
const ahead = (n: number): number => CURRENT_WEEK + n;

export const RACES: Race[] = [
  {
    id: 'amir-teluk-half',
    athleteId: 'amir',
    name: 'Teluk Half',
    day: sunday(ahead(10)),
    sport: 'triathlon',
    distancesKm: [1.9, 90, 21.1],
    priority: 'A',
    goalTimeS: 5 * 3600 + 20 * 60,
  },
  {
    id: 'amir-tasik-olympic',
    athleteId: 'amir',
    name: 'Tasik Olympic Tri',
    day: saturday(ahead(4)),
    sport: 'triathlon',
    distancesKm: [1.5, 40, 10],
    priority: 'B',
    goalTimeS: 2 * 3600 + 30 * 60,
  },
  {
    id: 'danial-kota-marathon',
    athleteId: 'danial',
    name: 'Kota Marathon',
    day: sunday(ahead(12)),
    sport: 'run',
    distancesKm: [42.2],
    priority: 'A',
    goalTimeS: 2 * 3600 + 59 * 60,
  },
  {
    id: 'danial-bukit-half',
    athleteId: 'danial',
    name: 'Bukit Half',
    day: sunday(ahead(6)),
    sport: 'run',
    distancesKm: [21.1],
    priority: 'B',
    goalTimeS: 1 * 3600 + 22 * 60,
  },
  {
    id: 'irfan-cameron-gran-fondo',
    athleteId: 'irfan',
    name: 'Cameron Gran Fondo',
    day: sunday(ahead(9)),
    sport: 'bike',
    distancesKm: [160],
    climbingM: 2400,
    priority: 'A',
    goalTimeS: 6 * 3600 + 15 * 60,
  },
  {
    id: 'irfan-bukit-tinggi-hill-climb',
    athleteId: 'irfan',
    name: 'Bukit Tinggi Hill Climb',
    day: saturday(ahead(3)),
    sport: 'bike',
    distancesKm: [21],
    climbingM: 1000,
    priority: 'C',
    goalTimeS: 1 * 3600 + 5 * 60,
  },
];

