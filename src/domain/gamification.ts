/**
 * Streaks, badges and the track lap. See docs/spec/gamification.md sections 2 to 8.
 * Pure: derives everything from stored items; stores nothing. Matching and weekly compliance
 * come from metrics/compliance.ts.
 */

import type {
  Activity,
  AthleteId,
  CheckIn,
  DayOffset,
  Kudos,
  Phase,
  PlannedWorkout,
  Race,
  Sport,
  Threshold,
} from './types.ts';
import { weekOfDay, weekRange } from './time.ts';
import {
  REST_DAY_KEPT_MAX_LOAD,
  evaluateCompliance,
  roundHalfAway,
  displayPct,
  weeklyCompliance,
} from './metrics/compliance.ts';
import type { ComplianceEvaluation, PlannedEvaluation } from './metrics/compliance.ts';

// ---------- Inputs ----------

export interface WeekExcuse {
  athleteId: string;
  /** 1 = first history week. */
  week: number;
  reason: 'ill' | 'injured' | 'life';
  /** Up to 140 characters, coach side only. */
  note: string;
  day: DayOffset;
}

/** Stored: athleteId -> award ids already shown. */
export type BadgeSeen = Record<string, string[]>;

export interface GamificationInput {
  athleteId: AthleteId;
  today: DayOffset;
  planned: readonly PlannedWorkout[];
  activities: readonly Activity[];
  checkIns: readonly CheckIn[];
  kudos: readonly Kudos[];
  thresholds: readonly Threshold[];
  races: readonly Race[];
  phases: readonly Phase[];
  excuses: readonly WeekExcuse[];
}

// ---------- Shared context ----------

interface Ctx {
  input: GamificationInput;
  planned: PlannedWorkout[];
  activities: Activity[];
  evaluation: ComplianceEvaluation;
  evalByPlanned: Map<string, PlannedEvaluation>;
  evalByActivity: Map<string, PlannedEvaluation>;
}

function mine<T extends { athleteId: string }>(items: readonly T[], id: string): T[] {
  return items.filter((i) => i.athleteId === id);
}

function makeCtx(input: GamificationInput): Ctx {
  const planned = mine(input.planned, input.athleteId);
  const activities = mine(input.activities, input.athleteId).filter((a) => a.day <= input.today);
  const evaluation = evaluateCompliance(planned, activities, input.today);
  const evalByPlanned = new Map(evaluation.planned.map((e) => [e.plannedId, e]));
  const evalByActivity = new Map<string, PlannedEvaluation>();
  for (const e of evaluation.planned) if (e.activityId !== undefined) evalByActivity.set(e.activityId, e);
  return { input, planned, activities, evaluation, evalByPlanned, evalByActivity };
}

function weekWc(ctx: Ctx, week: number): number | null {
  return weeklyCompliance({
    week,
    planned: ctx.planned,
    evaluations: ctx.evaluation.planned,
    activities: ctx.activities,
    todayDay: ctx.input.today,
  });
}

function weekPlanned(ctx: Ctx, week: number): PlannedWorkout[] {
  const { firstDay, lastDay } = weekRange(week);
  return ctx.planned.filter((w) => w.day >= firstDay && w.day <= lastDay);
}

function weekActivities(ctx: Ctx, week: number): Activity[] {
  const { firstDay, lastDay } = weekRange(week);
  return ctx.activities.filter((a) => a.day >= firstDay && a.day <= lastDay);
}

function excuseOf(ctx: Ctx, week: number): WeekExcuse | undefined {
  return ctx.input.excuses.find((e) => e.athleteId === ctx.input.athleteId && e.week === week);
}

/** A week ends at local midnight after its Sunday. */
function hasEnded(ctx: Ctx, week: number): boolean {
  return weekRange(week).lastDay < ctx.input.today;
}

// ---------- Streak ----------

export type StreakWeekStatus = 'counted' | 'below' | 'excused' | 'noPlan';

export interface StreakWeek {
  week: number;
  status: StreakWeekStatus;
  /** Full precision; null when the week has no plan. */
  wc: number | null;
}

export interface StreakResult {
  current: number;
  best: number;
  weeks: StreakWeek[];
  /** The current week's WC so far, or null before anything is due. */
  soFar: number | null;
}

export const STREAK_THRESHOLD = 80;

