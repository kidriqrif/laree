import { describe, expect, it } from 'vitest';
import {
  RULES,
  RULE_IDS,
  acknowledgeFlag,
  addFlagNote,
  badgeCount,
  emptyFlagsState,
  evaluateRules,
  explainFlag,
  flagValuesLine,
  flagValuesShort,
  replayFlags,
  resolveFlag,
  stepFlags,
  summariseValues,
} from './flags.ts';
import type { AthleteData, FlagCheckIn, FlagEvaluation, FlagPlanned, FlagRecord, FlagRuleId, FlagsState } from './flags.ts';
import type { FitnessPoint } from './metrics/fitness.ts';

// Day 98 is a Monday (98 = 14 x 7).
const D = 100;
const label = (d: number) => `day ${d}`;

const ci = (day: number, o: Partial<FlagCheckIn> = {}): FlagCheckIn => ({
  day,
  sleepHours: 7.5,
  soreness: 2,
  mood: 4,
  ...o,
});

interface FitOverride {
  form?: number;
  ramp?: number;
  load?: number;
  fitness?: number;
  fatigue?: number;
}

/** Fitness points for days `from`..`to`, with overrides per day. */
function fit(from: number, to: number, over: Record<number, FitOverride> = {}): FitnessPoint[] {
  const out: FitnessPoint[] = [];
  for (let day = from; day <= to; day++) {
    out.push({
      day,
      load: 50,
      fitness: 60,
      fatigue: 60,
      form: 0,
      ramp: 0,
      projected: false,
      ...over[day],
    });
  }
  return out;
}

function data(o: Partial<AthleteData> = {}): AthleteData {
  return { name: 'Amir', checkIns: [], fitness: fit(0, 130), planned: [], evaluations: [], ...o };
}

const state = (ruleId: FlagRuleId, d: number, a: AthleteData) =>
  evaluateRules('amir', d, a).find((r) => r.ruleId === ruleId);

/** Seven HRV readings with mean 72 and SD 6 exactly, on the given days. */
const hrvBase = (from: number): FlagCheckIn[] =>
  [66, 78, 66, 78, 66, 78, 72].map((v, i) => ci(from + i, { hrvMs: v }));

describe('hrv-low', () => {
  // Baseline window for d is B(hrv, d - 6): days d-34 to d-7.
  const baseDays = hrvBase(D - 30);
  const week = (value: number, count = 7) =>
    Array.from({ length: count }, (_, i) => ci(D - i, { hrvMs: value }));

  it('is false at 69.0 ms from 7 readings (the line)', () => {
    const r = state('hrv-low', D, data({ checkIns: [...baseDays, ...week(69)] }));
    expect(r?.state).toBe('false');
    expect(r?.values).toMatchObject({ mean: 72, sd: 6, line: 69, readings: 7 });
  });

  it('is true at 68.9 ms from 7 readings', () => {
    const r = state('hrv-low', D, data({ checkIns: [...baseDays, ...week(68.9)] }));
    expect(r?.state).toBe('true');
    expect(r?.values.avg7).toBeCloseTo(68.9);
  });

  it('is no-data with 3 readings in the window', () => {
    expect(state('hrv-low', D, data({ checkIns: [...baseDays, ...week(60, 3)] }))?.state).toBe('no-data');
  });

  it('is no-data when the baseline has only 6 readings', () => {
    const short = baseDays.slice(0, 6);
    expect(state('hrv-low', D, data({ checkIns: [...short, ...week(60)] }))?.state).toBe('no-data');
  });

  it('evaluates on the 9 readings left after 5 ill days are dropped', () => {
    const calm = Array.from({ length: 9 }, (_, i) => ci(D - 34 + i, { hrvMs: 72 + (i % 2 ? 2 : -2) }));
    const ill = Array.from({ length: 5 }, (_, i) =>
      ci(D - 20 + i, { hrvMs: 30, unwell: { kind: 'ill', note: '' } }),
    );
    const r = state('hrv-low', D, data({ checkIns: [...calm, ...ill, ...week(75)] }));
    expect(r?.state).toBe('false');
    expect(r?.values.mean).toBeCloseTo(72 - 2 / 9);
  });
});

