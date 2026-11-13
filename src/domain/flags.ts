/**
 * Rule-based flags: the eight rules, their lifecycle and their plain-English cards.
 * See docs/spec/checkins-flags.md sections "Flag rules", "When rules run" and "Flag lifecycle".
 * Pure functions: the same inputs always give the same flags. Flags never come from AI.
 */
import { baseline, readingsOf } from './baselines.ts';
import type { Baseline } from './baselines.ts';
import { roundHalfAway } from './metrics/fitness.ts';
import type { FitnessPoint } from './metrics/fitness.ts';
import { weekdayIndex, weekOfDay } from './time.ts';
import type { ComplianceBand } from './types.ts';

// ---------------------------------------------------------------- types

export type FlagRuleId =
  | 'hrv-low'
  | 'rhr-high'
  | 'sleep-short'
  | 'soreness-high'
  | 'mood-low-under-load'
  | 'ramp-high'
  | 'form-deep'
  | 'key-missed';

export type Severity = 'info' | 'watch' | 'act';
export type FlagStatus = 'open' | 'acknowledged' | 'resolved';
export type FlagResolution = 'auto' | 'coach' | 'no-data' | 'week-ended';
export type FlagValues = Record<string, number | string>;

export interface RuleResult {
  ruleId: FlagRuleId;
  state: 'true' | 'false' | 'no-data';
  /** The "values shown" for this rule, unrounded. */
  values: FlagValues;
  /** When state is false: whether the rule's "resolves itself" condition holds today. */
  clear?: boolean;
}

/** What the rules read from a check-in. The full CheckIn types satisfy it. */
export interface FlagCheckIn {
  day: number;
  sleepHours: number;
  soreness: number;
  mood: number;
  hrvMs?: number | null | undefined;
  restingHr?: number | null | undefined;
  unwell?: null | undefined | { kind: 'ill' | 'injured'; note: string };
}

export interface FlagPlanned {
  id: string;
  athleteId?: string;
  day: number;
  sport: string;
  title: string;
  keySession: boolean;
}

export interface FlagEvaluation {
  plannedId: string;
  band?: ComplianceBand | undefined;
}

export interface AthleteData {
  /** First name, for the explanation text. */
  name: string;
  checkIns: readonly FlagCheckIn[];
  /** Fitness series from `fitnessSeries`; the first point is the start of history. */
  fitness: readonly FitnessPoint[];
  planned: readonly FlagPlanned[];
  /** From `evaluateCompliance`. */
  evaluations: readonly FlagEvaluation[];
}

export interface FlagRecord {
  /** `${athleteId}:${ruleId}:${openedDay}`, with `#2`, `#3` added if that id is already taken. */
  id: string;
  athleteId: string;
  ruleId: FlagRuleId;
  severity: Severity;
  status: FlagStatus;
  openedDay: number;
  lastTrueDay: number;
  /** Consecutive evaluated days on which the rule's clear condition held. */
  clearDays: number;
  /** Consecutive days of no-data. */
  noDataDays: number;
  valuesAtOpen: FlagValues;
  valuesLatest: FlagValues;
  /** Plain-English explanation built from the latest values. */
  explanation: string;
  acknowledgedDay?: number;
  resolvedDay?: number;
  resolution?: FlagResolution;
  notes: Array<{ day: number; text: string }>;
  /** Internal: makes running the rules twice on one day harmless. */
  lastEvalDay?: number;
  clearBase?: number;
  noDataBase?: number;
}

/** Per athlete: rules resolved by hand while still true, waiting to be re-armed. */
export type QuietRules = Partial<Record<FlagRuleId, true>>;

export interface FlagsState {
  flags: FlagRecord[];
  quiet: QuietRules;
}

// ---------------------------------------------------------------- rule metadata

export interface RuleMeta {
  id: FlagRuleId;
  title: string;
  severity: Severity;
  ruleText: string;
  suggestedAction: string;
  athleteNote: string;
  /** Consecutive clear days needed to resolve by itself. */
  clearDaysNeeded: number;
}

