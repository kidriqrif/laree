import { describe, expect, it } from 'vitest';
import type { Activity, LoadMethod, PlannedWorkout, Sport, Step } from '../types.ts';
import {
  BAND_LABELS,
  band,
  compliancePct,
  displayPct,
  evaluateCompliance,
  loadSourceOf,
  matchWorkouts,
  roundHalfAway,
  sessionCompliance,
  weeklyCompliance,
} from './compliance.ts';

const targeted: Step[] = [
  { id: 's', kind: 'steady', durationS: 3600, target: { kind: 'pctFtp', low: 80, high: 90 } },
];
const untargeted: Step[] = [{ id: 's', kind: 'steady', durationS: 3600 }];

function pw(id: string, day: number, over: Partial<PlannedWorkout> = {}): PlannedWorkout {
  return {
    id,
    athleteId: 'amir',
    day,
    order: 1,
    sport: 'bike',
    title: id,
    steps: untargeted,
    plannedDurationS: 3600,
    plannedLoad: 60,
    keySession: false,
    ...over,
  };
}

type ActOver = Omit<Partial<Activity>, 'load' | 'sport'> & { method?: LoadMethod; load?: number; durationS?: number; sport?: Sport };

function act(id: string, day: number, over: ActOver = {}): Activity {
  const { method = 'power', load = 60, durationS = 3600, sport = 'bike', ...rest } = over;
  return {
    id,
    athleteId: 'amir',
    day,
    startMinute: 360,
    sport,
    title: id,
    source: 'file',
    summary: { durationS, movingTimeS: durationS },
    load: { load, method, confidence: 'high', intensity: null },
    ...rest,
  };
}

describe('bands', () => {
  it.each([
    [49.9, 'short'],
    [50, 'under'],
    [79.9, 'under'],
    [80, 'onPlan'],
    [120, 'onPlan'],
    [120.1, 'over'],
    [150, 'over'],
    [150.1, 'wellOver'],
  ] as const)('%s -> %s', (pct, expected) => {
    expect(band(pct)).toBe(expected);
  });

  it('60 min planned edges (vector 13)', () => {
    const rows: Array<[number, number, string, number]> = [
      [29.94, 49.9, 'short', 49],
      [30, 50, 'under', 50],
      [47.94, 79.9, 'under', 79],
      [48, 80, 'onPlan', 80],
      [72, 120, 'onPlan', 120],
      [72.06, 120.1, 'over', 121],
      [90, 150, 'over', 150],
      [90.06, 150.1, 'wellOver', 151],
    ];
    for (const [done, pct, b, shown] of rows) {
      const p = compliancePct(done, 60);
      expect(p).toBe(pct);
      expect(band(p)).toBe(b);
      expect(displayPct(p)).toBe(shown);
    }
    expect(displayPct(100)).toBe(100);
  });

  it('labels and rounding', () => {
    expect(BAND_LABELS.wellOver).toBe('Well over');
    expect(roundHalfAway(-2.5)).toBe(-3);
    expect(roundHalfAway(2.5)).toBe(3);
    expect(roundHalfAway(1.25, 1)).toBe(1.3);
  });
});