describe('rhr-high', () => {
  // Baseline B(restingHr, d - 1) covers days d-29 to d-2.
  const base = Array.from({ length: 8 }, (_, i) => ci(D - 20 + i, { restingHr: 48 }));

  it('is true at 55 and 55 (+7, +7)', () => {
    const r = state('rhr-high', D, data({ checkIns: [...base, ci(D - 1, { restingHr: 55 }), ci(D, { restingHr: 55 })] }));
    expect(r?.state).toBe('true');
    expect(r?.values).toMatchObject({ today: 55, yesterday: 55, mean: 48, diffToday: 7, diffYesterday: 7 });
  });

  it('is false at 55 today and 54 yesterday', () => {
    const r = state('rhr-high', D, data({ checkIns: [...base, ci(D - 1, { restingHr: 54 }), ci(D, { restingHr: 55 })] }));
    expect(r?.state).toBe('false');
    expect(r?.clear).toBe(false);
  });

  it('is no-data at 60 today with no reading yesterday', () => {
    expect(state('rhr-high', D, data({ checkIns: [...base, ci(D, { restingHr: 60 })] }))?.state).toBe('no-data');
  });

  it('is no-data with no baseline, or with no reading today', () => {
    expect(state('rhr-high', D, data({ checkIns: [ci(D, { restingHr: 60 }), ci(D - 1, { restingHr: 60 })] }))?.state).toBe(
      'no-data',
    );
    expect(state('rhr-high', D, data({ checkIns: base }))?.state).toBe('no-data');
  });

  it('is clear when both mornings are under +7', () => {
    const r = state('rhr-high', D, data({ checkIns: [...base, ci(D - 1, { restingHr: 50 }), ci(D, { restingHr: 49 })] }));
    expect(r?.clear).toBe(true);
  });
});

describe('sleep-short', () => {
  it('is true at 5.5 h and 5.5 h', () => {
    const r = state('sleep-short', D, data({ checkIns: [ci(D - 1, { sleepHours: 5.5 }), ci(D, { sleepHours: 5.5 })] }));
    expect(r?.state).toBe('true');
    expect(r?.values).toMatchObject({ last: 5.5, before: 5.5, avg7: 5.5 });
  });

  it('is false at 6.0 h and 5.0 h', () => {
    const r = state('sleep-short', D, data({ checkIns: [ci(D - 1, { sleepHours: 5 }), ci(D, { sleepHours: 6 })] }));
    expect(r?.state).toBe('false');
    expect(r?.clear).toBe(false);
  });

  it('is no-data at 5.0 h with no check-in yesterday', () => {
    expect(state('sleep-short', D, data({ checkIns: [ci(D, { sleepHours: 5 })] }))?.state).toBe('no-data');
  });

  it('is no-data with no check-in today and false-and-clear after two good nights', () => {
    expect(state('sleep-short', D, data())?.state).toBe('no-data');
    const r = state('sleep-short', D, data({ checkIns: [ci(D - 1, { sleepHours: 6 }), ci(D, { sleepHours: 6 })] }));
    expect(r).toMatchObject({ state: 'false', clear: true });
  });

  it('is false (not clear) when today is fine and yesterday is unknown', () => {
    const r = state('sleep-short', D, data({ checkIns: [ci(D, { sleepHours: 8 })] }));
    expect(r).toMatchObject({ state: 'false', clear: false });
  });
});

describe('soreness-high', () => {
  it('is true at 4 and 4, with load and unwell note', () => {
    const r = state(
      'soreness-high',
      D,
      data({
        checkIns: [ci(D - 1, { soreness: 4 }), ci(D, { soreness: 4, unwell: { kind: 'injured', note: 'left calf' } })],
        fitness: fit(0, 130, { [D - 2]: { load: 100 }, [D - 1]: { load: 100 }, [D]: { load: 112 } }),
      }),
    );
    expect(r?.state).toBe('true');
    expect(r?.values).toMatchObject({ today: 4, yesterday: 4, load3: 312, unwellNote: 'left calf' });
  });

  it('is false at 5 today and 3 yesterday', () => {
    const r = state('soreness-high', D, data({ checkIns: [ci(D - 1, { soreness: 3 }), ci(D, { soreness: 5 })] }));
    expect(r?.state).toBe('false');
  });

  it('leaves out load when the fitness series does not cover the days', () => {
    const r = state(
      'soreness-high',
      D,
      data({ checkIns: [ci(D - 1, { soreness: 4 }), ci(D, { soreness: 4 })], fitness: [] }),
    );
    expect(r?.values.load3).toBeUndefined();
  });
});