export const RULES: Readonly<Record<FlagRuleId, RuleMeta>> = {
  'hrv-low': {
    id: 'hrv-low',
    title: 'HRV below usual',
    severity: 'watch',
    ruleText: '7-day average HRV below usual (baseline minus half a standard deviation)',
    suggestedAction:
      "Look at the last week's load and sleep. If a hard session is due in the next two days, consider making it easy or moving it, and ask how they feel.",
    athleteNote:
      'Your recovery numbers have been a little lower than usual this week. Easy sessions and good sleep usually bring them back.',
    clearDaysNeeded: 2,
  },
  'rhr-high': {
    id: 'rhr-high',
    title: 'Resting HR up',
    severity: 'watch',
    ruleText: 'Resting heart rate at least 7 bpm above baseline, two mornings running',
    suggestedAction: 'Ask how they feel. If they feel unwell, swap the next two days for rest or easy sessions.',
    athleteNote:
      'Your resting heart rate has been a bit higher than usual for two mornings. Take it easy if you feel run-down, and tell Coach how you are.',
    clearDaysNeeded: 1,
  },
  'sleep-short': {
    id: 'sleep-short',
    title: 'Short sleep',
    severity: 'info',
    ruleText: "Under 6 hours' sleep, two nights running",
    suggestedAction:
      'Check whether a key session is due in the next two days and whether it can move. Ask if something is getting in the way of sleep.',
    athleteNote: 'Two short nights in a row. An early night will do more for your training than any session today.',
    clearDaysNeeded: 1,
  },
  'soreness-high': {
    id: 'soreness-high',
    title: 'Sore two days',
    severity: 'watch',
    ruleText: 'Soreness 4 or more, two days running',
    suggestedAction:
      'Ask where it hurts and whether it is general muscle soreness or one sharp spot. Swap running for swimming or easy riding until it settles. If the pain is sharp, in a joint or getting worse, suggest they see a physiotherapist.',
    athleteNote:
      "You've been quite sore two days running. Go easy today, and tell Coach where it's sore so they can adjust the plan.",
    clearDaysNeeded: 1,
  },
  'mood-low-under-load': {
    id: 'mood-low-under-load',
    title: 'Low mood, heavy load',
    severity: 'act',
    ruleText: 'Mood 2 or less while Form is below −25',
    suggestedAction:
      "Talk to them today; don't rely on a plan change alone. Unless a race is close, plan two to three easy days.",
    athleteNote:
      "Thanks for being honest about how you feel. You've been training hard, and that can weigh on anyone. Coach knows and may check in with you.",
    clearDaysNeeded: 2,
  },
  'ramp-high': {
    id: 'ramp-high',
    title: 'Fast ramp',
    severity: 'watch',
    ruleText: 'Fitness up more than 8 in 7 days',
    suggestedAction:
      "If the jump was planned, such as a camp week, acknowledge it. If not, trim next week's volume and keep the key sessions.",
    athleteNote:
      "Your training has built up quickly this week. That's fine for a short while, and Coach is keeping an eye on it.",
    clearDaysNeeded: 2,
  },
  'form-deep': {
    id: 'form-deep',
    title: 'Deep fatigue',
    severity: 'act',
    ruleText: 'Form below −30',
    suggestedAction:
      "Put recovery days in now, and make sure the next key session doesn't land on top of this fatigue.",
    athleteNote: "You're carrying a lot of tiredness right now. Rest days are part of the plan, not a break from it.",
    clearDaysNeeded: 2,
  },
  'key-missed': {
    id: 'key-missed',
    title: 'Key sessions missed',
    severity: 'watch',
    ruleText: '2 or more key sessions missed this week',
    suggestedAction:
      "Ask what got in the way. Move one key session into next week or drop it, but don't stack both into the weekend.",
    athleteNote: "A couple of key sessions didn't happen this week. That's okay. Coach will help reshuffle.",
    clearDaysNeeded: 1,
  },
};

export const RULE_IDS: readonly FlagRuleId[] = [
  'hrv-low',
  'rhr-high',
  'sleep-short',
  'soreness-high',
  'mood-low-under-load',
  'ramp-high',
  'form-deep',
  'key-missed',
];