/** Status of an ended week. Checks run top to bottom. */
export function weekStatus(wc: number | null, excused: boolean): StreakWeekStatus {
  if (wc === null) return 'noPlan';
  if (excused) return 'excused';
  return roundHalfAway(wc, 1) >= STREAK_THRESHOLD ? 'counted' : 'below';
}

/** The streak loop over ended weeks, oldest first. */
export function streakFromWeeks(weeks: ReadonlyArray<{ wc: number | null; excused?: boolean }>): {
  current: number;
  best: number;
  statuses: StreakWeekStatus[];
} {
  let current = 0;
  let best = 0;
  const statuses: StreakWeekStatus[] = [];
  for (const w of weeks) {
    const s = weekStatus(w.wc, w.excused === true);
    statuses.push(s);
    if (s === 'counted') {
      current += 1;
      best = Math.max(best, current);
    } else if (s === 'below') current = 0;
  }
  return { current, best, statuses };
}

export function streak(input: GamificationInput): StreakResult {
  const ctx = makeCtx(input);
  const cw = weekOfDay(input.today);
  const rows: Array<{ week: number; wc: number | null; excused: boolean }> = [];
  for (let w = 1; w < cw; w++) {
    rows.push({ week: w, wc: weekWc(ctx, w), excused: excuseOf(ctx, w) !== undefined });
  }
  const r = streakFromWeeks(rows);
  return {
    current: r.current,
    best: r.best,
    weeks: rows.map((row, i) => ({
      week: row.week,
      status: r.statuses[i] as StreakWeekStatus,
      wc: row.wc,
    })),
    soFar: weekWc(ctx, cw),
  };
}

// ---------- Lap ----------

export const LANE_SPORTS = ['swim', 'bike', 'run', 'strength'] as const;
export type LaneSport = (typeof LANE_SPORTS)[number];
export const CAUTION_ABOVE_PCT = 120;

export interface Lane {
  sport: LaneSport;
  plannedLoad: number;
  doneLoad: number;
  expectedLoad: number;
  plannedDurationS: number;
  doneDurationS: number;
  /** roundHalfAway(100 * done / planned, 1). Not capped. */
  pct: number;
  /** min(pct, 100) / 100. */
  fill: number;
  /** expected / planned, current week only; null otherwise. */
  light: number | null;
  /** pct > 120.0. */
  over: boolean;
}

export type LapStatus = 'current' | 'past' | 'future' | 'noPlan';

export interface LapState {
  week: number;
  status: LapStatus;
  lanes: Lane[];
  /** Infield number. */
  lapPct: number;
  /** Plan by today, current week only. */
  expectedPct: number | null;
  /** All activity load over planned load. */
  totalPct: number;
  caution: boolean;
  /** Activity load in sports without a lane. */
  unlaned: Array<{ sport: Sport; doneLoad: number }>;
  excused: boolean;
  /** A past week that earned a full lap. */
  fullLap: boolean;
  plannedDurationS: number;
  /** Rest days kept so far, and rest days ended so far. */
  restKept: number;
  restEnded: number;
  /** Weekly compliance so far (or final), unrounded; null when nothing is due. */
  wc: number | null;
}

function sumBy<T>(items: readonly T[], f: (t: T) => number): number {
  return items.reduce((s, i) => s + f(i), 0);
}

function restDays(ctx: Ctx, week: number): { kept: number; ended: number } {
  const { firstDay, lastDay } = weekRange(week);
  const trainDays = new Set(weekPlanned(ctx, week).map((w) => w.day));
  let kept = 0;
  let ended = 0;
  for (let d = firstDay; d <= lastDay; d++) {
    if (trainDays.has(d) || d >= ctx.input.today) continue;
    ended += 1;
    const load = sumBy(
      ctx.activities.filter((a) => a.day === d),
      (a) => a.load.load,
    );
    if (load <= REST_DAY_KEPT_MAX_LOAD) kept += 1;
  }
  return { kept, ended };
}

