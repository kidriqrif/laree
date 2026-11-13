import { afterEach, describe, expect, it } from 'vitest';
import { badges, streak } from '../domain/gamification.ts';
import type { GamificationInput } from '../domain/gamification.ts';
import { setNow, weekOfDay } from '../domain/time.ts';
import type { AthleteId } from '../domain/types.ts';
import { generateSeed } from './seed/index.ts';
import { streamFor } from './seed/onDemand.ts';
import type { Seed } from './seed/index.ts';
import { hashString, mulberry32 } from './seed/rng.ts';

/** Sunday of the current week: day 118, so the whole of week 17 so far has happened. */
const TODAY = 118;
const IDS: AthleteId[] = ['amir', 'danial', 'irfan'];
const week = weekOfDay;

const seed = generateSeed({ today: TODAY });

function input(s: Seed, id: AthleteId): GamificationInput {
  const mine = <T extends { athleteId: AthleteId }>(xs: readonly T[]): T[] => xs.filter((x) => x.athleteId === id);
  return {
    athleteId: id,
    today: s.today,
    planned: mine(s.planned),
    activities: mine(s.activities),
    checkIns: mine(s.checkIns),
    kudos: mine(s.kudos),
    thresholds: s.thresholds,
    races: s.races,
    phases: mine(s.phases),
    excuses: s.excuses,
  };
}

afterEach(() => setNow(null));

describe('determinism', () => {
  it('gives identical output on every run', () => {
    expect(JSON.stringify(generateSeed({ today: TODAY }))).toBe(JSON.stringify(seed));
  });

  it('matches the stored snapshot', () => {
    const summary = {
      digest: hashString(JSON.stringify(seed)),
      counts: IDS.map((id) => ({
        id,
        planned: seed.planned.filter((p) => p.athleteId === id).length,
        activities: seed.activities.filter((a) => a.athleteId === id).length,
        checkIns: seed.checkIns.filter((c) => c.athleteId === id).length,
        flags: seed.flags.filter((f) => f.athleteId === id).length,
        badges: seed.badges.filter((b) => b.athleteId === id).length,
      })),
      templates: seed.templates.length,
    };
    expect(summary).toMatchSnapshot();
  });

  it('uses a PRNG that repeats for a fixed seed', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });
});

describe('the people and the plan', () => {
  it('has the coach and three athletes', () => {
    expect(seed.coach.id).toBe('coach');
    expect(seed.athletes.map((a) => a.id)).toEqual(IDS);
  });

  it('has the thresholds from the brief, with Amir FTP rising in week 9', () => {
    const ftp = seed.thresholds.filter((t) => t.athleteId === 'amir' && t.kind === 'ftp');
    expect(ftp.map((t) => [t.value, week(t.effectiveFromDay)])).toEqual([
      [245, 1],
      [255, 9],
    ]);
    const get = (id: AthleteId, kind: string) => seed.thresholds.find((t) => t.athleteId === id && t.kind === kind)?.value;
    expect(get('irfan', 'ftp')).toBe(280);
    expect(1000 / (get('danial', 'thresholdPace') as number)).toBeCloseTo(238, 6);
    expect(1000 / (get('amir', 'thresholdPace') as number)).toBeCloseTo(265, 6);
    expect(100 / (get('amir', 'css') as number)).toBeCloseTo(108, 6);
  });

  it('plans 12 weeks beyond the current week, in three-up-one-down cycles', () => {
    const planWeeks = [...new Set(seed.planned.map((p) => week(p.day)))];
    expect(Math.min(...planWeeks)).toBe(1);
    expect(Math.max(...planWeeks)).toBe(29);
    for (const id of IDS) {
      const targets = seed.phases.filter((p) => p.athleteId === id).flatMap((p) => p.weeklyTargets);
      const down = targets.filter((t) => t.downWeek).map((t) => t.week);
      expect(down.slice(0, 4)).toEqual([4, 8, 12, 16]);
    }
  });

  it('places every race inside the plan, with the right priorities and week offsets', () => {
    const at = (id: string) => {
      const r = seed.races.find((x) => x.id === id);
      return r ? [r.priority, week(r.day) - 17] : null;
    };
    expect(at('amir-teluk-half')).toEqual(['A', 10]);
    expect(at('amir-tasik-olympic')).toEqual(['B', 4]);
    expect(at('danial-kota-marathon')).toEqual(['A', 12]);
    expect(at('danial-bukit-half')).toEqual(['B', 6]);
    expect(at('irfan-cameron-gran-fondo')).toEqual(['A', 9]);
    expect(at('irfan-bukit-tinggi-hill-climb')).toEqual(['C', 3]);
    for (const race of seed.races) {
      expect(week(race.day)).toBeLessThanOrEqual(seed.planLastWeek);
      const raceWeek = week(race.day);
      expect(seed.planned.some((p) => p.athleteId === race.athleteId && week(p.day) === raceWeek)).toBe(true);
      expect(seed.phases.some((p) => p.athleteId === race.athleteId && p.firstWeek <= raceWeek && p.lastWeek >= raceWeek)).toBe(true);
    }
  });

  it('keeps planned workouts consistent with their steps', () => {
    for (const p of seed.planned) {
      expect(p.plannedLoad).toBeGreaterThan(0);
      expect(p.plannedDurationS).toBeGreaterThan(0);
      expect(p.steps.length).toBeGreaterThan(0);
    }
    const ids = new Set(seed.planned.map((p) => p.id));
    expect(ids.size).toBe(seed.planned.length);
  });

  it('has a library of at least 12 templates across swim, bike, run and strength', () => {
    expect(seed.templates.length).toBeGreaterThanOrEqual(12);
    expect(new Set(seed.templates.map((t) => t.sport))).toEqual(new Set(['swim', 'bike', 'run', 'strength']));
    expect(new Set(seed.templates.map((t) => t.id)).size).toBe(seed.templates.length);
  });
});