/** Fitness, Fatigue, Form and Ramp need this many days of training history. */
export const MIN_HISTORY_DAYS = 42;
export const NO_DATA_RESOLVE_DAYS = 7;
export const NOTE_MAX_CHARS = 280;

// ---------------------------------------------------------------- rule evaluation

interface Ctx {
  d: number;
  data: AthleteData;
  byDay: Map<number, FlagCheckIn>;
}

type Outcome = Omit<RuleResult, 'ruleId'>;

const noData = (values: FlagValues = {}): Outcome => ({ state: 'no-data', values });

function pointOn(ctx: Ctx, day: number): FitnessPoint | undefined {
  return ctx.data.fitness.find((p) => p.day === day);
}

/** True when day `d` has at least 42 days of training history behind it. */
function hasHistory(ctx: Ctx): boolean {
  const first = ctx.data.fitness[0];
  return first !== undefined && ctx.d - first.day >= MIN_HISTORY_DAYS;
}

const avg = (xs: readonly number[]): number => xs.reduce((s, v) => s + v, 0) / xs.length;

function hrvLow(ctx: Ctx): Outcome {
  const { d, byDay } = ctx;
  const win: number[] = [];
  const daily: string[] = [];
  for (let day = d - 6; day <= d; day++) {
    const v = byDay.get(day)?.hrvMs;
    if (v === null || v === undefined) daily.push('-');
    else {
      win.push(v);
      daily.push(String(v));
    }
  }
  if (win.length < 4) return noData({ readings: win.length, daily: daily.join(',') });
  const b = baseline(readingsOf(ctx.data.checkIns, 'hrvMs'), d - 6);
  if (!b) return noData({ readings: win.length, daily: daily.join(',') });
  const avg7 = avg(win);
  const line = b.mean - 0.5 * b.sd;
  const values: FlagValues = { avg7, readings: win.length, mean: b.mean, sd: b.sd, line, daily: daily.join(',') };
  const fires = avg7 < line;
  return { state: fires ? 'true' : 'false', values, clear: !fires };
}

/**
 * Shared shape for the "two days running" rules. `bad(x)` is the per-day trigger; the clear
 * condition is that both days are not bad.
 */
function twoDay(
  read: (c: FlagCheckIn | undefined) => number | undefined,
  bad: (x: number) => boolean,
  ctx: Ctx,
  values: (t: number, y: number | undefined) => FlagValues,
): Outcome {
  const t = read(ctx.byDay.get(ctx.d));
  if (t === undefined) return noData();
  const y = read(ctx.byDay.get(ctx.d - 1));
  const v = values(t, y);
  if (!bad(t)) return { state: 'false', values: v, clear: y !== undefined && !bad(y) };
  if (y === undefined) return noData(v);
  if (!bad(y)) return { state: 'false', values: v, clear: false };
  return { state: 'true', values: v };
}

function rhrHigh(ctx: Ctx): Outcome {
  const { d } = ctx;
  const b: Baseline | null = baseline(readingsOf(ctx.data.checkIns, 'restingHr'), d - 1);
  if (!b) return noData();
  const read = (c: FlagCheckIn | undefined) => c?.restingHr ?? undefined;
  return twoDay(read, (x) => x - b.mean >= 7, ctx, (t, y) => {
    const v: FlagValues = { today: t, mean: b.mean, sd: b.sd, diffToday: t - b.mean };
    if (y !== undefined) {
      v.yesterday = y;
      v.diffYesterday = y - b.mean;
    }
    return v;
  });
}

function sleepShort(ctx: Ctx): Outcome {
  const last7: number[] = [];
  for (let day = ctx.d - 6; day <= ctx.d; day++) {
    const c = ctx.byDay.get(day);
    if (c) last7.push(c.sleepHours);
  }
  return twoDay(
    (c) => c?.sleepHours,
    (x) => x < 6,
    ctx,
    (t, y) => {
      const v: FlagValues = { last: t, avg7: avg(last7) };
      if (y !== undefined) v.before = y;
      return v;
    },
  );
}