function lapOf(ctx: Ctx, week: number): LapState {
  const today = ctx.input.today;
  const plan = weekPlanned(ctx, week);
  const acts = weekActivities(ctx, week);
  const { firstDay, lastDay } = weekRange(week);
  const status: LapStatus =
    plan.length === 0 ? 'noPlan' : lastDay < today ? 'past' : firstDay > today ? 'future' : 'current';

  const lanes: Lane[] = [];
  for (const sport of LANE_SPORTS) {
    const p = plan.filter((w) => w.sport === sport);
    const plannedLoad = sumBy(p, (w) => w.plannedLoad);
    if (p.length === 0 || plannedLoad <= 0) continue;
    const a = acts.filter((x) => x.sport === sport);
    const doneLoad = sumBy(a, (x) => x.load.load);
    const expectedLoad = sumBy(
      p.filter((w) => w.day <= today),
      (w) => w.plannedLoad,
    );
    const pct = roundHalfAway((100 * doneLoad) / plannedLoad, 1);
    lanes.push({
      sport,
      plannedLoad,
      doneLoad,
      expectedLoad,
      plannedDurationS: sumBy(p, (w) => w.plannedDurationS),
      doneDurationS: sumBy(a, (x) => x.summary.durationS),
      pct,
      fill: Math.min(pct, 100) / 100,
      light: status === 'current' ? expectedLoad / plannedLoad : null,
      over: pct > CAUTION_ABOVE_PCT,
    });
  }

  const planSum = sumBy(lanes, (l) => l.plannedLoad);
  const ratio = (n: number): number => (planSum > 0 ? roundHalfAway((100 * n) / planSum, 1) : 0);
  const lapPct = ratio(sumBy(lanes, (l) => Math.min(l.doneLoad, l.plannedLoad)));
  const expectedPct = status === 'current' ? ratio(sumBy(lanes, (l) => l.expectedLoad)) : null;
  const totalPct = ratio(sumBy(acts, (x) => x.load.load));
  const caution = lanes.some((l) => l.over) || totalPct > CAUTION_ABOVE_PCT;

  const laned = new Set<Sport>(lanes.map((l) => l.sport));
  const unlanedMap = new Map<Sport, number>();
  for (const x of acts) {
    if (laned.has(x.sport)) continue;
    unlanedMap.set(x.sport, (unlanedMap.get(x.sport) ?? 0) + x.load.load);
  }
  const unlaned = [...unlanedMap].map(([sport, doneLoad]) => ({ sport, doneLoad }));

  const rest = restDays(ctx, week);
  const excused = excuseOf(ctx, week) !== undefined;
  const wc = weekWc(ctx, week);
  const state: LapState = {
    week,
    status,
    lanes,
    lapPct,
    expectedPct,
    totalPct,
    caution,
    unlaned,
    excused,
    fullLap: false,
    plannedDurationS: sumBy(plan, (w) => w.plannedDurationS),
    restKept: rest.kept,
    restEnded: rest.ended,
    wc,
  };
  state.fullLap = status === 'past' && isFullLap(ctx, week, state);
  return state;
}

export function lap(input: GamificationInput, week: number): LapState {
  return lapOf(makeCtx(input), week);
}

function isFullLap(ctx: Ctx, week: number, l: LapState): boolean {
  if (l.excused || l.caution || l.restKept !== l.restEnded) return false;
  const plan = weekPlanned(ctx, week);
  if (plan.length === 0) return false;
  return plan.every((w) => {
    const e = ctx.evalByPlanned.get(w.id);
    if (e?.status !== 'matched' || !e.compliance) return false;
    return e.compliance.measure === 'none' || (e.compliance.pct >= 80 && e.compliance.pct <= 120);
  });
}

const SPORT_NAMES: Record<Sport, string> = {
  swim: 'Swim',
  bike: 'Bike',
  run: 'Run',
  strength: 'Strength',
  other: 'Other activity',
};

function hm(seconds: number): string {
  const m = Math.round(seconds / 60);
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
}

/** Planned hours of a lap, for example "6:30 h". */
export function plannedHoursText(l: LapState): string {
  return `${hm(l.plannedDurationS)} h`;
}

function cautionSentences(l: LapState): string[] {
  const out: string[] = [];
  const tail = "That's more than planned. Coach can see it.";
  for (const lane of l.lanes) {
    if (lane.over) out.push(`${SPORT_NAMES[lane.sport]} is at ${displayPct(lane.pct)}% of plan. ${tail}`);
  }
  if (out.length === 0 && l.caution) {
    for (const u of l.unlaned) out.push(`${SPORT_NAMES[u.sport]} wasn't in this week's plan. ${tail}`);
  }
  return out;
}