describe('matching', () => {
  it('nearest start wins, one to one', () => {
    const planned = [pw('p1', 1, { order: 1 }), pw('p2', 1, { order: 2 })];
    const acts = [
      act('a1', 1, { startMinute: 1000 }),
      act('a2', 1, { startMinute: 400 }),
      act('a3', 1, { startMinute: 1100 }),
    ];
    const m = matchWorkouts(planned, acts);
    expect(m.pairs).toContainEqual({ plannedId: 'p1', activityId: 'a2' });
    expect(m.pairs).toContainEqual({ plannedId: 'p2', activityId: 'a1' });
    expect(m.unplannedActivityIds).toEqual(['a3']);
    expect(m.unmatchedPlannedIds).toEqual([]);
  });
  it('uses startMinute when set, third workout at 18:00', () => {
    const planned = [pw('p1', 1, { order: 1 }), pw('p2', 1, { order: 2 }), pw('p3', 1, { order: 3 })];
    const m = matchWorkouts(planned, [act('a', 1, { startMinute: 1080 })]);
    expect(m.pairs).toEqual([{ plannedId: 'p3', activityId: 'a' }]);
    const m2 = matchWorkouts([pw('p', 1, { startMinute: 700 })], [act('a', 1, { startMinute: 705 })]);
    expect(m2.pairs).toHaveLength(1);
  });
  it('separates sports and days, ignores other', () => {
    const m = matchWorkouts(
      [pw('p', 1), pw('q', 2, { sport: 'run' }), pw('o', 3, { sport: 'other' })],
      [act('a', 1, { sport: 'run' }), act('b', 2, { sport: 'run' }), act('c', 3, { sport: 'other' })],
    );
    expect(m.pairs).toEqual([{ plannedId: 'q', activityId: 'b' }]);
    expect(m.unplannedActivityIds.toSorted()).toEqual(['a', 'c']);
    expect(m.unmatchedPlannedIds.toSorted()).toEqual(['o', 'p']);
  });
  it('brick matches each leg on its own', () => {
    const m = matchWorkouts(
      [pw('r', 1, { sport: 'bike' }), pw('u', 1, { sport: 'run', order: 2 })],
      [act('a', 1), act('b', 1, { sport: 'run', startMinute: 450 })],
    );
    expect(m.pairs).toHaveLength(2);
  });
  it('ties break on planned order', () => {
    const planned = [pw('p2', 1, { order: 2, startMinute: 600 }), pw('p1', 1, { order: 1, startMinute: 600 })];
    const m = matchWorkouts(planned, [act('a', 1, { startMinute: 600 })]);
    expect(m.pairs).toEqual([{ plannedId: 'p1', activityId: 'a' }]);
  });
});

describe('session compliance measure', () => {
  it('loadSource', () => {
    expect(loadSourceOf(pw('p', 1, { steps: targeted }))).toBe('steps');
    expect(loadSourceOf(pw('p', 1))).toBe('default');
    const rep: Step[] = [
      { id: 'r', kind: 'repeat', repeat: 3, steps: [{ id: 'i', kind: 'interval', durationS: 60, target: { kind: 'rpe', low: 7, high: 8 } }] },
    ];
    expect(loadSourceOf(pw('p', 1, { steps: rep }))).toBe('steps');
    const plainRep: Step[] = [{ id: 'r', kind: 'repeat', repeat: 2, steps: [{ id: 'i', kind: 'steady', durationS: 5 }] }];
    expect(loadSourceOf(pw('p', 1, { steps: plainRep }))).toBe('default');
  });
  it('compares load when plan has targets and activity load is measured', () => {
    const r = sessionCompliance(pw('p', 1, { steps: targeted }), act('a', 1, { load: 48 }));
    expect(r).toMatchObject({ measure: 'load', pct: 80, band: 'onPlan', shownPct: 80 });
  });
  it('falls back to duration for rough loads or default plans', () => {
    const w = pw('p', 1, { steps: targeted });
    const r = sessionCompliance(w, act('a', 1, { method: 'effort', load: 10, durationS: 1800 }));
    expect(r).toMatchObject({ measure: 'duration', pct: 50, band: 'under' });
    const r2 = sessionCompliance(pw('p', 1), act('a', 1, { load: 10, durationS: 4320 }));
    expect(r2).toMatchObject({ measure: 'duration', pct: 120, band: 'onPlan' });
  });
  it('falls back to distance', () => {
    const w = pw('p', 1, { plannedDurationS: 0, plannedDistanceM: 10000 });
    const a = act('a', 1, { durationS: 0 });
    a.summary.distanceM = 5000;
    expect(sessionCompliance(w, a)).toMatchObject({ measure: 'distance', pct: 50, band: 'under' });
  });
  it('unmeasured counts as 100', () => {
    const r = sessionCompliance(pw('p', 1, { plannedDurationS: 0 }), act('a', 1));
    expect(r).toMatchObject({ measure: 'none', pct: 100, band: 'onPlan', note: 'No shared measure' });
  });
});

describe('evaluateCompliance', () => {
  it('matched, open, missed, unplanned', () => {
    const planned = [pw('p1', 1), pw('p2', 2), pw('p3', 3)];
    const ev = evaluateCompliance(planned, [act('a1', 1), act('x', 5)], 3);
    expect(ev.planned.map((e) => [e.status, e.band])).toEqual([
      ['matched', 'onPlan'],
      ['missed', 'missed'],
      ['open', undefined],
    ]);
    expect(ev.unplannedActivityIds).toEqual(['x']);
  });
});