describe('history', () => {
  it('stops at today and starts at day 0', () => {
    for (const a of seed.activities) {
      expect(a.day).toBeGreaterThanOrEqual(0);
      expect(a.day).toBeLessThan(TODAY);
    }
    for (const c of seed.checkIns) expect(c.day).toBeLessThanOrEqual(TODAY);
  });

  it('keeps about 85% compliance with some real misses', () => {
    const wcs: number[] = [];
    let missed = 0;
    for (const id of IDS) {
      for (const w of streak(input(seed, id)).weeks) if (w.wc !== null && w.status !== 'excused') wcs.push(w.wc);
      missed += seed.planned.filter((p) => p.athleteId === id && p.day < TODAY).length -
        seed.activities.filter((a) => a.athleteId === id && a.matchedWorkoutId !== undefined).length;
    }
    const mean = wcs.reduce((a, b) => a + b, 0) / wcs.length;
    expect(mean).toBeGreaterThan(83);
    expect(mean).toBeLessThan(95);
    expect(missed).toBeGreaterThan(10);
  });

  it('stores summaries only', () => {
    const json = JSON.stringify(seed.activities[0]);
    expect(json).not.toContain('powerW":[');
    expect(JSON.stringify(seed).length).toBeLessThan(2_000_000);
  });

  it('gives Amir his first brick in week 6', () => {
    const bricks = seed.activities.filter((a) => a.athleteId === 'amir' && a.id.endsWith('-d5-run'));
    expect(bricks.length).toBeGreaterThan(0);
    expect(Math.min(...bricks.map((b) => week(b.day)))).toBe(6);
    const award = badges(input(seed, 'amir')).find((b) => b.key === 'first-brick');
    expect(award && week(award.earnedDay)).toBe(6);
  });

  it('gives Danial a sick week 11, excused', () => {
    expect(seed.excuses).toEqual([expect.objectContaining({ athleteId: 'danial', week: 11, reason: 'ill' })]);
    const ill = seed.checkIns.filter((c) => c.athleteId === 'danial' && c.unwell?.kind === 'ill' && week(c.day) === 11);
    expect(ill.length).toBeGreaterThanOrEqual(4);
    const dan = seed.activities.filter((a) => a.athleteId === 'danial' && week(a.day) === 11);
    expect(dan).toHaveLength(0);
  });

  it('has check-ins for most mornings', () => {
    for (const id of IDS) {
      const n = seed.checkIns.filter((c) => c.athleteId === id).length;
      expect(n / (TODAY + 1)).toBeGreaterThan(0.75);
    }
  });
});

