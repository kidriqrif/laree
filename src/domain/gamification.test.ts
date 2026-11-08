import { describe, expect, it } from 'vitest';
import type { Activity, CheckIn, Kudos, Phase, PlannedWorkout, Race, Sport, Threshold } from './types.ts';
import {
  badges,
  lap,
  lapText,
  plannedHoursText,
  seenAfterReset,
  streak,
  streakFromWeeks,
  unseenAwards,
  weekStatus,
} from './gamification.ts';
import type { GamificationInput, WeekExcuse } from './gamification.ts';

function pw(id: string, day: number, over: Partial<PlannedWorkout> = {}): PlannedWorkout {
  return {
    id,
    athleteId: 'amir',
    day,
    order: 1,
    sport: 'bike',
    title: id,
    steps: [{ id: 's', kind: 'steady', durationS: 3600 }],
    plannedDurationS: 3600,
    plannedLoad: 60,
    keySession: false,
    ...over,
  };
}

type ActOver = Partial<Omit<Activity, 'summary' | 'load'>> & { durationS?: number; distanceM?: number; load?: number };

function act(id: string, day: number, over: ActOver = {}): Activity {
  const { durationS = 3600, distanceM, load = 60, ...rest } = over;
  return {
    id,
    athleteId: 'amir',
    day,
    startMinute: 360,
    sport: 'bike',
    title: id,
    source: 'file',
    summary: { durationS, movingTimeS: durationS, ...(distanceM === undefined ? {} : { distanceM }) },
    load: { load, method: 'duration', confidence: 'medium', intensity: null },
    ...rest,
  };
}

function inp(today: number, over: Partial<GamificationInput> = {}): GamificationInput {
  return {
    athleteId: 'amir',
    today,
    planned: [],
    activities: [],
    checkIns: [],
    kudos: [],
    thresholds: [],
    races: [],
    phases: [],
    excuses: [],
    ...over,
  };
}

const keys = (i: GamificationInput) => badges(i).map((b) => b.key);
const notLap = (i: GamificationInput) => keys(i).filter((k) => k !== 'full-lap');
const excuse = (week: number, reason: WeekExcuse['reason'] = 'ill'): WeekExcuse => ({
  athleteId: 'amir',
  week,
  reason,
  note: '',
  day: 7 * week,
});

/** Three 60-load sessions on Tue, Thu, Sat of `week`, all done unless `skip` lists indexes. */
function simpleWeek(week: number, over: { skip?: number[]; sport?: Sport; loads?: number[] } = {}) {
  const first = 7 * (week - 1);
  const planned: PlannedWorkout[] = [];
  const activities: Activity[] = [];
  [1, 3, 5].forEach((d, i) => {
    planned.push(pw(`p${week}-${i}`, first + d, { sport: over.sport ?? 'bike' }));
    if (!over.skip?.includes(i)) {
      activities.push(act(`a${week}-${i}`, first + d, { sport: over.sport ?? 'bike', load: over.loads?.[i] ?? 60 }));
    }
  });
  return { planned, activities };
}

function roundTo(x: number): number {
  return Math.round(x * 10) / 10;
}

describe('streak loop (S1 to S6)', () => {
  const r = (rows: Array<{ wc: number | null; excused?: boolean }>) => streakFromWeeks(rows);
  it('S1', () => {
    const s = r([{ wc: 85 }, { wc: 90 }, { wc: 82 }]);
    expect([s.current, s.best]).toEqual([3, 3]);
  });
  it('S2 rounds 79.94 down', () => {
    const s = r([{ wc: 85 }, { wc: 79.94 }, { wc: 90 }]);
    expect([s.current, s.best]).toEqual([1, 1]);
  });
  it('S3 rounds 79.95 up', () => {
    expect(r([{ wc: 85 }, { wc: 79.95 }, { wc: 90 }]).current).toBe(3);
  });
  it('S4 and S5 an excused week pauses, never adds', () => {
    expect(r([{ wc: 85 }, { wc: 31, excused: true }, { wc: 88 }])).toMatchObject({ current: 2, best: 2 });
    expect(r([{ wc: 85 }, { wc: 95, excused: true }, { wc: 88 }]).current).toBe(2);
  });
  it('S6 no plan pauses', () => {
    expect(r([{ wc: 85 }, { wc: null }, { wc: 88 }]).current).toBe(2);
  });
  it('a below week ends the streak and keeps best', () => {
    const s = r([{ wc: 85 }, { wc: 90 }, { wc: 50 }, { wc: 90 }]);
    expect([s.current, s.best]).toEqual([1, 2]);
  });
  it('status order: no plan before excused', () => {
    expect(weekStatus(null, true)).toBe('noPlan');
    expect(weekStatus(90, true)).toBe('excused');
  });
});