// Section 7.4 week: Mon rest; Tue 75; Wed 35; Thu 65; Fri rest; Sat 180; Sun 50. Week 1 = days 0-6.
const PLAN_DAYS: Array<[string, number, number, number]> = [
  ['tue', 1, 75, 4500],
  ['wed', 2, 35, 2100],
  ['thu', 3, 65, 3900],
  ['sat', 5, 180, 10800],
  ['sun', 6, 50, 3000],
];
const plan = PLAN_DAYS.map(([id, day, load, dur]) => pw(id, day, { plannedLoad: load, plannedDurationS: dur }));

function week(opts: { skip?: string[]; scale?: Record<string, number>; extra?: Activity[] }): number | null {
  const acts = PLAN_DAYS.filter(([id]) => !opts.skip?.includes(id)).map(([id, day, , dur]) =>
    act(id, day, { durationS: dur * (opts.scale?.[id] ?? 1), load: 10 }),
  );
  const all = [...acts, ...(opts.extra ?? [])];
  const ev = evaluateCompliance(plan, all, 100);
  return weeklyCompliance({ week: 1, planned: plan, evaluations: ev.planned, activities: all, todayDay: 100 });
}

describe('weekly compliance', () => {
  it('worked examples', () => {
    expect(week({})).toBeCloseTo(100, 6);
    expect(week({ skip: ['sat'] })).toBeCloseTo(68.254, 3);
    expect(week({ skip: ['wed'] })).toBeCloseTo(93.8, 1);
    expect(week({ scale: { sat: 0.75 } })).toBeCloseTo(92.1, 1);
    expect(week({ scale: { tue: 1.3, thu: 0.7 } })).toBeCloseTo(96.6, 1);
    expect(week({ extra: [act('r', 0, { sport: 'run', load: 42, durationS: 2700 })] })).toBeCloseTo(85.7, 1);
    expect(
      week({ extra: [act('r', 0, { sport: 'run', load: 42 }), act('r2', 4, { sport: 'run', load: 42 })] }),
    ).toBeCloseTo(71.4, 1);
  });
  it('a rest-day load of exactly 25 is kept', () => {
    expect(week({ extra: [act('w', 0, { sport: 'other', load: 25 })] })).toBeCloseTo(100, 6);
  });
  it('treats an unmeasured session as full credit', () => {
    const p = [pw('u', 0, { plannedDurationS: 0 })];
    const a = [act('a', 0)];
    const ev = evaluateCompliance(p, a, 100);
    expect(weeklyCompliance({ week: 1, planned: p, evaluations: ev.planned, activities: a, todayDay: 100 })).toBeCloseTo(100, 6);
  });
  it('is null with no plan', () => {
    expect(weeklyCompliance({ week: 1, planned: [], evaluations: [], activities: [], todayDay: 100 })).toBeNull();
    expect(weeklyCompliance({ week: 2, planned: plan, evaluations: [], activities: [], todayDay: 100 })).toBeNull();
  });
  it('week so far uses only due items', () => {
    const acts = [act('tue', 1, { durationS: 4500, load: 10 })];
    const ev = evaluateCompliance(plan, acts, 2);
    expect(weeklyCompliance({ week: 1, planned: plan, evaluations: ev.planned, activities: acts, todayDay: 2 })).toBeCloseTo(100, 6);
    const ev0 = evaluateCompliance(plan, [], 0);
    expect(weeklyCompliance({ week: 1, planned: plan, evaluations: ev0.planned, activities: [], todayDay: 0 })).toBeNull();
    const ev1 = evaluateCompliance(plan, [], 2);
    const w1 = weeklyCompliance({ week: 1, planned: plan, evaluations: ev1.planned, activities: [], todayDay: 2 });
    const wTue = (5 / 7) * (75 / 405);
    expect(w1).toBeCloseTo((100 * (1 / 7)) / (1 / 7 + wTue), 6);
  });
  it('missing evaluation on an ended day counts as missed; zero-load plan is equal weight', () => {
    const p = [pw('z1', 0, { plannedLoad: 0 }), pw('z2', 1, { plannedLoad: 0 })];
    const a = [act('a', 0)];
    const ev = evaluateCompliance(p, a, 100);
    const wc = weeklyCompliance({ week: 1, planned: p, evaluations: ev.planned.slice(0, 1), activities: a, todayDay: 100 });
    expect(wc).toBeCloseTo(100 * (1 / 7 + 5 / 7), 6);
  });
});
