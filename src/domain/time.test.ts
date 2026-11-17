import { afterEach, describe, expect, it } from 'vitest';
import {
  CURRENT_WEEK,
  currentWeek,
  dateToDay,
  dayToDate,
  dayToIso,
  minuteOfDay,
  now,
  offsetAt,
  nowMinute,
  relativeWeek,
  relativeWeekLabel,
  isoToEpochDay,
  setFixedStart,
  setNow,
  setTimeZone,
  timeZone,
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

afterEach(() => {
  setNow(null);
  setTimeZone(null);
  setFixedStart(null);
});

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

describe('the time zone days are read in', () => {
  it('is Kuala Lumpur unless set', () => {
    expect(timeZone()).toBe('Asia/Kuala_Lumpur');
    expect(offsetAt(Date.parse('2026-11-08T12:00:00Z'))).toBe(8 * 3_600_000);
  });

  it('moves today to the person’s own midnight', () => {
    // 23:30 in London on Sunday is already Monday 07:30 in Kuala Lumpur. Day 0 is fixed, as live.
    setFixedStart(isoToEpochDay('2026-07-27'));
    setNow(new Date('2026-11-08T23:30:00Z'));
    const kl = today();
    expect(setTimeZone('Europe/London')).toBe(true);
    expect(today()).toBe(kl - 1);
    expect(nowMinute()).toBe(23 * 60 + 30);
    setNow(new Date('2026-11-09T00:30:00Z'));
    expect(today()).toBe(kl);
  });

  it('follows daylight saving', () => {
    setTimeZone('America/New_York');
    expect(offsetAt(Date.parse('2026-07-01T12:00:00Z'))).toBe(-4 * 3_600_000);
    expect(offsetAt(Date.parse('2026-12-01T12:00:00Z'))).toBe(-5 * 3_600_000);
    expect(minuteOfDay(Date.parse('2026-07-01T11:15:00Z'))).toBe(7 * 60 + 15);
  });

  it('keeps the zone it had when given a name the browser does not know', () => {
    setTimeZone('Asia/Tokyo');
    expect(setTimeZone('Not/A_Zone')).toBe(false);
    expect(timeZone()).toBe('Asia/Tokyo');
  });
});