/** Screen-reader version of the lap (section 5.7). */
export function lapText(l: LapState): { short: string; full: string[] } {
  if (l.status === 'noPlan') return { short: 'No plan this week.', full: ['No plan this week.'] };
  const current = l.status === 'current';
  const head = `This week's lap: ${displayPct(l.lapPct)}% of planned load done${
    current && l.expectedPct !== null ? `, plan by today ${displayPct(l.expectedPct)}%` : ''
  }.`;
  const lanes = l.lanes
    .map((x, i) => `${i === 0 ? SPORT_NAMES[x.sport] : SPORT_NAMES[x.sport].toLowerCase()} ${displayPct(x.pct)}%`)
    .join(', ');
  const caution = cautionSentences(l).join(' ');
  const short = [head, lanes ? `${lanes}.` : '', caution].filter((s) => s !== '').join(' ');

  const full: string[] = l.lanes.map((x) => {
    const base = `${SPORT_NAMES[x.sport]}: ${displayPct(x.pct)}% of planned load, ${hm(x.doneDurationS)} of ${hm(x.plannedDurationS)}.`;
    return current && x.light !== null ? `${base} Plan by today: ${displayPct(roundHalfAway(100 * x.light, 1))}%.` : base;
  });
  if (current) full.push(`Rest days kept so far: ${l.restKept} of ${l.restEnded}.`);
  if (l.wc !== null) full.push(`Weekly compliance so far: ${displayPct(roundHalfAway(l.wc, 1))}%.`);
  return { short, full };
}

// ---------- Badges ----------

export const BADGE_KEYS = [
  'first-brick',
  'bike-100',
  'run-50',
  'swim-5',
  'new-threshold',
  'coach-kudos',
  'check-in-7',
  'full-lap',
  'easy-lap',
  'comeback',
  'race-finisher',
] as const;
export type BadgeKey = (typeof BADGE_KEYS)[number];

export interface BadgeAward {
  /** `{athleteId}:{key}` plus `:{kind}:{day}` or `:{raceId}` for repeating badges. */
  id: string;
  athleteId: AthleteId;
  key: BadgeKey;
  earnedDay: DayOffset;
  /** The activity, check-in, kudos, threshold, race or week behind it. */
  sourceItemId: string;
  /** The earned line for data-driven badges; the UI supplies fixed copy for the rest. */
  line?: string;
}

/** Credited distance of an activity in metres (section 4.2). */
function creditedDistanceM(ctx: Ctx, a: Activity): number {
  const e = ctx.evalByActivity.get(a.id);
  if (!e?.compliance) return 0;
  const d = a.summary.distanceM ?? 0;
  if (e.compliance.measure === 'none') return d;
  return d * Math.min(1, 100 / e.compliance.pct);
}

const DISTANCE_BADGES: Array<{ key: BadgeKey; sport: Sport; reached: (m: number) => boolean }> = [
  { key: 'bike-100', sport: 'bike', reached: (m) => roundHalfAway(m / 1000, 1) >= 100 },
  { key: 'run-50', sport: 'run', reached: (m) => roundHalfAway(m / 1000, 1) >= 50 },
  { key: 'swim-5', sport: 'swim', reached: (m) => Math.round(m) >= 5000 },
];

function byTime(a: Activity, b: Activity): number {
  return a.day - b.day || a.startMinute - b.startMinute;
}

function distanceAwards(ctx: Ctx, out: BadgeAward[]): void {
  const id = ctx.input.athleteId;
  const maxWeek = weekOfDay(ctx.input.today);
  for (const def of DISTANCE_BADGES) {
    for (let w = 1; w <= maxWeek; w++) {
      const acts = weekActivities(ctx, w)
        .filter((a) => a.sport === def.sport)
        .toSorted(byTime);
      let total = 0;
      let hit: Activity | undefined;
      for (const a of acts) {
        total += creditedDistanceM(ctx, a);
        if (def.reached(total)) {
          hit = a;
          break;
        }
      }
      if (hit) {
        out.push({ id: `${id}:${def.key}`, athleteId: ctx.input.athleteId, key: def.key, earnedDay: hit.day, sourceItemId: hit.id });
        break;
      }
    }
  }
}