describe('badges and streaks (gamification.md 4.5)', () => {
  const awardsOf = (id: AthleteId) =>
    badges(input(seed, id)).map((b) => `${b.key}@${week(b.earnedDay)}`).toSorted();

  it('gives Amir 8 awards', () => {
    expect(awardsOf('amir')).toEqual(
      ['bike-100@1', 'check-in-7@1', 'swim-5@2', 'easy-lap@4', 'first-brick@6', 'coach-kudos@6', 'new-threshold@9', 'full-lap@10'].toSorted(),
    );
  });

  it('gives Danial 6 awards', () => {
    expect(awardsOf('danial')).toEqual(
      ['run-50@1', 'check-in-7@1', 'coach-kudos@3', 'easy-lap@4', 'full-lap@7', 'comeback@12'].toSorted(),
    );
  });

  it('gives Irfan 4 awards', () => {
    expect(awardsOf('irfan')).toEqual(['bike-100@1', 'check-in-7@3', 'easy-lap@8', 'full-lap@14'].toSorted());
  });

  it('seeds the same awards as the badge list, none in week 17', () => {
    expect(seed.badges).toHaveLength(18);
    for (const b of seed.badges) expect(week(b.earnedDay)).toBeLessThan(17);
  });

  it('matches the streak targets', () => {
    const below = (id: AthleteId) =>
      streak(input(seed, id)).weeks.filter((w) => w.status === 'below').map((w) => w.week);
    expect(below('amir')).toEqual([5, 13]);
    expect(below('danial')).toEqual([2]);
    expect(below('irfan')).toEqual([6, 15]);
    const s = (id: AthleteId) => {
      const r = streak(input(seed, id));
      return [r.current, r.best];
    };
    expect(s('amir')).toEqual([3, 7]);
    expect(s('danial')).toEqual([13, 13]);
    expect(s('irfan')).toEqual([1, 8]);
  });

  it('gives Irfan an overshoot in down week 4 and keeps the week counted', () => {
    const w4 = streak(input(seed, 'irfan')).weeks.find((w) => w.week === 4);
    expect(w4?.status).toBe('counted');
    const bike = (kind: 'planned' | 'done') =>
      kind === 'planned'
        ? seed.planned.filter((p) => p.athleteId === 'irfan' && week(p.day) === 4 && p.sport === 'bike').reduce((a, p) => a + p.plannedLoad, 0)
        : seed.activities.filter((p) => p.athleteId === 'irfan' && week(p.day) === 4 && p.sport === 'bike').reduce((a, p) => a + p.load.load, 0);
    expect(bike('done') / bike('planned')).toBeGreaterThan(1.3);
  });

  it('seeds no kudos for Irfan and marks seeded awards as seen', () => {
    expect(seed.kudos.filter((k) => k.athleteId === 'irfan')).toHaveLength(0);
    for (const id of IDS) expect(seed.badgeSeen[id]?.length ?? 0).toBe(seed.badges.filter((b) => b.athleteId === id).length);
  });
});