describe('streak from real weeks (S7 to S10)', () => {
  const sessions: Array<[number, number]> = [[1, 75], [2, 35], [3, 65], [5, 180], [6, 50]];
  const planned = sessions.map(([d, l], i) => pw(`p${i}`, d, { plannedLoad: l }));
  const done = sessions.map(([d, l], i) => act(`a${i}`, d, { load: l }));

  it('S7 extra Monday run still counts', () => {
    const extra = act('x', 0, { sport: 'run', load: 42, durationS: 2700 });
    const s = streak(inp(7, { planned, activities: [...done, extra] }));
    expect(s.weeks[0]?.wc).toBeCloseTo(85.7, 1);
    expect(s.weeks[0]?.status).toBe('counted');
    expect(s.current).toBe(1);
  });
  it('S8 extra training on both rest days ends it', () => {
    const extras = [act('x', 0, { sport: 'run', load: 42 }), act('y', 4, { sport: 'run', load: 42 })];
    const s = streak(inp(7, { planned, activities: [...done, ...extras] }));
    expect(s.weeks[0]?.wc).toBeCloseTo(71.4, 1);
    expect(s.weeks[0]?.status).toBe('below');
    expect(s.current).toBe(0);
  });
  it('S9 down week with a missed session still counts', () => {
    const s = streak(inp(7, simpleWeek(1, { skip: [2] })));
    expect(s.weeks[0]?.wc).toBeCloseTo(85.7, 1);
    expect(s.current).toBe(1);
  });
  it('S10 sixteen counted weeks, week 17 in progress', () => {
    const planned17: PlannedWorkout[] = [];
    const activities17: Activity[] = [];
    for (let w = 1; w <= 16; w++) {
      const s = simpleWeek(w);
      planned17.push(...s.planned);
      activities17.push(...s.activities);
    }
    planned17.push(pw('p17', 112));
    const res = streak(inp(113, { planned: planned17, activities: activities17 }));
    expect(res.current).toBe(16);
    expect(res.best).toBe(16);
    expect(res.weeks).toHaveLength(16);
    expect(res.soFar).toBe(0);
  });
  it('soFar is null before anything is due', () => {
    expect(streak(inp(0, { planned: [pw('p', 0)] })).soFar).toBeNull();
  });
  it('reports excused weeks', () => {
    const w = simpleWeek(1, { skip: [0, 1, 2] });
    const s = streak(inp(7, { ...w, excuses: [excuse(1)] }));
    expect(s.weeks[0]?.status).toBe('excused');
    expect(s.current).toBe(0);
  });
});

