/**
 * Time model. The only file in the domain that reads the clock.
 * Day 0 is the Monday of history week 1. In the demo it is 16 weeks before the current week (week
 * 17), so the seed always looks current. The live app fixes day 0 to one Monday for good
 * (setFixedStart), so a saved day offset means the same date forever.
 * "Today" and the minute of the day are read in one time zone: Asia/Kuala_Lumpur in the demo, the
 * device's own in the live app (setTimeZone), so a day ends at the person's own midnight.
 */
import type { DayOffset } from './types.ts';

export const HISTORY_WEEKS = 16;
export const CURRENT_WEEK = HISTORY_WEEKS + 1;
export const KL_OFFSET_MS = 8 * 3_600_000;
const DAY_MS = 86_400_000;
export const DEFAULT_TIME_ZONE = 'Asia/Kuala_Lumpur';

let zone = DEFAULT_TIME_ZONE;
let zoneParts: Intl.DateTimeFormat | null = null;
/** The last offset worked out, for one quarter hour: zones change offset only on such a boundary. */
let lastOffset: { bucket: number; offset: number } | null = null;

/** The time zone days are read in, such as "Europe/London". */
export function timeZone(): string {
  return zone;
}

/**
 * Read days in an IANA time zone, or null for the default (Asia/Kuala_Lumpur). A name the browser
 * does not know leaves the zone as it was and returns false.
 */
export function setTimeZone(name: string | null): boolean {
  const next = name || DEFAULT_TIME_ZONE;
  let parts: Intl.DateTimeFormat | null = null;
  if (next !== DEFAULT_TIME_ZONE) {
    try {
      parts = new Intl.DateTimeFormat('en-US', {
        timeZone: next,
        hourCycle: 'h23',
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
        hour: 'numeric',
        minute: 'numeric',
        second: 'numeric',
      });
    } catch {
      return false;
    }
  }
  zone = next;
  zoneParts = parts;
  lastOffset = null;
  return true;
}

/** The zone's offset from UTC at an instant, in milliseconds. Daylight saving is taken into account. */
export function offsetAt(ms: number): number {
  if (!zoneParts) return KL_OFFSET_MS;
  const bucket = Math.floor(ms / 900_000);
  if (lastOffset?.bucket === bucket) return lastOffset.offset;
  const part: Record<string, number> = {};
  for (const p of zoneParts.formatToParts(new Date(ms))) part[p.type] = Number(p.value);
  const asUtc = Date.UTC(part['year'] ?? 1970, (part['month'] ?? 1) - 1, part['day'] ?? 1, part['hour'] ?? 0, part['minute'] ?? 0, part['second'] ?? 0);
  const offset = asUtc - Math.floor(ms / 1000) * 1000;
  lastOffset = { bucket, offset };
  return offset;
}

let clock: () => Date = () => new Date();

/** The current instant. Tests override it with setNow. */
export function now(): Date {
  return clock();
}

/** Override the clock (a Date, a millisecond value or a function); null restores it. */
export function setNow(value: Date | number | (() => Date) | null): void {
  if (value === null) clock = () => new Date();
  else if (typeof value === 'function') clock = value;
  else {
    const fixed = new Date(value);
    clock = () => new Date(fixed.getTime());
  }
}

/** Whole days since 1970-01-01 of the calendar date at an instant, in the time zone. */
function localEpochDay(instant: Date): number {
  const ms = instant.getTime();
  return Math.floor((ms + offsetAt(ms)) / DAY_MS);
}

/** Minutes after local midnight at an instant, in the time zone. */
export function minuteOfDay(ms: number): number {
  const local = ms + offsetAt(ms);
  return Math.floor((((local % DAY_MS) + DAY_MS) % DAY_MS) / 60_000);
}

let fixedStart: number | null = null;

/** Fix day 0 to an epoch day (a Monday), or null to roll with the current week as the demo does. */
export function setFixedStart(epochDay: number | null): void {
  if (epochDay !== null && (((epochDay + 3) % 7) + 7) % 7 !== 0) throw new Error('Day 0 must be a Monday');
  fixedStart = epochDay;
}

/** Epoch day of a YYYY-MM-DD calendar date. */
export function isoToEpochDay(iso: string): number {
  return Math.floor(Date.parse(`${iso}T00:00:00Z`) / DAY_MS);
}

/** Epoch day of the runtime start (a Monday). */
export function runtimeStartEpochDay(instant: Date = now()): number {
  if (fixedStart !== null) return fixedStart;
  const todayEpoch = localEpochDay(instant);
  const sinceMonday = (((todayEpoch + 3) % 7) + 7) % 7; // 1970-01-01 was a Thursday
  return todayEpoch - sinceMonday - 7 * HISTORY_WEEKS;
}

/** Today as a day offset. */
export function today(): DayOffset {
  const instant = now();
  return localEpochDay(instant) - runtimeStartEpochDay(instant);
}

/** Minutes after local midnight now. */
export function nowMinute(): number {
  return minuteOfDay(now().getTime());
}

/** The calendar date of a day offset as a Date at UTC midnight (read it with getUTC*). */
export function dayToDate(day: DayOffset): Date {
  return new Date((runtimeStartEpochDay() + day) * DAY_MS);
}

export function dayToIso(day: DayOffset): string {
  return dayToDate(day).toISOString().slice(0, 10);
}

/** Day offset of a calendar date given as a Date (its date in the time zone) or YYYY-MM-DD. */
export function dateToDay(date: Date | string): DayOffset {
  const epochDay =
    typeof date === 'string'
      ? Math.floor(Date.parse(`${date}T00:00:00Z`) / DAY_MS)
      : localEpochDay(date);
  return epochDay - runtimeStartEpochDay();
}

/** Week number (1-based) containing a day. Weeks start Monday. */
export function weekOfDay(day: DayOffset): number {
  return Math.floor(day / 7) + 1;
}

export function currentWeek(): number {
  return weekOfDay(today());
}

/** 0 = Monday ... 6 = Sunday. */
export function weekdayIndex(day: DayOffset): number {
  return ((day % 7) + 7) % 7;
}

export interface WeekRange {
  week: number;
  firstDay: DayOffset;
  lastDay: DayOffset;
}

export function weekRange(week: number): WeekRange {
  const firstDay = 7 * (week - 1);
  return { week, firstDay, lastDay: firstDay + 6 };
}

export function weekRangeOfDay(day: DayOffset): WeekRange {
  return weekRange(weekOfDay(day));
}

/** Weeks from the current week: 0 this week, -1 last week, 3 in 3 weeks. */
export function relativeWeek(week: number): number {
  return week - currentWeek();
}

export function relativeWeekLabel(offset: number): string {
  if (offset === 0) return 'This week';
  if (offset === -1) return 'Last week';
  if (offset === 1) return 'Next week';
  if (offset > 1) return `In ${offset} weeks`;
  return `${-offset} weeks ago`;
}

export function weekLabel(week: number): string {
  return relativeWeekLabel(relativeWeek(week));
}

/** Weeks of plan the screens show beyond the current week. */
export const PLAN_WEEKS_AHEAD = 12;

/** The last week the plan screens reach: the current week plus PLAN_WEEKS_AHEAD (week 29 in the demo). */
export function lastPlanWeek(): number {
  return weekOfDay(today()) + PLAN_WEEKS_AHEAD;
}