function sorenessHigh(ctx: Ctx): Outcome {
  const loads: number[] = [];
  for (let day = ctx.d - 2; day <= ctx.d; day++) {
    const p = pointOn(ctx, day);
    if (p) loads.push(p.load);
  }
  const note = ctx.byDay.get(ctx.d)?.unwell?.note;
  return twoDay(
    (c) => c?.soreness,
    (x) => x >= 4,
    ctx,
    (t, y) => {
      const v: FlagValues = { today: t };
      if (y !== undefined) v.yesterday = y;
      if (loads.length === 3) v.load3 = loads.reduce((s, x) => s + x, 0);
      if (note) v.unwellNote = note;
      return v;
    },
  );
}

function moodLow(ctx: Ctx): Outcome {
  const c = ctx.byDay.get(ctx.d);
  if (!c) return noData();
  if (c.mood > 2) return { state: 'false', values: { mood: c.mood }, clear: true };
  const p = hasHistory(ctx) ? pointOn(ctx, ctx.d) : undefined;
  if (!p) return noData({ mood: c.mood });
  const values: FlagValues = { mood: c.mood, form: p.form, fitness: p.fitness, fatigue: p.fatigue, ramp: p.ramp };
  const fires = p.form < -25;
  return { state: fires ? 'true' : 'false', values, clear: !fires };
}

function rampHigh(ctx: Ctx): Outcome {
  const p = hasHistory(ctx) ? pointOn(ctx, ctx.d - 1) : undefined;
  if (!p) return noData();
  let load7 = 0;
  for (let day = ctx.d - 7; day <= ctx.d - 1; day++) load7 += pointOn(ctx, day)?.load ?? 0;
  const values: FlagValues = { ramp: p.ramp, fitness: p.fitness, fitnessWeekAgo: p.fitness - p.ramp, load7 };
  const fires = p.ramp > 8;
  return { state: fires ? 'true' : 'false', values, clear: !fires };
}

function formDeep(ctx: Ctx): Outcome {
  const p = hasHistory(ctx) ? pointOn(ctx, ctx.d) : undefined;
  if (!p) return noData();
  let daysBelow = 0;
  for (let day = ctx.d; ; day--) {
    const q = pointOn(ctx, day);
    if (!q || !(q.form < -30)) break;
    daysBelow++;
  }
  const values: FlagValues = { form: p.form, fitness: p.fitness, fatigue: p.fatigue, daysBelow };
  const fires = p.form < -30;
  return { state: fires ? 'true' : 'false', values, clear: !fires };
}

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
const SPORT_NAMES: Record<string, string> = {
  swim: 'Swim',
  bike: 'Bike',
  run: 'Run',
  strength: 'Strength',
  other: 'Other',
};

function keyMissed(ctx: Ctx, athleteId: string): Outcome {
  const weekStart = ctx.d - weekdayIndex(ctx.d);
  const band = new Map(ctx.data.evaluations.map((e) => [e.plannedId, e.band]));
  const keys = ctx.data.planned.filter(
    (p) =>
      p.keySession &&
      (p.athleteId === undefined || p.athleteId === athleteId) &&
      p.day >= weekStart &&
      p.day <= weekStart + 6,
  );
  const missed = keys.filter((p) => p.day < ctx.d && band.get(p.id) === 'missed').sort((a, b) => a.day - b.day);
  const done = keys.filter((p) => p.day < ctx.d && band.get(p.id) !== undefined && band.get(p.id) !== 'missed').length;
  const list = missed
    .map((p) => `${DAY_NAMES[weekdayIndex(p.day)] ?? ''} ${SPORT_NAMES[p.sport] ?? p.sport} ${p.title}`)
    .join(', ');
  const values: FlagValues = { count: missed.length, missed: list, done, planned: keys.length };
  const fires = missed.length >= 2;
  return { state: fires ? 'true' : 'false', values, clear: !fires };
}

function makeCtx(d: number, data: AthleteData): Ctx {
  return { d, data, byDay: new Map(data.checkIns.map((c) => [c.day, c])) };
}