describe('distance badges', () => {
  const ride = (n: number, km: number, dur = 3600) =>
    act(`a${n}`, [1, 3, 5][n] as number, { distanceM: km * 1000, durationS: dur });
  const plan3 = [1, 3, 5].map((d, i) => pw(`p${i}`, d));
  it('B1 100 km week on Saturday', () => {
    const b = badges(inp(7, { planned: plan3, activities: [ride(0, 40), ride(1, 35), ride(2, 30)] }));
    expect(b.filter((x) => x.key === 'bike-100')).toHaveLength(1);
    expect(b[0]).toMatchObject({ key: 'bike-100', earnedDay: 5, sourceItemId: 'a2', id: 'amir:bike-100' });
  });
  it('B2 over-plan ride is scaled back', () => {
    expect(notLap(inp(7, { planned: plan3, activities: [ride(0, 30), ride(1, 30), ride(2, 45, 5400)] }))).toEqual([]);
  });
  it('B3 unplanned ride credits nothing', () => {
    expect(notLap(inp(7, { activities: [act('u', 2, { distanceM: 110_000 })] }))).toEqual([]);
  });
  it('B4 compares as displayed', () => {
    const p = [pw('p', 1)];
    expect(notLap(inp(7, { planned: p, activities: [act('a', 1, { distanceM: 99_960 })] }))).toEqual(['bike-100']);
    expect(notLap(inp(7, { planned: p, activities: [act('a', 1, { distanceM: 99_940 })] }))).toEqual([]);
  });
  it('B5 swim week on the second swim', () => {
    const planned = [pw('p0', 1, { sport: 'swim' }), pw('p1', 3, { sport: 'swim' })];
    const activities = [
      act('s0', 1, { sport: 'swim', distanceM: 2400 }),
      act('s1', 3, { sport: 'swim', distanceM: 2600 }),
    ];
    const b = badges(inp(7, { planned, activities }));
    expect(b[0]).toMatchObject({ key: 'swim-5', earnedDay: 3, sourceItemId: 's1' });
  });
  it('unmeasured workouts credit in full', () => {
    const planned = [pw('p', 2, { sport: 'run', plannedDurationS: 0, plannedLoad: 0 })];
    const a = act('r', 2, { sport: 'run', distanceM: 50_000, durationS: 0 });
    expect(notLap(inp(7, { planned, activities: [a] }))).toEqual(['run-50']);
  });
  it('an activity with no distance credits nothing', () => {
    expect(notLap(inp(7, { planned: [pw('p', 1)], activities: [act('a', 1)] }))).toEqual([]);
  });
});

describe('first brick (B6, B7)', () => {
  const mk = (runStart: number, runDur = 1200, rideDur = 5400, plannedRun = true) =>
    inp(7, {
      planned: [
        pw('pr', 1, { startMinute: 420 }),
        ...(plannedRun
          ? [pw('pn', 1, { sport: 'run', startMinute: runStart, order: 2, plannedDurationS: runDur })]
          : []),
      ],
      activities: [
        act('ride', 1, { startMinute: 420, durationS: rideDur }),
        act('run', 1, { sport: 'run', startMinute: runStart, durationS: runDur }),
      ],
    });
  it('B6', () => {
    const b = badges(mk(520));
    expect(b).toHaveLength(1);
    expect(b[0]).toMatchObject({ key: 'first-brick', sourceItemId: 'run', earnedDay: 1 });
  });
  it('B7 each failing variant', () => {
    expect(keys(mk(526))).toEqual([]);
    expect(keys(mk(520, 540))).toEqual([]);
    expect(keys(mk(520, 1200, 1740))).toEqual([]);
    expect(keys(mk(520, 1200, 5400, false))).toEqual([]);
  });
  it('a run before the ride is not a brick', () => {
    expect(keys(mk(400))).toEqual([]);
  });
});