describe('mood-low-under-load', () => {
  const run = (mood: number | undefined, form: number, fitness = fit(0, 130)) =>
    state(
      'mood-low-under-load',
      D,
      data({
        checkIns: mood === undefined ? [] : [ci(D, { mood })],
        fitness: fitness.map((p) => (p.day === D ? { ...p, form } : p)),
      }),
    );

  it('is true at mood 2 and Form -25.1', () => {
    expect(run(2, -25.1)?.state).toBe('true');
  });

  it('is false at mood 2 and Form -25.0', () => {
    expect(run(2, -25)?.state).toBe('false');
  });

  it('is false at mood 3 and Form -40', () => {
    expect(run(3, -40)).toMatchObject({ state: 'false', clear: true });
  });

  it('is no-data without a check-in, or with under 42 days of history', () => {
    expect(run(undefined, -40)?.state).toBe('no-data');
    expect(run(2, -40, fit(D - 30, 130))?.state).toBe('no-data');
  });
});

describe('ramp-high', () => {
  // The rule reads the ramp as of yesterday.
  const run = (ramp: number) =>
    state('ramp-high', D, data({ fitness: fit(0, 130, { [D - 1]: { ramp, fitness: 58.4 } }) }));

  it('is false at 8.0', () => {
    expect(run(8)?.state).toBe('false');
  });

  it('is true at 8.01', () => {
    const r = run(8.01);
    expect(r?.state).toBe('true');
    expect(r?.values).toMatchObject({ ramp: 8.01, fitness: 58.4, load7: 350 });
  });

  it('is no-data for Ramp 12 with 30 days of history', () => {
    const r = state('ramp-high', 30, data({ fitness: fit(0, 29, { 29: { ramp: 12 } }) }));
    expect(r?.state).toBe('no-data');
  });
});

describe('form-deep', () => {
  const run = (form: number, over: Record<number, FitOverride> = {}) =>
    state('form-deep', D, data({ fitness: fit(0, 130, { [D]: { form }, ...over }) }));

  it('is false at -30.0', () => {
    expect(run(-30)?.state).toBe('false');
  });

  it('is true at -30.01 and counts days below', () => {
    const r = run(-30.01, { [D - 1]: { form: -31 } });
    expect(r?.state).toBe('true');
    expect(r?.values.daysBelow).toBe(2);
  });

  it('is no-data when the day has no point', () => {
    expect(state('form-deep', D, data({ fitness: fit(0, D - 1) }))?.state).toBe('no-data');
  });
});

describe('key-missed', () => {
  // Monday 98; today is Friday 102.
  const T = 102;
  const key = (id: string, day: number, over: Partial<FlagPlanned> = {}): FlagPlanned => ({
    id,
    athleteId: 'amir',
    day,
    sport: 'run',
    title: id,
    keySession: true,
    ...over,
  });
  const ev = (plannedId: string, band: FlagEvaluation['band']): FlagEvaluation => ({ plannedId, band });

  it('is true when 2 key sessions were missed on past days', () => {
    const r = state(
      'key-missed',
      T,
      data({
        planned: [key('a', 99), key('b', 101), key('c', 100), key('x', 100, { athleteId: 'danial' })],
        evaluations: [ev('a', 'missed'), ev('b', 'missed'), ev('c', 'onPlan'), ev('x', 'missed')],
      }),
    );
    expect(r?.state).toBe('true');
    expect(r?.values).toMatchObject({ count: 2, done: 1, planned: 3, missed: 'Tue Run a, Thu Run b' });
  });

  it('is false with 1 missed and 1 partial', () => {
    const r = state(
      'key-missed',
      T,
      data({ planned: [key('a', 99), key('b', 101)], evaluations: [ev('a', 'missed'), ev('b', 'short')] }),
    );
    expect(r?.state).toBe('false');
  });

  it('is false with 1 missed yesterday and today’s key session not done yet', () => {
    const r = state(
      'key-missed',
      T,
      data({ planned: [key('a', 101), key('b', T)], evaluations: [ev('a', 'missed'), ev('b', undefined)] }),
    );
    expect(r?.state).toBe('false');
  });

  it('ignores sessions that are not key sessions or fall in another week', () => {
    const r = state(
      'key-missed',
      T,
      data({
        planned: [key('a', 99, { keySession: false }), key('b', 90), key('c', 100)],
        evaluations: [ev('a', 'missed'), ev('b', 'missed'), ev('c', 'missed')],
      }),
    );
    expect(r?.values.count).toBe(1);
    expect(r?.state).toBe('false');
  });
});