function brickAward(ctx: Ctx, out: BadgeAward[]): void {
  const matched = ctx.activities.filter((a) => ctx.evalByActivity.get(a.id)?.status === 'matched');
  const rides = matched.filter((a) => a.sport === 'bike' && a.summary.durationS >= 30 * 60);
  const runs = matched.filter((a) => a.sport === 'run' && a.summary.durationS >= 10 * 60);
  let best: Activity | undefined;
  for (const run of runs.toSorted(byTime)) {
    const ok = rides.some((ride) => {
      if (ride.day !== run.day) return false;
      const end = ride.startMinute + ride.summary.durationS / 60;
      return run.startMinute >= ride.startMinute && run.startMinute <= end + 15;
    });
    if (ok) {
      best = run;
      break;
    }
  }
  if (best) {
    out.push({
      id: `${ctx.input.athleteId}:first-brick`,
      athleteId: ctx.input.athleteId,
      key: 'first-brick',
      earnedDay: best.day,
      sourceItemId: best.id,
    });
  }
}

type ThresholdBadgeKind = 'ftp' | 'thresholdPace' | 'css';
const THRESHOLD_KINDS: ThresholdBadgeKind[] = ['ftp', 'thresholdPace', 'css'];

/** Value compared as displayed: whole watts, or whole seconds per km / per 100 m. */
function displayedThreshold(kind: ThresholdBadgeKind, value: number): number {
  if (kind === 'ftp') return Math.round(value);
  return Math.round((kind === 'thresholdPace' ? 1000 : 100) / value);
}