describe('new threshold (B8 to B11)', () => {
  const th = (kind: Threshold['kind'], value: number, day: number): Threshold => ({
    athleteId: 'amir',
    kind,
    value,
    effectiveFromDay: day,
    source: 'seed',
  });
  const pace = (m: number, s: number) => 1000 / (m * 60 + s);
  it('B8', () => {
    const b = badges(inp(100, { thresholds: [th('ftp', 245, 0), th('ftp', 255, 56)] }));
    expect(b).toHaveLength(1);
    expect(b[0]).toMatchObject({ key: 'new-threshold', earnedDay: 56, line: 'FTP up from 245 W to 255 W.' });
  });
  it('B9', () => {
    expect(badges(inp(100, { thresholds: [245, 255, 250, 255].map((v, i) => th('ftp', v, i * 10)) }))).toHaveLength(1);
    const two = badges(inp(100, { thresholds: [245, 255, 250, 260].map((v, i) => th('ftp', v, i * 10)) }));
    expect(two.map((a) => a.line)).toEqual(['FTP up from 245 W to 255 W.', 'FTP up from 255 W to 260 W.']);
    expect(new Set(two.map((a) => a.id)).size).toBe(2);
  });
  it('B10 pace beats on fewer seconds, CSS tie does not', () => {
    const b = badges(
      inp(100, {
        thresholds: [
          th('thresholdPace', pace(3, 58), 0),
          th('thresholdPace', pace(3, 57), 20),
          th('css', 100 / 108, 0),
          th('css', 100 / 108, 20),
        ],
      }),
    );
    expect(b).toHaveLength(1);
    expect(b[0]?.line).toBe('Threshold pace faster from 3:58 to 3:57.');
  });
  it('B11 future effective day waits', () => {
    const t = [th('ftp', 245, 0), th('ftp', 260, 51)];
    expect(badges(inp(50, { thresholds: t }))).toHaveLength(0);
    expect(badges(inp(51, { thresholds: t }))).toHaveLength(1);
  });
  it('LTHR and resting heart rate never count; other athletes are ignored', () => {
    const t = [th('lthr', 160, 0), th('lthr', 170, 10), th('restingHr', 50, 0), th('restingHr', 45, 10)];
    expect(badges(inp(100, { thresholds: t }))).toHaveLength(0);
    const other = [
      { ...th('ftp', 245, 0), athleteId: 'irfan' as const },
      { ...th('ftp', 300, 5), athleteId: 'irfan' as const },
    ];
    expect(badges(inp(100, { thresholds: other }))).toHaveLength(0);
  });
});

describe('kudos and check-ins (B12, B13)', () => {
  const ku = (id: string, day: number, message?: string): Kudos => ({
    id,
    athleteId: 'amir',
    day,
    seenByAthlete: false,
    ...(message ? { message } : {}),
  });
  const ci = (day: number): CheckIn => ({ id: `c${day}`, athleteId: 'amir', day, sleepHours: 7, soreness: 2, mood: 4 });
  it('B12 first kudos only', () => {
    const b = badges(inp(60, { kudos: [ku('k2', 45), ku('k1', 40, 'Nice')] }));
    expect(b).toHaveLength(1);
    expect(b[0]).toMatchObject({ key: 'coach-kudos', earnedDay: 40, sourceItemId: 'k1', line: 'Nice' });
  });
  it('kudos in the future waits', () => {
    expect(keys(inp(10, { kudos: [ku('k', 40)] }))).toEqual([]);
  });
  it('B13 seven in a row, a gap resets', () => {
    const days = [0, 1, 2, 3, 4, 5, 7, 8, 9, 10, 11, 12, 13];
    const b = badges(inp(20, { checkIns: days.map(ci) }));
    expect(b).toHaveLength(1);
    expect(b[0]).toMatchObject({ key: 'check-in-7', earnedDay: 13 });
    expect(keys(inp(20, { checkIns: [0, 1, 2, 3, 4, 5].map(ci) }))).toEqual([]);
  });
});