describe('evaluateRules', () => {
  it('returns all eight rules in order', () => {
    expect(evaluateRules('amir', D, data()).map((r) => r.ruleId)).toEqual([...RULE_IDS]);
    expect(Object.keys(RULES)).toHaveLength(8);
  });
});

// ---------------------------------------------------------------- lifecycle

/** Form-deep scenario: Form is -35 on the "bad" days, 0 otherwise, and missing on `gaps`. */
function formData(bad: number[], gaps: number[] = []): AthleteData {
  const over: Record<number, FitOverride> = {};
  for (const b of bad) over[b] = { form: -35 };
  const fitness = fit(0, 130, over).filter((p) => !gaps.includes(p.day));
  return data({ fitness });
}

const run = (a: AthleteData, from: number, to: number, init?: FlagsState) => replayFlags('amir', from, to, a, init);
const formFlags = (s: FlagsState) => s.flags.filter((f) => f.ruleId === 'form-deep');

describe('lifecycle', () => {
  it('keeps one flag when the rule is true on 3 days in a row', () => {
    const s = run(formData([60, 61, 62]), 58, 62);
    expect(formFlags(s)).toHaveLength(1);
    const f = formFlags(s)[0];
    expect(f).toMatchObject({
      id: 'amir:form-deep:60',
      status: 'open',
      severity: 'act',
      openedDay: 60,
      lastTrueDay: 62,
      clearDays: 0,
    });
    expect(f?.explanation).toContain("Amir's Form is −35");
  });

  it('keeps the flag open and resets clearDays when the rule is false once, then true', () => {
    const a = formData([60, 61, 63]);
    const mid = run(a, 58, 62);
    expect(formFlags(mid)[0]).toMatchObject({ status: 'open', clearDays: 1 });
    const end = run(a, 63, 63, mid);
    expect(formFlags(end)).toHaveLength(1);
    expect(formFlags(end)[0]).toMatchObject({ status: 'open', clearDays: 0, lastTrueDay: 63, openedDay: 60 });
  });

  it('resolves by itself after two clear days running', () => {
    const s = run(formData([60, 61]), 58, 63);
    expect(formFlags(s)[0]).toMatchObject({ status: 'resolved', resolution: 'auto', resolvedDay: 63 });
  });

  it('does not double count when the rules run twice on the same day', () => {
    const a = formData([60]);
    let s = run(a, 58, 61);
    s = stepFlags('amir', 61, a, s);
    s = stepFlags('amir', 61, a, s);
    expect(formFlags(s)[0]).toMatchObject({ status: 'open', clearDays: 1 });
    s = stepFlags('amir', 62, a, s);
    expect(formFlags(s)[0]?.status).toBe('resolved');
  });

  it('stays quiet when the coach resolves while the rule is still true', () => {
    const a = formData([60, 61, 62]);
    let s = run(a, 58, 60);
    s = resolveFlag(s, 'amir:form-deep:60', 60, 'Spoke to Amir');
    expect(s.quiet['form-deep']).toBe(true);
    expect(formFlags(s)[0]).toMatchObject({ status: 'resolved', resolution: 'coach' });
    expect(formFlags(s)[0]?.notes).toEqual([{ day: 60, text: 'Spoke to Amir' }]);
    s = run(a, 61, 62, s);
    expect(formFlags(s)).toHaveLength(1);
  });

  it('opens a new flag when the rule goes false once after a coach resolve, then true', () => {
    const a = formData([60, 61, 63]);
    let s = run(a, 58, 61);
    s = resolveFlag(s, 'amir:form-deep:60', 61);
    s = run(a, 62, 63, s);
    expect(s.quiet['form-deep']).toBeUndefined();
    expect(formFlags(s)).toHaveLength(2);
    expect(formFlags(s)[1]).toMatchObject({ id: 'amir:form-deep:63', status: 'open' });
  });

  it('resolves with reason no-data after 7 days without data', () => {
    const gaps = [61, 62, 63, 64, 65, 66, 67];
    const a = formData([60], gaps);
    const mid = run(a, 58, 66);
    expect(formFlags(mid)[0]).toMatchObject({ status: 'open', noDataDays: 6 });
    const end = run(a, 67, 67, mid);
    expect(formFlags(end)[0]).toMatchObject({ status: 'resolved', resolution: 'no-data' });
  });

  it('resolves a key-missed flag with reason week-ended on Monday', () => {
    const planned: FlagPlanned[] = [
      { id: 'a', athleteId: 'amir', day: 99, sport: 'run', title: 'A', keySession: true },
      { id: 'b', athleteId: 'amir', day: 100, sport: 'bike', title: 'B', keySession: true },
    ];
    const evaluations: FlagEvaluation[] = [
      { plannedId: 'a', band: 'missed' },
      { plannedId: 'b', band: 'missed' },
    ];
    const a = data({ planned, evaluations });
    const sun = run(a, 101, 104);
    const flag = sun.flags.find((f) => f.ruleId === 'key-missed');
    expect(flag).toMatchObject({ status: 'open', openedDay: 101, lastTrueDay: 104 });
    const mon = run(a, 105, 105, sun);
    expect(mon.flags.find((f) => f.ruleId === 'key-missed')).toMatchObject({
      status: 'resolved',
      resolution: 'week-ended',
    });
    expect(mon.flags.filter((f) => f.ruleId === 'key-missed')).toHaveLength(1);
  });

  it('gives identical flag lists when the same seed runs twice', () => {
    const a = formData([60, 61, 70, 71, 72]);
    expect(run(a, 40, 100)).toEqual(run(a, 40, 100));
  });

  it('only resolves the athlete’s own flags', () => {
    const a = formData([60]);
    const s = run(a, 58, 60);
    const other = replayFlags('danial', 61, 62, formData([]), s);
    expect(formFlags(other)[0]?.status).toBe('open');
  });

  it('lets short sleep with a short spell resolve on one clear day, but not on a mixed day', () => {
    const cis = [
      ci(60, { sleepHours: 5 }),
      ci(61, { sleepHours: 5 }),
      ci(62, { sleepHours: 6 }),
      ci(63, { sleepHours: 5 }),
      ci(64, { sleepHours: 7 }),
      ci(65, { sleepHours: 7 }),
    ];
    const a = data({ checkIns: cis });
    const open = run(a, 59, 62);
    const f = open.flags.find((x) => x.ruleId === 'sleep-short');
    expect(f).toMatchObject({ status: 'open', clearDays: 0 });
    const mixed = run(a, 63, 64, open);
    expect(mixed.flags.find((x) => x.ruleId === 'sleep-short')?.status).toBe('open');
    const done = run(a, 65, 65, mixed);
    expect(done.flags.find((x) => x.ruleId === 'sleep-short')).toMatchObject({ status: 'resolved', resolution: 'auto' });
    expect(f?.severity).toBe('info');
  });
});