/** Run all eight rules for one athlete on day `d`. Uses nothing after day `d`. */
export function evaluateRules(athleteId: string, d: number, data: AthleteData): RuleResult[] {
  const ctx = makeCtx(d, data);
  const results: Record<FlagRuleId, Outcome> = {
    'hrv-low': hrvLow(ctx),
    'rhr-high': rhrHigh(ctx),
    'sleep-short': sleepShort(ctx),
    'soreness-high': sorenessHigh(ctx),
    'mood-low-under-load': moodLow(ctx),
    'ramp-high': rampHigh(ctx),
    'form-deep': formDeep(ctx),
    'key-missed': keyMissed(ctx, athleteId),
  };
  return RULE_IDS.map((ruleId) => ({ ruleId, ...results[ruleId] }));
}

// ---------------------------------------------------------------- explanations

const MINUS = '−';

function signed(s: string): string {
  return s.startsWith('-') ? MINUS + s.slice(1) : s;
}

/** Whole number, or more decimals if rounding would make it look equal to `threshold`. */
function near(x: number, threshold: number): string {
  let dp = 0;
  let r = roundHalfAway(x, dp);
  while (r === threshold && x !== threshold && dp < 4) {
    dp++;
    r = roundHalfAway(x, dp);
  }
  return signed(r.toFixed(dp));
}

const n0 = (x: unknown): string => signed(roundHalfAway(Number(x), 0).toFixed(0));
const n1 = (x: unknown): string => signed(roundHalfAway(Number(x), 1).toFixed(1));
const plus1 = (x: unknown): string => (Number(x) >= 0 ? '+' : '') + n1(x);

/** The plain explanation for the coach, with the athlete as "they". */
export function explainFlag(ruleId: FlagRuleId, name: string, v: FlagValues): string {
  switch (ruleId) {
    case 'hrv-low':
      return `${name}'s heart-rate variability has averaged ${n0(v.avg7)} ms over the last 7 days, below their usual ${n0(v.mean)} ms. HRV usually dips when the body is short of recovery: hard training, short sleep, illness, heat, travel or stress. One low morning means little. A low weekly average is a pattern worth a look.`;
    case 'rhr-high':
      return `${name}'s resting heart rate has been at least 7 bpm above their baseline for two mornings. A raised resting heart rate often comes with fatigue, an illness starting, short sleep, dehydration or heat. Two mornings in a row makes a one-off reading less likely.`;
    case 'sleep-short':
      return `${name} has slept under 6 hours for two nights. Short sleep slows recovery and makes hard sessions feel harder than they are.`;
    case 'soreness-high':
      return `${name} has rated soreness 4 or more for two days. That is more than the usual stiffness after training, and it can be the start of an injury.`;
    case 'mood-low-under-load':
      return `${name} rated their mood ${n0(v.mood)} out of 5 while carrying heavy fatigue (Form ${near(Number(v.form), -25)}). Low mood has many causes, but low mood in a heavy block is one of the earliest signs of overreaching.`;
    case 'ramp-high':
      return `${name}'s Fitness rose by ${near(Number(v.ramp), 8)} in the last 7 days. A rise of more than 8 a week means load is climbing fast. Held for several weeks, it raises the chance of illness and injury.`;
    case 'form-deep':
      return `${name}'s Form is ${near(Number(v.form), -30)}: fatigue is far ahead of fitness. Short dips happen in hard blocks. Staying this low for long leads to staleness, illness or injury.`;
    case 'key-missed':
      return `${name} has missed ${n0(v.count)} key sessions this week. Key sessions carry the most training value in a week. Two misses usually mean the week was too full or something came up.`;
  }
}

function ordinal(n: number): string {
  const m = n % 100;
  if (m >= 11 && m <= 13) return `${n}th`;
  const suffix = { 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] ?? 'th';
  return `${n}${suffix}`;
}

/**
 * One-line summary of the values seen, as shown on the flag card.
 * `on` names the day the values were measured, when that is not today, so "today" and "last night" never go stale.
 */