describe('week badges (B14 to B20)', () => {
  const down = (...weeks: number[]): Phase[] => [
    {
      id: 'ph',
      athleteId: 'amir',
      kind: 'build',
      firstWeek: 1,
      lastWeek: 20,
      weeklyTargets: weeks.map((week) => ({ week, loadTarget: 100, hoursTarget: 3, downWeek: true })),
    },
  ];
  const withDuration = (a: Activity, s: number): Activity => ({ ...a, summary: { durationS: s, movingTimeS: s } });

  it('B14 full lap once, on the first Sunday', () => {
    const a = simpleWeek(1);
    const b = simpleWeek(2);
    const r = badges(inp(14, { planned: [...a.planned, ...b.planned], activities: [...a.activities, ...b.activities] }));
    expect(r.filter((x) => x.key === 'full-lap')).toEqual([expect.objectContaining({ earnedDay: 6 })]);
  });
  it('B15 failing variants', () => {
    const base = simpleWeek(1);
    const first = base.activities[0] as Activity;
    const rest = base.activities.slice(1);
    expect(keys(inp(7, { ...base, activities: [withDuration(first, 2876), ...rest] }))).toEqual([]);
    expect(keys(inp(7, { ...base, activities: [withDuration(first, 4324), ...rest] }))).toEqual([]);
    const extra = { ...base, activities: [...base.activities, act('x', 1, { startMinute: 1000, load: 45 })] };
    expect(keys(inp(7, extra))).toEqual([]);
  });
  it('a missed session or a trained rest day denies full lap', () => {
    expect(keys(inp(7, simpleWeek(1, { skip: [0] })))).toEqual([]);
    const w = simpleWeek(1);
    expect(keys(inp(7, { ...w, activities: [...w.activities, act('r', 0, { sport: 'run', load: 40 })] }))).toEqual([]);
  });
  it('B16 easy lap on a down week', () => {
    const w = simpleWeek(4, { skip: [2] });
    expect(badges(inp(28, { ...w, phases: down(4) }))).toEqual([
      expect.objectContaining({ key: 'easy-lap', earnedDay: 27 }),
    ]);
  });
  it('recovery phases count as down weeks; ordinary weeks do not', () => {
    const w = simpleWeek(4, { skip: [2] });
    const rec: Phase[] = [{ id: 'r', athleteId: 'amir', kind: 'recovery', firstWeek: 3, lastWeek: 5, weeklyTargets: [] }];
    expect(keys(inp(28, { ...w, phases: rec }))).toEqual(['easy-lap']);
    expect(keys(inp(28, w))).toEqual([]);
  });
  it('B17 bike lane at 135% denies easy lap but the week counts', () => {
    const w = simpleWeek(4, { loads: [81, 81, 81] });
    const i = inp(28, { ...w, phases: down(4) });
    expect(keys(i)).toEqual([]);
    expect(streak(i).weeks[3]?.status).toBe('counted');
    expect(lap(i, 4).caution).toBe(true);
  });
  it('B18 comeback the week after an ill excuse', () => {
    const w11 = simpleWeek(11, { skip: [0, 1, 2] });
    const w12 = simpleWeek(12);
    const r = badges(
      inp(84, { planned: [...w11.planned, ...w12.planned], activities: w12.activities, excuses: [excuse(11)] }),
    );
    expect(r.filter((x) => x.key === 'comeback')).toEqual([expect.objectContaining({ earnedDay: 83 })]);
  });
  it('B19 comeback waits for a counted week', () => {
    const w11 = simpleWeek(11, { skip: [0, 1, 2] });
    const w12 = simpleWeek(12, { skip: [0, 1] });
    const w13 = simpleWeek(13);
    const r = badges(
      inp(91, {
        planned: [...w11.planned, ...w12.planned, ...w13.planned],
        activities: [...w12.activities, ...w13.activities],
        excuses: [excuse(11, 'injured')],
      }),
    );
    expect(r.filter((x) => x.key === 'comeback')).toEqual([expect.objectContaining({ earnedDay: 90 })]);
  });
  it('B20 a life excuse earns no comeback', () => {
    const w11 = simpleWeek(11, { skip: [0, 1, 2] });
    const w12 = simpleWeek(12);
    const i = inp(84, { planned: [...w11.planned, ...w12.planned], activities: w12.activities, excuses: [excuse(11, 'life')] });
    expect(keys(i)).not.toContain('comeback');
  });
  it('excused weeks earn nothing themselves', () => {
    expect(keys(inp(14, { ...simpleWeek(1), excuses: [excuse(1)] }))).toEqual([]);
  });
});

