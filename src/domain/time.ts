/**
 * Time model. The only file in the domain that reads the clock.
 * Day 0 is Monday 00:00 (Asia/Kuala_Lumpur, UTC+8, no DST) of history week 1,
 * 16 weeks before the current week (week 17).
 */
import type { DayOffset } from './types.ts';

export const HISTORY_WEEKS = 16;
export const CURRENT_WEEK = HISTORY_WEEKS + 1;
export const KL_OFFSET_MS = 8 * 3_600_000;
const DAY_MS = 86_400_000;

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

/** Whole days since 1970-01-01 of the Kuala Lumpur calendar date at an instant. */
function klEpochDay(instant: Date): number {
  return Math.floor((instant.getTime() + KL_OFFSET_MS) / DAY_MS);
}

/** Epoch day of the runtime start (a Monday). */
export function runtimeStartEpochDay(instant: Date = now()): number {
  const todayEpoch = klEpochDay(instant);
  const sinceMonday = (((todayEpoch + 3) % 7) + 7) % 7; // 1970-01-01 was a Thursday
  return todayEpoch - sinceMonday - 7 * HISTORY_WEEKS;
}

/** Today as a day offset. */
export function today(): DayOffset {
  const instant = now();
  return klEpochDay(instant) - runtimeStartEpochDay(instant);
}

/** Minutes after local midnight now. */
export function nowMinute(): number {
  const local = now().getTime() + KL_OFFSET_MS;
  return Math.floor((((local % DAY_MS) + DAY_MS) % DAY_MS) / 60_000);
}

/** The calendar date of a day offset as a Date at UTC midnight (read it with getUTC*). */
export function dayToDate(day: DayOffset): Date {
  return new Date((runtimeStartEpochDay() + day) * DAY_MS);
}

export function dayToIso(day: DayOffset): string {
  return dayToDate(day).toISOString().slice(0, 10);
}

/** Day offset of a calendar date given as a Date (its Kuala Lumpur date) or YYYY-MM-DD. */
export function dateToDay(date: Date | string): DayOffset {
  const epochDay =
    typeof date === 'string'
      ? Math.floor(Date.parse(`${date}T00:00:00Z`) / DAY_MS)
      : klEpochDay(date);
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