describe('check-ins and flags (checkins-flags.md demo coverage)', () => {
  const flagsOf = (id: AthleteId) => seed.flagsState[id].flags;

  it("has Danial's sick week flags: two open mid-week 11, all resolved in week 12", () => {
    const f = flagsOf('danial');
    const rhr = f.find((x) => x.ruleId === 'rhr-high' && week(x.openedDay) === 11);
    const hrv = f.find((x) => x.ruleId === 'hrv-low' && week(x.openedDay) === 11);
    const key = f.find((x) => x.ruleId === 'key-missed' && week(x.openedDay) === 11);
    for (const x of [rhr, hrv, key]) {
      expect(x).toBeDefined();
      expect(x?.status).toBe('resolved');
      expect(week(x?.resolvedDay ?? 0)).toBe(12);
    }
  });

  it('has Amir ramp-high in history and an acknowledged sleep-short with a coach note this week', () => {
    const f = flagsOf('amir');
    expect(f.some((x) => x.ruleId === 'ramp-high')).toBe(true);
    const sleep = f.find((x) => x.ruleId === 'sleep-short' && week(x.openedDay) === 17);
    expect(sleep?.status).toBe('acknowledged');
    expect(sleep?.notes.length).toBeGreaterThan(0);
  });

  it('has Irfan form-deep (Act) open this week', () => {
    const deep = flagsOf('irfan').find((x) => x.ruleId === 'form-deep' && x.status === 'open');
    expect(deep?.severity).toBe('act');
    expect(deep && week(deep.openedDay)).toBeLessThanOrEqual(17);
  });

  it('leaves one open flag of each severity and an acknowledged one', () => {
    const all = IDS.flatMap(flagsOf);
    const open = all.filter((x) => x.status === 'open');
    expect(new Set(open.map((x) => x.severity))).toEqual(new Set(['info', 'watch', 'act']));
    expect(all.some((x) => x.status === 'acknowledged')).toBe(true);
  });

  it('fires every rule at least once in the history', () => {
    const rules = new Set(IDS.flatMap(flagsOf).map((x) => x.ruleId));
    for (const r of ['hrv-low', 'rhr-high', 'sleep-short', 'soreness-high', 'mood-low-under-load', 'ramp-high', 'form-deep', 'key-missed']) {
      expect(rules.has(r as never)).toBe(true);
    }
  });

  it('mirrors the records in the domain Flag shape', () => {
    expect(seed.flags).toHaveLength(IDS.flatMap(flagsOf).length);
    for (const f of seed.flags) {
      expect(f.explanation.length).toBeGreaterThan(10);
      expect(['open', 'acknowledged', 'resolved']).toContain(f.state);
    }
  });
});

describe('other days of the week', () => {
  it('still builds a coherent seed for any weekday of the current week', () => {
    for (const today of [112, 113, 115]) {
      const s = generateSeed({ today });
      expect(s.activities.every((a) => a.day < today)).toBe(true);
      expect(s.badges).toHaveLength(18);
      const open = IDS.flatMap((id) => s.flagsState[id].flags).filter((f) => f.status !== 'resolved');
      expect(open.some((f) => f.ruleId === 'form-deep' && f.status === 'open')).toBe(true);
    }
  });

  it('uses the real clock when no day is given', () => {
    setNow(Date.UTC(2026, 10, 8, 5, 0, 0));
    expect(generateSeed().today).toBe(118);
  });
});

describe('streamFor', () => {
  const ride = seed.activities.find((a) => a.athleteId === 'amir' && a.sport === 'bike' && a.summary.durationS > 3600);
  const run = seed.activities.find((a) => a.athleteId === 'danial' && a.sport === 'run');

  it('is deterministic and matches the summary', () => {
    expect(ride).toBeDefined();
    const a = streamFor((ride as { id: string }).id, seed);
    const b = streamFor((ride as { id: string }).id, seed);
    expect(a).toEqual(b);
    expect(a?.seconds).toBe(ride?.summary.durationS);
    expect(a?.powerW).toHaveLength(a?.seconds ?? 0);
    expect(a?.distanceM).toHaveLength((a?.seconds ?? 0) + 1);
    const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
    expect(mean(a?.powerW ?? [])).toBeGreaterThan((ride?.summary.avgPowerW ?? 0) * 0.9);
    expect(mean(a?.powerW ?? [])).toBeLessThan((ride?.summary.avgPowerW ?? 0) * 1.1);
    expect(a?.distanceM?.[a.distanceM.length - 1]).toBeCloseTo(ride?.summary.distanceM ?? 0, -1);
  });

  it('makes run streams with speed, heart rate and altitude', () => {
    const s = streamFor((run as { id: string }).id, seed);
    expect(s?.speedMps).toHaveLength(s?.seconds ?? 0);
    expect(s?.hrBpm).toHaveLength(s?.seconds ?? 0);
    expect(s?.altitudeM).toHaveLength((s?.seconds ?? 0) + 1);
    expect(s?.powerW).toBeUndefined();
  });

  it('works without a seed argument and returns null for unknown ids', () => {
    setNow(Date.UTC(2026, 10, 8, 5, 0, 0));
    expect(streamFor('nobody-a-w1-d0-run')).toBeNull();
    const id = seed.activities[0]?.id as string;
    expect(streamFor(id)?.activityId).toBe(id);
  });
});