describe('acknowledge, notes, badge', () => {
  const base = () => run(formData([60]), 58, 60);

  it('acknowledges an open flag and drops it from the badge', () => {
    const s = base();
    expect(badgeCount(s.flags)).toBe(1);
    const ack = acknowledgeFlag(s, 'amir:form-deep:60', 61);
    expect(formFlags(ack)[0]).toMatchObject({ status: 'acknowledged', acknowledgedDay: 61 });
    expect(badgeCount(ack.flags)).toBe(0);
    expect(acknowledgeFlag(ack, 'amir:form-deep:60', 62)).toEqual(ack);
  });

  it('keeps acknowledged flags updating and resolving by themselves', () => {
    const a = formData([60, 61]);
    let s = acknowledgeFlag(base(), 'amir:form-deep:60', 60);
    s = run(a, 61, 61, s);
    expect(formFlags(s)[0]).toMatchObject({ status: 'acknowledged', lastTrueDay: 61 });
    s = run(a, 62, 63, s);
    expect(formFlags(s)[0]?.status).toBe('resolved');
  });

  it('adds notes of up to 280 characters in any state', () => {
    let s = addFlagNote(base(), 'amir:form-deep:60', 60, `  ${'x'.repeat(300)}  `);
    expect(formFlags(s)[0]?.notes[0]?.text).toHaveLength(280);
    s = addFlagNote(s, 'amir:form-deep:60', 61, '   ');
    expect(formFlags(s)[0]?.notes).toHaveLength(1);
    const resolved = resolveFlag(s, 'amir:form-deep:60', 62);
    expect(addFlagNote(resolved, 'amir:form-deep:60', 63, 'later').flags[0]?.notes).toHaveLength(2);
  });

  it('ignores resolve on a flag that is missing or already resolved', () => {
    const s = base();
    expect(resolveFlag(s, 'nope', 61)).toBe(s);
    const r = resolveFlag(s, 'amir:form-deep:60', 61);
    expect(resolveFlag(r, 'amir:form-deep:60', 62)).toBe(r);
  });

  it('does not set the quiet marker when the rule was already clearing', () => {
    const a = formData([60]);
    let s = run(a, 58, 61);
    s = resolveFlag(s, 'amir:form-deep:60', 61);
    expect(s.quiet).toEqual({});
    expect(emptyFlagsState()).toEqual({ flags: [], quiet: {} });
  });
});