export function summariseValues(ruleId: FlagRuleId, v: FlagValues, on?: string): string {
  const at = on ? ` on ${on}` : '';
  switch (ruleId) {
    case 'hrv-low':
      return `7-day average ${n0(v.avg7)} ms${on ? ` to ${on}` : ''} (${n0(v.readings)} readings) · usual ${n0(v.mean)} ms ± ${n0(v.sd)} · line ${n0(v.line)} ms`;
    case 'rhr-high':
      return on
        ? `${n0(v.today)} bpm on ${on}, ${n0(v.yesterday)} bpm the day before · baseline ${n0(v.mean)} bpm · +${n0(v.diffToday)} and +${n0(v.diffYesterday)}`
        : `${n0(v.today)} bpm this morning, ${n0(v.yesterday)} bpm yesterday · baseline ${n0(v.mean)} bpm · +${n0(v.diffToday)} and +${n0(v.diffYesterday)}`;
    case 'sleep-short':
      return on
        ? `${n1(v.last)} h the night to ${on}, ${n1(v.before)} h the night before · 7-day average ${n1(v.avg7)} h`
        : `${n1(v.last)} h last night, ${n1(v.before)} h the night before · 7-day average ${n1(v.avg7)} h`;
    case 'soreness-high':
      return (
        (on ? `Soreness ${n0(v.today)} on ${on}, ${n0(v.yesterday)} the day before` : `Soreness ${n0(v.today)} today, ${n0(v.yesterday)} yesterday`) +
        (v.load3 === undefined ? '' : ` · last 3 days' load ${n0(v.load3)}`)
      );
    case 'mood-low-under-load':
      return `Mood ${n0(v.mood)}${on ? at : ' today'} · Form ${near(Number(v.form), -25)} (Fitness ${n0(v.fitness)}, Fatigue ${n0(v.fatigue)}) · Ramp ${plus1(v.ramp)}`;
    case 'ramp-high':
      return on
        ? `Ramp +${near(Number(v.ramp), 8)} in the week to ${on} · Fitness ${n1(v.fitness)}, ${n1(v.fitnessWeekAgo)} a week before`
        : `Ramp +${near(Number(v.ramp), 8)} · Fitness ${n1(v.fitness)} now, ${n1(v.fitnessWeekAgo)} a week ago`;
    case 'form-deep':
      return `Form ${near(Number(v.form), -30)} (Fitness ${n0(v.fitness)}, Fatigue ${n0(v.fatigue)})${at} · ${ordinal(Number(v.daysBelow))} day below ${MINUS}30`;
    case 'key-missed':
      return `Missed: ${String(v.missed)} · ${n0(v.done)} of ${n0(v.planned)} key sessions done`;
  }
}

/**
 * A flag's values line as seen on `today`: the latest values (or those at opening), dated when they
 * were measured on an earlier day. `dayLabel` formats a day, such as "9 Nov".
 */
export function flagValuesLine(
  f: FlagRecord,
  which: 'latest' | 'open',
  today: number,
  dayLabel: (day: number) => string,
): string {
  const checked = which === 'open' ? f.openedDay : f.lastTrueDay;
  // Ramp reads Fitness up to the day before the check, so its values are dated by that day.
  const measured = f.ruleId === 'ramp-high' ? checked - 1 : checked;
  const values = which === 'open' ? f.valuesAtOpen : f.valuesLatest;
  return summariseValues(f.ruleId, values, measured < today ? dayLabel(measured) : undefined);
}

/**
 * The first part of a flag's latest values line, for compact rows such as the Check-ins inbox.
 * Every dated line keeps its date in this part, so a short row never passes old values off as new.
 */
export function flagValuesShort(f: FlagRecord, today: number, dayLabel: (day: number) => string): string {
  return flagValuesLine(f, 'latest', today, dayLabel).split(' · ')[0] ?? '';
}


// ---------------------------------------------------------------- lifecycle

export const emptyFlagsState = (): FlagsState => ({ flags: [], quiet: {} });

export const isActive = (f: FlagRecord): boolean => f.status !== 'resolved';

/** Open flags only: acknowledged ones stay in the inbox but do not count towards the badge. */
export function badgeCount(flags: readonly FlagRecord[]): number {
  return flags.filter((f) => f.status === 'open').length;
}

