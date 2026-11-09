/** Chart label formatting: en-MY, metric, following docs/spec/metrics.md section 9. */
import type { DayOffset, Sport } from '../domain/types.ts';
import { roundHalfAway } from '../domain/metrics/fitness.ts';
import { dayToDate } from '../domain/time.ts';

export const MINUS = '−';
export const DASH = '–';

const nf = new Map<number, Intl.NumberFormat>();
function formatter(dp: number): Intl.NumberFormat {
  let f = nf.get(dp);
  if (!f) {
    f = new Intl.NumberFormat('en-MY', { minimumFractionDigits: dp, maximumFractionDigits: dp });
    nf.set(dp, f);
  }
  return f;
}

/** Number with thousands commas and a fixed number of decimals; an en dash for non-finite input. */
export function fmtNumber(x: number | null | undefined, dp = 0): string {
  if (x == null || !Number.isFinite(x)) return DASH;
  return formatter(dp).format(roundHalfAway(x, dp));
}

/** Form and Ramp style: plus before positive, true minus before negative, plain 0 for zero. */
export function fmtSigned(x: number | null | undefined, dp = 0): string {
  if (x == null || !Number.isFinite(x)) return DASH;
  const r = roundHalfAway(x, dp);
  if (r === 0) return formatter(dp).format(0);
  return `${r > 0 ? '+' : MINUS}${formatter(dp).format(Math.abs(r))}`;
}

export function fmtPercent(x: number | null | undefined): string {
  return x == null || !Number.isFinite(x) ? DASH : `${fmtNumber(x)}%`;
}

/** Whole minutes as h:mm. */
export function fmtMinutes(minutes: number | null | undefined): string {
  if (minutes == null || !Number.isFinite(minutes)) return DASH;
  const m = Math.max(0, roundHalfAway(minutes));
  const h = Math.floor(m / 60);
  return `${h}:${String(m - h * 60).padStart(2, '0')}`;
}

/** Seconds as h:mm (rounded to the minute), or "45 s" under a minute. */
export function fmtDuration(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds)) return DASH;
  if (seconds < 60) return `${roundHalfAway(Math.max(0, seconds))} s`;
  return fmtMinutes(roundHalfAway(seconds / 60));
}

/** Minutes as a plain-English phrase for text summaries, e.g. "1 h 05 min". */
export function fmtMinutesWords(minutes: number): string {
  if (!Number.isFinite(minutes)) return DASH;
  const m = Math.max(0, roundHalfAway(minutes));
  const h = Math.floor(m / 60);
  if (h === 0) return `${m} min`;
  return `${h} h ${String(m - h * 60).padStart(2, '0')} min`;
}

function clock(totalSeconds: number): string {
  const s = Math.max(0, roundHalfAway(totalSeconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Pace or speed from metres per second: run m:ss /km, swim m:ss /100 m, bike km/h. */
export function fmtPace(mps: number | null | undefined, sport: Sport): string {
  if (mps == null || !Number.isFinite(mps) || mps <= 0) return DASH;
  if (sport === 'run') return `${clock(1000 / mps)} /km`;
  if (sport === 'swim') return `${clock(100 / mps)} /100 m`;
  return `${fmtNumber(mps * 3.6, 1)} km/h`;
}

/** Distance in metres: swim whole metres, others km with one decimal. */
export function fmtDistance(metres: number | null | undefined, sport: Sport): string {
  if (metres == null || !Number.isFinite(metres)) return DASH;
  return sport === 'swim' ? `${fmtNumber(metres)} m` : `${fmtNumber(metres / 1000, 1)} km`;
}

const dayFmt = new Intl.DateTimeFormat('en-MY', { day: 'numeric', month: 'short', timeZone: 'UTC' });

/** A day offset as "12 Oct". */
export function fmtDay(day: DayOffset): string {
  if (!Number.isFinite(day)) return DASH;
  return dayFmt.format(dayToDate(Math.round(day)));
}

/** Replaces NaN and infinities so no SVG attribute is ever NaN. */
export function finite(x: number, fallback = 0): number {
  return Number.isFinite(x) ? x : fallback;
}