describe('explanations', () => {
  const samples: Record<FlagRuleId, Record<string, number | string>> = {
    'hrv-low': { avg7: 66, readings: 6, mean: 72, sd: 6, line: 69 },
    'rhr-high': { today: 56, yesterday: 55, mean: 48, diffToday: 8, diffYesterday: 7 },
    'sleep-short': { last: 5.5, before: 5, avg7: 6.4 },
    'soreness-high': { today: 4, yesterday: 5, load3: 312 },
    'mood-low-under-load': { mood: 2, form: -28, fitness: 61, fatigue: 89, ramp: 6.1 },
    'ramp-high': { ramp: 9.2, fitness: 58.4, fitnessWeekAgo: 49.2 },
    'form-deep': { form: -32, fitness: 70, fatigue: 102, daysBelow: 2 },
    'key-missed': { count: 2, missed: 'Tue Run 6 x 1 km, Thu Run 3 x 3 km', done: 1, planned: 4 },
  };

  it('writes a plain explanation and a values line for every rule', () => {
    for (const id of RULE_IDS) {
      const text = explainFlag(id, 'Amir', samples[id] ?? {});
      expect(text).toMatch(/^Amir/);
      expect(text).not.toMatch(/\b(TSS|NP|IF|CTL|ATL|TSB)\b/);
      expect(summariseValues(id, samples[id] ?? {}).length).toBeGreaterThan(10);
    }
  });

  it('matches the spec examples', () => {
    expect(summariseValues('hrv-low', samples['hrv-low'] ?? {})).toBe(
      '7-day average 66 ms (6 readings) · usual 72 ms ± 6 · line 69 ms',
    );
    expect(summariseValues('rhr-high', samples['rhr-high'] ?? {})).toBe(
      '56 bpm this morning, 55 bpm yesterday · baseline 48 bpm · +8 and +7',
    );
    expect(summariseValues('mood-low-under-load', samples['mood-low-under-load'] ?? {})).toBe(
      'Mood 2 today · Form −28 (Fitness 61, Fatigue 89) · Ramp +6.1',
    );
    expect(summariseValues('form-deep', samples['form-deep'] ?? {})).toBe(
      'Form −32 (Fitness 70, Fatigue 102) · 2nd day below −30',
    );
    expect(summariseValues('soreness-high', { today: 4, yesterday: 5 })).toBe('Soreness 4 today, 5 yesterday');
  });

  it('dates values measured on an earlier day instead of saying today', () => {
    expect(summariseValues('soreness-high', { today: 5, yesterday: 4 }, '9 Nov')).toBe('Soreness 5 on 9 Nov, 4 the day before');
    expect(summariseValues('rhr-high', samples['rhr-high'] ?? {}, '9 Nov')).toBe(
      '56 bpm on 9 Nov, 55 bpm the day before · baseline 48 bpm · +8 and +7',
    );
    expect(summariseValues('mood-low-under-load', samples['mood-low-under-load'] ?? {}, '9 Nov')).toMatch(/^Mood 2 on 9 Nov · /);
    expect(summariseValues('sleep-short', { last: 5.4, before: 5.6, avg7: 6.2 }, '9 Nov')).toBe(
      '5.4 h the night to 9 Nov, 5.6 h the night before · 7-day average 6.2 h',
    );
    for (const id of RULE_IDS) {
      const text = summariseValues(id, samples[id] ?? {}, '9 Nov');
      expect(text).not.toMatch(/\b(today|yesterday|this morning|last night|now)\b/);
    }
  });

  it('words a flag from today: dated when the values are older, plain when they are from today', () => {
    const rec = {
      ruleId: 'soreness-high',
      openedDay: 90,
      lastTrueDay: 92,
      valuesAtOpen: { today: 4, yesterday: 4 },
      valuesLatest: { today: 5, yesterday: 4 },
    } as unknown as FlagRecord;
    expect(flagValuesLine(rec, 'latest', 92, label)).toBe('Soreness 5 today, 4 yesterday');
    expect(flagValuesLine(rec, 'latest', 96, label)).toBe('Soreness 5 on day 92, 4 the day before');
    expect(flagValuesLine(rec, 'open', 92, label)).toBe('Soreness 4 on day 90, 4 the day before');
  });

  it('dates ramp values by the day before the check, the day its Fitness is read', () => {
    expect(summariseValues('ramp-high', samples['ramp-high'] ?? {}, '9 Nov')).toBe(
      'Ramp +9 in the week to 9 Nov · Fitness 58.4, 49.2 a week before',
    );
    const rec = {
      ruleId: 'ramp-high',
      openedDay: 90,
      lastTrueDay: 92,
      valuesAtOpen: { ramp: 8.5, fitness: 57, fitnessWeekAgo: 48.5 },
      valuesLatest: samples['ramp-high'],
    } as unknown as FlagRecord;
    // Checked today, but Fitness is read up to yesterday: never "now".
    expect(flagValuesLine(rec, 'latest', 92, label)).toBe('Ramp +9 in the week to day 91 · Fitness 58.4, 49.2 a week before');
    expect(flagValuesLine(rec, 'open', 92, label)).toBe('Ramp +9 in the week to day 89 · Fitness 57.0, 48.5 a week before');
  });

  it('keeps the date in the compact values line of every dated rule', () => {
    for (const id of RULE_IDS) {
      // Missed key sessions count the current week and never say "today", so they carry no date.
      if (id === 'key-missed') continue;
      const rec = { ruleId: id, openedDay: 90, lastTrueDay: 90, valuesAtOpen: samples[id], valuesLatest: samples[id] } as unknown as FlagRecord;
      const short = flagValuesShort(rec, 96, label);
      expect(`${id}: ${short}`).toContain(id === 'ramp-high' ? 'day 89' : 'day 90');
      expect(`${id}: ${short}`).not.toContain(' · ');
    }
  });

  it('shows more decimals when rounding would hide the threshold', () => {
    expect(explainFlag('form-deep', 'Amir', { form: -30.04 })).toContain('−30.04');
    expect(explainFlag('ramp-high', 'Amir', { ramp: 8.004 })).toContain('8.004');
    expect(summariseValues('form-deep', { form: -30.4, fitness: 1, fatigue: 2, daysBelow: 11 })).toContain('11th day');
  });
});

