import { afterEach, describe, expect, it } from 'vitest';
import {
  CURRENT_WEEK,
  currentWeek,
  dateToDay,
  dayToDate,
  dayToIso,
  now,
  nowMinute,
  relativeWeek,
  relativeWeekLabel,
  setNow,
  today,
  weekLabel,
  weekOfDay,
  weekRange,
  weekRangeOfDay,
  weekdayIndex,
} from './time.ts';

// 2026-11-08 is a Sunday; KL = UTC+8.
const SUNDAY_NIGHT = '2026-11-08T23:30:00+08:00';
const MONDAY_MORNING = '2026-11-09T00:30:00+08:00';

afterEach(() => setNow(null));

describe('clock', () => {
  it('reads the real clock by default and can be overridden', () => {
    expect(Math.abs(now().getTime() - Date.now())).toBeLessThan(5000);
    setNow(new Date(SUNDAY_NIGHT));
    expect(now().toISOString()).toBe(new Date(SUNDAY_NIGHT).toISOString());
    setNow(() => new Date(MONDAY_MORNING));
    expect(now().getTime()).toBe(new Date(MONDAY_MORNING).getTime());
    setNow(Date.parse(SUNDAY_NIGHT));
    expect(today()).toBe(118);
  });
});

describe('week boundaries', () => {
  it('Sunday night is the last day of week 17', () => {
    setNow(new Date(SUNDAY_NIGHT));
    expect(today()).toBe(118);
    expect(currentWeek()).toBe(17);
    expect(weekdayIndex(today())).toBe(6);
    expect(nowMinute()).toBe(23 * 60 + 30);
    expect(dayToIso(0)).toBe('2026-07-13');
  });
  it('Monday morning starts a new current week and shifts the start', () => {
    setNow(new Date(MONDAY_MORNING));
    expect(today()).toBe(112);
    expect(currentWeek()).toBe(17);
    expect(weekdayIndex(today())).toBe(0);
    expect(dayToIso(0)).toBe('2026-07-20');
    expect(weekRangeOfDay(today())).toEqual({ week: 17, firstDay: 112, lastDay: 118 });
  });
  it('uses the Kuala Lumpur date, not UTC', () => {
    // 16:30 UTC on Sunday is 00:30 Monday in KL.
    setNow(new Date('2026-11-08T16:30:00Z'));
    expect(weekdayIndex(today())).toBe(0);
    expect(dayToIso(today())).toBe('2026-11-09');
    expect(nowMinute()).toBe(30);
  });
});

describe('conversions', () => {
  it('round-trips offsets and dates', () => {
    setNow(new Date(SUNDAY_NIGHT));
    for (const d of [0, 6, 7, 112, 118, 130]) {
      expect(dateToDay(dayToIso(d))).toBe(d);
      expect(dateToDay(dayToDate(d))).toBe(d);
    }
    expect(dayToDate(0).getUTCDay()).toBe(1);
  });
  it('week numbers and ranges', () => {
    expect(weekOfDay(0)).toBe(1);
    expect(weekOfDay(6)).toBe(1);
    expect(weekOfDay(7)).toBe(2);
    expect(weekOfDay(112)).toBe(CURRENT_WEEK);
    expect(weekOfDay(-1)).toBe(0);
    expect(weekRange(17)).toEqual({ week: 17, firstDay: 112, lastDay: 118 });
    expect(weekdayIndex(-1)).toBe(6);
  });
});

describe('labels', () => {
  it('relative week labels', () => {
    expect(relativeWeekLabel(-1)).toBe('Last week');
    expect(relativeWeekLabel(0)).toBe('This week');
    expect(relativeWeekLabel(1)).toBe('Next week');
    expect(relativeWeekLabel(3)).toBe('In 3 weeks');
    expect(relativeWeekLabel(-3)).toBe('3 weeks ago');
  });
  it('labels by week number', () => {
    setNow(new Date(SUNDAY_NIGHT));
    expect(relativeWeek(20)).toBe(3);
    expect(weekLabel(16)).toBe('Last week');
    expect(weekLabel(17)).toBe('This week');
    expect(weekLabel(20)).toBe('In 3 weeks');
  });
});