function closed(f: FlagRecord, day: number, resolution: FlagResolution): FlagRecord {
  return { ...f, status: 'resolved', resolvedDay: day, resolution };
}

/** Snapshot the counters when a new day starts, so same-day re-runs do not double count. */
function advance(f: FlagRecord, d: number): FlagRecord {
  if (f.lastEvalDay !== undefined && d <= f.lastEvalDay) return f;
  return { ...f, lastEvalDay: d, clearBase: f.clearDays, noDataBase: f.noDataDays };
}

/**
 * Apply the rules for day `d` to the athlete's flags. Call it when a check-in or activity is
 * saved, after a plan change, at start-up and at local midnight; calling it twice for the same
 * day gives the same result.
 */
export function stepFlags(athleteId: string, d: number, data: AthleteData, prev: FlagsState): FlagsState {
  let flags = prev.flags.slice();
  const quiet: QuietRules = { ...prev.quiet };
  const replace = (f: FlagRecord) => {
    flags = flags.map((x) => (x.id === f.id ? f : x));
  };

  // A key-missed flag lives for its week only.
  for (const f of flags) {
    if (f.athleteId === athleteId && f.ruleId === 'key-missed' && isActive(f) && weekOfDay(f.openedDay) < weekOfDay(d)) {
      replace(closed(f, d, 'week-ended'));
    }
  }

  for (const r of evaluateRules(athleteId, d, data)) {
    const meta = RULES[r.ruleId];
    const active = flags.find((f) => f.athleteId === athleteId && f.ruleId === r.ruleId && isActive(f));

    if (r.state === 'no-data') {
      if (!active) continue;
      const adv = advance(active, d);
      const next = { ...adv, noDataDays: (adv.noDataBase ?? 0) + 1 };
      replace(next.noDataDays >= NO_DATA_RESOLVE_DAYS ? closed(next, d, 'no-data') : next);
      continue;
    }

    if (r.state === 'false') {
      delete quiet[r.ruleId];
      if (!active) continue;
      const adv = advance(active, d);
      const clearDays = r.clear ? (adv.clearBase ?? 0) + 1 : 0;
      const next = { ...adv, clearDays, noDataDays: 0 };
      replace(clearDays >= meta.clearDaysNeeded ? closed(next, d, 'auto') : next);
      continue;
    }

    if (active) {
      replace({
        ...advance(active, d),
        lastTrueDay: d,
        clearDays: 0,
        noDataDays: 0,
        valuesLatest: r.values,
        explanation: explainFlag(r.ruleId, data.name, r.values),
      });
    } else if (!quiet[r.ruleId]) {
      // A flag resolved and re-opened on the same day must not share its id (suffix #2, #3, ...).
      const baseId = `${athleteId}:${r.ruleId}:${d}`;
      let id = baseId;
      for (let n = 2; flags.some((x) => x.id === id); n++) id = `${baseId}#${n}`;
      flags.push({
        id,
        athleteId,
        ruleId: r.ruleId,
        severity: meta.severity,
        status: 'open',
        openedDay: d,
        lastTrueDay: d,
        clearDays: 0,
        noDataDays: 0,
        valuesAtOpen: r.values,
        valuesLatest: r.values,
        explanation: explainFlag(r.ruleId, data.name, r.values),
        notes: [],
        lastEvalDay: d,
        clearBase: 0,
        noDataBase: 0,
      });
    }
  }
  return { flags, quiet };
}

/** Replay the rules day by day, the way the seed builds flag history. */
export function replayFlags(
  athleteId: string,
  fromDay: number,
  toDay: number,
  data: AthleteData,
  initial: FlagsState = emptyFlagsState(),
): FlagsState {
  let state = initial;
  for (let d = fromDay; d <= toDay; d++) state = stepFlags(athleteId, d, data, state);
  return state;
}

function update(state: FlagsState, id: string, fn: (f: FlagRecord) => FlagRecord): FlagsState {
  return { ...state, flags: state.flags.map((f) => (f.id === id ? fn(f) : f)) };
}