describe('race finisher (B21 to B23)', () => {
  const tri: Race = {
    id: 'r1',
    athleteId: 'amir',
    name: 'Tasik Olympic Tri',
    day: 30,
    sport: 'triathlon',
    distancesKm: [1.5, 40, 10],
    priority: 'A',
  };
  const legs = (swim: number, bike: number, run: number): Activity[] => [
    act('s', 30, { sport: 'swim', distanceM: swim * 1000 }),
    act('b', 30, { sport: 'bike', distanceM: bike * 1000 }),
    act('r', 30, { sport: 'run', distanceM: run * 1000 }),
  ];
  it('B21', () => {
    const b = badges(inp(40, { races: [tri], activities: legs(1.45, 40.3, 9.9) }));
    expect(b).toEqual([
      expect.objectContaining({
        key: 'race-finisher',
        id: 'amir:race-finisher:r1',
        earnedDay: 30,
        line: 'Finished Tasik Olympic Tri.',
      }),
    ]);
  });
  it('B22 short swim fails; a cancelled swim is skipped', () => {
    expect(keys(inp(40, { races: [tri], activities: legs(1.1, 40.3, 9.9) }))).toEqual([]);
    const cancelled = { ...tri, distancesKm: [0, 40, 10] };
    expect(keys(inp(40, { races: [cancelled], activities: legs(1.1, 40.3, 9.9) }))).toEqual(['race-finisher']);
  });
  it('B23 half marathon', () => {
    const hm: Race = { id: 'h', athleteId: 'amir', name: 'Half', day: 30, sport: 'run', distancesKm: [21.1], priority: 'B' };
    expect(keys(inp(40, { races: [hm], activities: [act('r', 30, { sport: 'run', distanceM: 16_800 })] }))).toEqual([]);
    expect(keys(inp(40, { races: [hm], activities: [act('r', 30, { sport: 'run', distanceM: 16_900 })] }))).toEqual([
      'race-finisher',
    ]);
  });
  it('future, foreign and empty races give nothing', () => {
    expect(keys(inp(20, { races: [tri], activities: legs(1.5, 40, 10) }))).toEqual([]);
    expect(keys(inp(40, { races: [{ ...tri, athleteId: 'irfan' }], activities: legs(1.5, 40, 10) }))).toEqual([]);
    expect(keys(inp(40, { races: [{ ...tri, distancesKm: [0, 0, 0] }], activities: legs(1.5, 40, 10) }))).toEqual([]);
    expect(keys(inp(40, { races: [{ ...tri, distancesKm: [] }] }))).toEqual([]);
  });
});

describe('B24 seen state', () => {
  it('a reset marks every award seen; later awards queue in order', () => {
    const w = simpleWeek(1);
    const checkIns: CheckIn[] = [0, 1, 2, 3, 4, 5, 6].map((d) => ({
      id: `c${d}`,
      athleteId: 'amir',
      day: d,
      sleepHours: 7,
      soreness: 2,
      mood: 3,
    }));
    const first = badges(inp(7, { ...w, checkIns }));
    expect(first.map((a) => a.key)).toEqual(['check-in-7', 'full-lap']);
    const seen = seenAfterReset(first);
    expect(seen['amir']).toEqual(first.map((a) => a.id));
    expect(unseenAwards(first, seen)).toEqual([]);
    expect(unseenAwards(first, {})).toEqual(first);
    expect(unseenAwards(first, { amir: [first[0]?.id as string] })).toEqual([first[1]]);
  });
  // The full table in gamification.md 4.5 needs the seed generator (T5.7), so it is checked there.
});