describe('engine check: same-day re-fire keeps ids unique', () => {
  const T = 102;
  const planned: FlagPlanned[] = [
    { id: 'a', athleteId: 'amir', day: 99, sport: 'run', title: 'A', keySession: true },
    { id: 'b', athleteId: 'amir', day: 100, sport: 'bike', title: 'B', keySession: true },
  ];
  const withBands = (b: FlagEvaluation['band']): AthleteData =>
    data({
      planned,
      evaluations: [
        { plannedId: 'a', band: 'missed' },
        { plannedId: 'b', band: b },
      ],
    });

  it('gives a re-opened flag a new id and leaves the resolved one alone', () => {
    let s = stepFlags('amir', T, withBands('missed'), emptyFlagsState());
    s = stepFlags('amir', T, withBands('onPlan'), s);
    expect(s.flags.map((f) => f.status)).toEqual(['resolved']);
    s = stepFlags('amir', T, withBands('missed'), s);
    expect(new Set(s.flags.map((f) => f.id)).size).toBe(s.flags.length);
    s = stepFlags('amir', T, withBands('missed'), s);
    expect(s.flags.map((f) => f.status)).toEqual(['resolved', 'open']);
    const open = s.flags.find((f) => f.status === 'open');
    const after = resolveFlag(s, open?.id ?? '', T);
    expect(after.flags.map((f) => f.resolution)).toEqual(['auto', 'coach']);
  });
});