/** Coach acknowledges an open flag. Other states are left alone. */
export function acknowledgeFlag(state: FlagsState, id: string, day: number): FlagsState {
  return update(state, id, (f) => (f.status === 'open' ? { ...f, status: 'acknowledged', acknowledgedDay: day } : f));
}

/**
 * Coach resolves a flag. If the rule was still true, it goes quiet until it has been false once.
 * `note` (up to 280 characters) is saved with the flag.
 */
export function resolveFlag(state: FlagsState, id: string, day: number, note?: string): FlagsState {
  const target = state.flags.find((f) => f.id === id);
  if (!target || !isActive(target)) return state;
  const text = note?.trim().slice(0, NOTE_MAX_CHARS);
  const next = update(state, id, (f) => {
    const resolved = closed(f, day, 'coach');
    return text ? { ...resolved, notes: [...f.notes, { day, text }] } : resolved;
  });
  const stillTrue = target.clearDays === 0;
  return stillTrue ? { ...next, quiet: { ...next.quiet, [target.ruleId]: true } } : next;
}

/** The fields a coach action changes. Everything else on a record belongs to the rules. */
export type FlagLifecycle = Pick<FlagRecord, 'status' | 'acknowledgedDay' | 'resolvedDay' | 'resolution' | 'notes'>;

export function lifecycleOf(f: FlagRecord): FlagLifecycle {
  return {
    status: f.status,
    notes: f.notes,
    ...(f.acknowledgedDay === undefined ? {} : { acknowledgedDay: f.acknowledgedDay }),
    ...(f.resolvedDay === undefined ? {} : { resolvedDay: f.resolvedDay }),
    ...(f.resolution === undefined ? {} : { resolution: f.resolution }),
  };
}

export function sameLifecycle(a: FlagLifecycle, b: FlagLifecycle): boolean {
  return (
    a.status === b.status &&
    a.acknowledgedDay === b.acknowledgedDay &&
    a.resolvedDay === b.resolvedDay &&
    a.resolution === b.resolution &&
    a.notes.length === b.notes.length &&
    a.notes.every((n, i) => n.day === b.notes[i]?.day && n.text === b.notes[i]?.text)
  );
}

/**
 * Undo one coach action on one flag. `after` is how the action left the flag and `before` is how
 * it was. Only that flag's lifecycle fields go back, so other flags and the values the rules have
 * measured since are untouched. `unquiet` removes the quiet mark the action put on the rule.
 *
 * Returns null, and changes nothing, when the undo is stale: the flag is gone, it has changed
 * since the action (another action, a note, or the rules closing it), or the rule has opened a
 * newer flag that an undone resolve would sit beside.
 */
export function undoFlagAction(
  state: FlagsState,
  id: string,
  before: FlagLifecycle,
  after: FlagLifecycle,
  unquiet: boolean,
): FlagsState | null {
  const target = state.flags.find((f) => f.id === id);
  if (!target || !sameLifecycle(lifecycleOf(target), after)) return null;
  // A newer flag of the same rule, active or already closed, owns the rule's state now (the quiet
  // mark too), so an undone resolve would sit beside it and take its mark away.
  const twin = state.flags.some(
    (f) => f.id !== id && f.ruleId === target.ruleId && (isActive(f) || f.openedDay > target.openedDay),
  );
  if (before.status !== 'resolved' && after.status === 'resolved' && twin) return null;
  const { acknowledgedDay: _a, resolvedDay: _r, resolution: _n, ...rest } = target;
  const restored: FlagRecord = { ...rest, ...before };
  const next = update(state, id, () => restored);
  if (!unquiet) return next;
  const { [target.ruleId]: _q, ...quiet } = next.quiet;
  return { ...next, quiet };
}

/** Add a coach-only note of up to 280 characters, in any state. Blank notes are ignored. */
export function addFlagNote(state: FlagsState, id: string, day: number, text: string): FlagsState {
  const t = text.trim().slice(0, NOTE_MAX_CHARS);
  if (!t) return state;
  return update(state, id, (f) => ({ ...f, notes: [...f.notes, { day, text: t }] }));
}