describe('lap', () => {
  // Amir on Wednesday (day 2): swim, bike and run lanes.
  const planned = [
    pw('sw', 0, { sport: 'swim', plannedLoad: 40, plannedDurationS: 3600 }),
    pw('bk', 1, { sport: 'bike', plannedLoad: 100, plannedDurationS: 7200 }),
    pw('bk2', 4, { sport: 'bike', plannedLoad: 100, plannedDurationS: 7200 }),
    pw('rn', 2, { sport: 'run', plannedLoad: 50, plannedDurationS: 3000 }),
    pw('rn2', 5, { sport: 'run', plannedLoad: 50, plannedDurationS: 3000 }),
  ];
  const activities = [
    act('a-sw', 0, { sport: 'swim', load: 20, durationS: 1800 }),
    act('a-bk', 1, { sport: 'bike', load: 80, durationS: 5400 }),
    act('a-rn', 2, { sport: 'run', load: 70, durationS: 3000 }),
  ];
  const base = inp(2, { planned, activities });

  it('lane fills, lights and numbers', () => {
    const l = lap(base, 1);
    expect(l.status).toBe('current');
    expect(l.lanes.map((x) => x.sport)).toEqual(['swim', 'bike', 'run']);
    const [sw, bk, rn] = l.lanes;
    expect(sw).toMatchObject({ pct: 50, fill: 0.5, light: 1, over: false });
    expect(bk).toMatchObject({ pct: 40, light: 0.5 });
    expect(rn).toMatchObject({ pct: 70, light: 0.5 });
    expect(l.lapPct).toBe(50);
    expect(l.expectedPct).toBe(roundTo((190 / 340) * 100));
    expect(l.caution).toBe(false);
  });
  it('text version', () => {
    const t = lapText(lap(base, 1));
    expect(t.short).toBe("This week's lap: 50% of planned load done, plan by today 55%. Swim 50%, bike 40%, run 70%.");
    expect(t.full).toEqual([
      'Swim: 50% of planned load, 0:30 of 1:00. Plan by today: 100%.',
      'Bike: 40% of planned load, 1:30 of 4:00. Plan by today: 50%.',
      'Run: 70% of planned load, 0:50 of 1:40. Plan by today: 50%.',
      'Rest days kept so far: 0 of 0.',
      expect.stringMatching(/^Weekly compliance so far: \d+%\.$/),
    ]);
  });
  it('overshoot earns nothing: fill and infield stop at the plan, caution shows', () => {
    const over = [...activities, act('x', 2, { sport: 'bike', load: 220, startMinute: 1000 })];
    const l = lap(inp(2, { planned, activities: over }), 1);
    const bike = l.lanes[1];
    expect(bike?.pct).toBe(150);
    expect(bike?.fill).toBe(1);
    expect(bike?.over).toBe(true);
    expect(l.lapPct).toBe(roundTo(((20 + 200 + 70) / 340) * 100));
    expect(l.caution).toBe(true);
    expect(lapText(l).short).toContain("Bike is at 150% of plan. That's more than planned. Coach can see it.");
    const exact = lap(inp(2, { planned, activities: [...activities, act('y', 2, { sport: 'bike', load: 40, startMinute: 1000 })] }), 1);
    expect(exact.lanes[1]?.pct).toBe(60);
  });
  it('unlaned sport raises the caution', () => {
    const swimOnly = inp(2, {
      planned: [pw('s', 0, { sport: 'swim', plannedLoad: 100 })],
      activities: [act('s', 0, { sport: 'swim', load: 100 }), act('w', 1, { sport: 'strength', load: 40 })],
    });
    const l = lap(swimOnly, 1);
    expect(l.unlaned).toEqual([{ sport: 'strength', doneLoad: 40 }]);
    expect(l.totalPct).toBe(140);
    expect(l.lanes[0]?.over).toBe(false);
    expect(l.caution).toBe(true);
    expect(lapText(l).short).toContain("Strength wasn't in this week's plan.");
  });
  it('past, future and no-plan states', () => {
    const past = lap(inp(10, { planned, activities }), 1);
    expect(past.status).toBe('past');
    expect(past.lanes.every((x) => x.light === null)).toBe(true);
    expect(past.expectedPct).toBeNull();
    const t = lapText(past);
    expect(t.short).not.toContain('plan by today');
    expect(t.full.some((s) => s.startsWith('Rest days'))).toBe(false);
    const future = lap(inp(-3, { planned, activities: [] }), 1);
    expect(future.status).toBe('future');
    expect(plannedHoursText(future)).toBe('6:40 h');
    const none = lap(base, 5);
    expect(none.status).toBe('noPlan');
    expect(lapText(none).short).toBe('No plan this week.');
  });
  it('marks excused and full-lap past weeks', () => {
    const w = simpleWeek(1);
    expect(lap(inp(7, w), 1).fullLap).toBe(true);
    expect(lap(inp(7, { ...w, excuses: [excuse(1)] }), 1)).toMatchObject({ excused: true, fullLap: false });
    expect(lap(inp(5, w), 1).fullLap).toBe(false);
  });
});