function mmss(s: number): string {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function showThreshold(kind: ThresholdBadgeKind, v: number): string {
  return kind === 'ftp' ? `${v} W` : mmss(v);
}

const THRESHOLD_TITLES: Record<ThresholdBadgeKind, string> = {
  ftp: 'FTP',
  thresholdPace: 'Threshold pace',
  css: 'CSS',
};

function thresholdAwards(ctx: Ctx, out: BadgeAward[]): void {
  const id = ctx.input.athleteId;
  for (const kind of THRESHOLD_KINDS) {
    const rows = ctx.input.thresholds
      .filter((t) => t.athleteId === id && t.kind === kind && t.effectiveFromDay <= ctx.input.today)
      .toSorted((a, b) => a.effectiveFromDay - b.effectiveFromDay);
    let best: number | undefined;
    for (const row of rows) {
      const v = displayedThreshold(kind, row.value);
      if (best === undefined) {
        best = v;
        continue;
      }
      const beats = kind === 'ftp' ? v > best : v < best;
      if (!beats) continue;
      out.push({
        id: `${id}:new-threshold:${kind}:${row.effectiveFromDay}`,
        athleteId: ctx.input.athleteId,
        key: 'new-threshold',
        earnedDay: row.effectiveFromDay,
        sourceItemId: `${kind}:${row.effectiveFromDay}`,
        line: `${THRESHOLD_TITLES[kind]} ${kind === 'ftp' ? 'up' : 'faster'} from ${showThreshold(kind, best)} to ${showThreshold(kind, v)}.`,
      });
      best = v;
    }
  }
}

function kudosAward(ctx: Ctx, out: BadgeAward[]): void {
  const first = ctx.input.kudos
    .filter((k) => k.athleteId === ctx.input.athleteId && k.day <= ctx.input.today)
    .toSorted((a, b) => a.day - b.day)[0];
  if (first) {
    out.push({
      id: `${ctx.input.athleteId}:coach-kudos`,
      athleteId: ctx.input.athleteId,
      key: 'coach-kudos',
      earnedDay: first.day,
      sourceItemId: first.id,
      ...(first.message ? { line: first.message } : {}),
    });
  }
}

function checkInAward(ctx: Ctx, out: BadgeAward[]): void {
  const days = [
    ...new Set(
      ctx.input.checkIns
        .filter((c) => c.athleteId === ctx.input.athleteId && c.day <= ctx.input.today)
        .map((c) => c.day),
    ),
  ].toSorted((a, b) => a - b);
  let run = 0;
  let prev: number | undefined;
  for (const d of days) {
    run = prev !== undefined && d === prev + 1 ? run + 1 : 1;
    prev = d;
    if (run >= 7) {
      const src = ctx.input.checkIns.find((c) => c.athleteId === ctx.input.athleteId && c.day === d);
      out.push({
        id: `${ctx.input.athleteId}:check-in-7`,
        athleteId: ctx.input.athleteId,
        key: 'check-in-7',
        earnedDay: d,
        sourceItemId: src?.id ?? String(d),
      });
      return;
    }
  }
}

function isDownWeek(ctx: Ctx, week: number): boolean {
  return ctx.input.phases
    .filter((p) => p.athleteId === ctx.input.athleteId)
    .some(
      (p) =>
        (p.kind === 'recovery' && week >= p.firstWeek && week <= p.lastWeek) ||
        p.weeklyTargets.some((t) => t.week === week && t.downWeek === true),
    );
}

function weekAwards(ctx: Ctx, out: BadgeAward[]): void {
  const id = ctx.input.athleteId;
  const cw = weekOfDay(ctx.input.today);
  let fullDone = false;
  let easyDone = false;
  let comebackDone = false;
  let pending = false;
  for (let w = 1; w < cw; w++) {
    if (!hasEnded(ctx, w)) break;
    const l = lapOf(ctx, w);
    const ex = excuseOf(ctx, w);
    const status = weekStatus(l.wc, ex !== undefined);
    const sunday = 7 * w - 1;
    const base = { athleteId: ctx.input.athleteId, earnedDay: sunday, sourceItemId: `week:${w}` };
    if (status === 'excused') {
      if (ex && ex.reason !== 'life') pending = true;
      continue;
    }
    if (status === 'noPlan') continue;
    if (!fullDone && l.fullLap) {
      fullDone = true;
      out.push({ ...base, id: `${id}:full-lap`, key: 'full-lap' });
    }
    const clean = status === 'counted' && !l.caution;
    if (!easyDone && clean && isDownWeek(ctx, w) && l.restKept === l.restEnded) {
      easyDone = true;
      out.push({ ...base, id: `${id}:easy-lap`, key: 'easy-lap' });
    }
    if (!comebackDone && pending && clean) {
      comebackDone = true;
      out.push({ ...base, id: `${id}:comeback`, key: 'comeback' });
    }
  }
}

function raceAwards(ctx: Ctx, out: BadgeAward[]): void {
  for (const race of ctx.input.races) {
    if (race.athleteId !== ctx.input.athleteId || race.day > ctx.input.today) continue;
    const legs: Array<{ sport: Sport; km: number }> =
      race.sport === 'triathlon'
        ? [
            { sport: 'swim', km: race.distancesKm[0] ?? 0 },
            { sport: 'bike', km: race.distancesKm[1] ?? 0 },
            { sport: 'run', km: race.distancesKm[2] ?? 0 },
          ]
        : [{ sport: race.sport, km: race.distancesKm[0] ?? 0 }];
    const active = legs.filter((l) => l.km > 0);
    if (active.length === 0) continue;
    const dayActs = ctx.activities.filter((a) => a.day === race.day);
    const ok = active.every((leg) => {
      const m = sumBy(
        dayActs.filter((a) => a.sport === leg.sport),
        (a) => a.summary.distanceM ?? 0,
      );
      return m >= 0.8 * leg.km * 1000;
    });
    if (ok) {
      out.push({
        id: `${ctx.input.athleteId}:race-finisher:${race.id}`,
        athleteId: ctx.input.athleteId,
        key: 'race-finisher',
        earnedDay: race.day,
        sourceItemId: race.id,
        line: `Finished ${race.name}.`,
      });
    }
  }
}

/** Every award from day 0 to `today`, in earned-day order, then catalogue order. */
export function badges(input: GamificationInput): BadgeAward[] {
  const ctx = makeCtx(input);
  const out: BadgeAward[] = [];
  brickAward(ctx, out);
  distanceAwards(ctx, out);
  thresholdAwards(ctx, out);
  kudosAward(ctx, out);
  checkInAward(ctx, out);
  weekAwards(ctx, out);
  raceAwards(ctx, out);
  const order = (k: BadgeKey): number => BADGE_KEYS.indexOf(k);
  return out
    .filter((a) => a.earnedDay <= input.today)
    .toSorted((a, b) => a.earnedDay - b.earnedDay || order(a.key) - order(b.key) || a.id.localeCompare(b.id));
}

/** After a reset, every seeded award counts as already shown. */
export function seenAfterReset(awards: readonly BadgeAward[]): BadgeSeen {
  const seen: BadgeSeen = {};
  for (const a of awards) seen[a.athleteId] = [...(seen[a.athleteId] ?? []), a.id];
  return seen;
}

/** Awards not yet shown, oldest first: the badge-moment queue. */
export function unseenAwards(awards: readonly BadgeAward[], seen: BadgeSeen): BadgeAward[] {
  const shown = new Set(Object.values(seen).flat());
  return awards.filter((a) => !shown.has(a.id));
}
