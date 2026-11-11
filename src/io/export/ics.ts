/**
 * Calendar writer (.ics, RFC 5545) for one planned session or one week of sessions and races
 * (docs/spec/io.md section 7 and the text rules in section 3.4). Pure: plans, thresholds and an
 * injected clock in, UTF-8 bytes out. Day offsets become calendar dates through the runtime start
 * computed from the injected clock, so the output never reads the wall clock itself.
 */
import { formatLoad, roundHalfAway } from '../../domain/metrics/fitness.ts';
import type { LoadThresholds } from '../../domain/metrics/load.ts';
import { runtimeStartEpochDay } from '../../domain/time.ts';
import type {
  DayOffset,
  PlainStep,
  PlannedWorkout,
  Race,
  Sport,
  Step,
  StepTarget,
  StepTargetKind,
} from '../../domain/types.ts';
import {
  crlf,
  makeFile,
  segmentOf,
  slug,
  targetOf,
  type ExportAthlete,
  type ExportFile,
} from './common.ts';

const MIME_TYPE = 'text/calendar; charset=utf-8';
const PRODID = '-//Laree//Laree prototype 0.1//EN';
const TZID = 'Asia/Kuala_Lumpur';
const DAY_MS = 86_400_000;
const MINUTES_PER_DAY = 1440;
const FIRST_LINE_OCTETS = 75;
const CONTINUED_LINE_OCTETS = 74;

const SPORT_LABEL: Record<Sport, string> = {
  swim: 'Swim',
  bike: 'Bike',
  run: 'Run',
  strength: 'Strength',
  other: 'Other',
};

const KIND_LABEL: Record<PlainStep['kind'], string> = {
  warmup: 'warm-up',
  steady: 'steady',
  interval: 'interval',
  recovery: 'recovery',
  cooldown: 'cool-down',
};

/** The unit shown after a value when the athlete has no threshold for the basis (a plain percentage). */
const FALLBACK_UNIT: Record<StepTargetKind, string> = {
  pctFtp: '% FTP',
  pctLthr: '% LTHR',
  pctThresholdPace: '% of threshold pace',
  pctCss: '% of CSS',
  rpe: '',
};

/** The basis a sport uses when no step names one. */
const SPORT_BASIS: Partial<Record<Sport, StepTargetKind>> = {
  bike: 'pctFtp',
  run: 'pctThresholdPace',
  swim: 'pctCss',
};

/** Time-zone block for Asia/Kuala_Lumpur: UTC+8 all year, no daylight saving (io.md 7.4). */
const TIMEZONE_BLOCK: string[] = [
  'BEGIN:VTIMEZONE',
  `TZID:${TZID}`,
  'BEGIN:STANDARD',
  'DTSTART:19700101T000000',
  'TZOFFSETFROM:+0800',
  'TZOFFSETTO:+0800',
  'TZNAME:+08',
  'END:STANDARD',
  'END:VTIMEZONE',
];

export interface SessionIcsInput {
  athlete: ExportAthlete;
  session: PlannedWorkout;
  /** Thresholds in force on the session's day. */
  thresholds: LoadThresholds;
  /** The export clock. Sets DTSTAMP and the runtime start used for dates. */
  now: Date;
  /** Revision of the session: starts at 0 and rises by 1 on every save. Defaults to 0. */
  sequence?: number;
  /** Absolute link to the athlete's workout page, built by the caller from its own address. Omit for none. */
  link?: string;
}

export interface WeekIcsInput {
  athlete: ExportAthlete;
  /** Day offset of the Monday that starts the week. */
  weekStart: DayOffset;
  /** Planned sessions for the athlete. Only those inside the week are written. */
  sessions: PlannedWorkout[];
  /** Races for the athlete. Only those inside the week are written. */
  races: Race[];
  /** Thresholds in force on each day (io.md 3.3, item 1). */
  thresholdsOn: (day: DayOffset) => LoadThresholds;
  /** Revision of each session. Defaults to 0. */
  sequenceOf?: (session: PlannedWorkout) => number;
  /** Absolute workout link for each session. Return undefined for none. */
  linkOf?: (session: PlannedWorkout) => string | undefined;
  /** The export clock. */
  now: Date;
}

interface Stamp {
  dtstamp: string;
  startEpoch: number;
}

/** Text value escaping for TEXT properties (RFC 5545 3.3.11): backslash first, then ; , and line breaks. */
export function escapeText(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n');
}

function octetsOf(ch: string): number {
  const cp = ch.codePointAt(0) ?? 0;
  if (cp < 0x80) return 1;
  if (cp < 0x800) return 2;
  if (cp < 0x10000) return 3;
  return 4;
}

/**
 * Folds one content line at 75 octets of UTF-8, continuation lines starting with one space and holding
 * at most 74 octets. Characters are never split, so a multi-byte character moves whole to the next line.
 */
export function foldLine(line: string): string {
  const pieces: string[] = [];
  let piece = '';
  let used = 0;
  let limit = FIRST_LINE_OCTETS;
  for (const ch of line) {
    const size = octetsOf(ch);
    if (used + size > limit) {
      pieces.push(piece);
      piece = '';
      used = 0;
      limit = CONTINUED_LINE_OCTETS;
    }
    piece += ch;
    used += size;
  }
  pieces.push(piece);
  return pieces.join('\r\n ');
}

const pad2 = (n: number): string => String(n).padStart(2, '0');

/** `45 s`, `8 min`, `2 min 30 s`, `1 h 09 min` (io.md 3.4). Seconds are dropped above one hour. */
export function durationLabel(seconds: number): string {
  const s = Math.max(0, roundHalfAway(seconds));
  if (s < 60) return `${s} s`;
  if (s < 3600) {
    const m = Math.floor(s / 60);
    const r = s % 60;
    return r === 0 ? `${m} min` : `${m} min ${r} s`;
  }
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h} h ${pad2(m)} min`;
}

/** Seconds as `m:ss`, for paces. */
function clockLabel(seconds: number): string {
  const s = Math.max(0, roundHalfAway(seconds));
  return `${Math.floor(s / 60)}:${pad2(s % 60)}`;
}

function stepDuration(step: PlainStep): string {
  if (step.durationS !== undefined) return durationLabel(step.durationS);
  const m = step.distanceM ?? 0;
  return m >= 1000 ? `${String(Number((m / 1000).toFixed(2)))} km` : `${Math.round(m)} m`;
}

interface Absolute {
  /** Number used for ordering: watts, bpm or seconds. */
  n: number;
  text: string;
  unit: string;
}

/** A percentage turned into the athlete's absolute value (io.md 3.3, item 5). Falls back to the percentage. */
function absolute(kind: StepTargetKind, pct: number, t: LoadThresholds): Absolute {
  if (kind === 'pctFtp' && t.ftp) {
    const n = roundHalfAway((pct * t.ftp) / 100);
    return { n, text: String(n), unit: ' W' };
  }
  if (kind === 'pctLthr' && t.lthr) {
    const n = roundHalfAway((pct * t.lthr) / 100);
    return { n, text: String(n), unit: ' bpm' };
  }
  if (kind === 'pctThresholdPace' && t.thresholdPaceSPerKm && pct > 0) {
    const n = roundHalfAway((t.thresholdPaceSPerKm * 100) / pct);
    return { n, text: clockLabel(n), unit: ' /km' };
  }
  if (kind === 'pctCss' && t.cssSPer100m && pct > 0) {
    const n = roundHalfAway((t.cssSPer100m * 100) / pct);
    return { n, text: clockLabel(n), unit: ' /100 m' };
  }
  return { n: pct, text: String(pct), unit: FALLBACK_UNIT[kind] };
}

/** A flat target: one value, or a range sorted from the smaller absolute value to the larger. */
function flatTarget(target: StepTarget, t: LoadThresholds): string {
  if (target.kind === 'rpe') {
    return target.low === target.high ? `RPE ${target.low}` : `RPE ${target.low}-${target.high}`;
  }
  const a = absolute(target.kind, target.low, t);
  const b = absolute(target.kind, target.high, t);
  const pair: [Absolute, Absolute] = a.n <= b.n ? [a, b] : [b, a];
  const [lo, hi] = pair;
  return lo.n === hi.n ? `${lo.text}${lo.unit}` : `${lo.text}-${hi.text}${lo.unit}`;
}

/** A ramp in the order it runs: `from 128 to 191 W` (io.md 3.4). */
function rampTarget(kind: StepTargetKind, start: number, end: number, t: LoadThresholds): string {
  if (kind === 'rpe') return `from RPE ${start} to ${end}`;
  const a = absolute(kind, start, t);
  const b = absolute(kind, end, t);
  return `from ${a.text} to ${b.text}${b.unit}`;
}

/** One step of the summary: `8 min interval at 242-254 W` or `15 min warm-up from 143 to 214 W`. */
function stepPhrase(step: PlainStep, t: LoadThresholds, powerDefault: boolean): string {
  const head = `${stepDuration(step)} ${KIND_LABEL[step.kind]}`;
  // The default target is power: only a bike session may print it for a step with no target of its own.
  if (!step.target && !powerDefault) return head;
  const target = targetOf(step);
  const seg = segmentOf(step);
  if (seg.kind === 'ramp') return `${head} ${rampTarget(target.kind, seg.startPct, seg.endPct, t)}`;
  return `${head} at ${flatTarget(target, t)}`;
}

/** One line per top-level step, or per repeat block: `4 × (8 min interval at 242-254 W + 3 min recovery at 143-157 W)`. */
function summaryLines(steps: Step[], t: LoadThresholds, powerDefault: boolean): string[] {
  return steps.map((s) =>
    s.kind === 'repeat'
      ? `${s.repeat} × (${s.steps.map((c) => stepPhrase(c, t, powerDefault)).join(' + ')})`
      : stepPhrase(s, t, powerDefault),
  );
}

/** The basis the session is planned on: the first step's own target kind, else the sport's default. */
function basisOf(session: PlannedWorkout): StepTargetKind | null {
  const plain = session.steps.flatMap((s) => (s.kind === 'repeat' ? s.steps : [s]));
  const found = plain.find((c) => c.target && c.target.kind !== 'rpe');
  if (found?.target) return found.target.kind;
  return SPORT_BASIS[session.sport] ?? null;
}

/** The athlete's threshold on that basis, or null when it is not set. */
function thresholdPhrase(kind: StepTargetKind, t: LoadThresholds): string | null {
  switch (kind) {
    case 'pctFtp':
      return t.ftp ? `FTP ${t.ftp} W` : null;
    case 'pctLthr':
      return t.lthr ? `LTHR ${t.lthr} bpm` : null;
    case 'pctThresholdPace':
      return t.thresholdPaceSPerKm ? `threshold pace ${clockLabel(t.thresholdPaceSPerKm)} /km` : null;
    case 'pctCss':
      return t.cssSPer100m ? `CSS ${clockLabel(t.cssSPer100m)} /100 m` : null;
    default:
      return null;
  }
}

/** `{duration} · Load {load} · planned at {threshold}`; the last part is left out when no threshold is set. */
function totalsLine(session: PlannedWorkout, t: LoadThresholds): string {
  const parts = [durationLabel(session.plannedDurationS), `Load ${formatLoad(session.plannedLoad)}`];
  const basis = basisOf(session);
  const threshold = basis ? thresholdPhrase(basis, t) : null;
  if (threshold) parts.push(`planned at ${threshold}`);
  return parts.join(' · ');
}

/** Calendar date of a day offset, from the runtime start taken from the injected clock. */
function isoOf(day: DayOffset, startEpoch: number): string {
  return new Date((startEpoch + day) * DAY_MS).toISOString().slice(0, 10);
}

const compactOf = (day: DayOffset, startEpoch: number): string => isoOf(day, startEpoch).replace(/-/g, '');

/** 390 becomes 063000. */
const clockDigits = (minute: number): string => `${pad2(Math.floor(minute / 60))}${pad2(minute % 60)}00`;

/** DTSTAMP is the export clock in UTC, for example 20261108T020000Z. */
function stampOf(now: Date): string {
  return now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function sessionEvent(
  session: PlannedWorkout,
  thresholds: LoadThresholds,
  sequence: number,
  link: string | undefined,
  stamp: Stamp,
): string[] {
  const timed = session.startMinute !== undefined;
  const day = session.day;
  const dates: string[] = [];
  if (session.startMinute === undefined) {
    dates.push(`DTSTART;VALUE=DATE:${compactOf(day, stamp.startEpoch)}`);
    dates.push(`DTEND;VALUE=DATE:${compactOf(day + 1, stamp.startEpoch)}`);
  } else {
    const endMinute = session.startMinute + Math.ceil(session.plannedDurationS / 60);
    const endDay = day + Math.floor(endMinute / MINUTES_PER_DAY);
    dates.push(`DTSTART;TZID=${TZID}:${compactOf(day, stamp.startEpoch)}T${clockDigits(session.startMinute)}`);
    dates.push(
      `DTEND;TZID=${TZID}:${compactOf(endDay, stamp.startEpoch)}T${clockDigits(endMinute % MINUTES_PER_DAY)}`,
    );
  }
  const summary = `${SPORT_LABEL[session.sport]} · ${session.title} · ${durationLabel(session.plannedDurationS)}`;
  const description = [...summaryLines(session.steps, thresholds, session.sport === 'bike'), totalsLine(session, thresholds)];
  if (session.coachNote) description.push(`Coach: ${session.coachNote}`);
  if (link) description.push(`Open in Laree: ${link}`);

  return [
    'BEGIN:VEVENT',
    `UID:${session.id}@laree.app`,
    `DTSTAMP:${stamp.dtstamp}`,
    `SEQUENCE:${sequence}`,
    ...dates,
    `SUMMARY:${escapeText(session.keySession ? `${summary} · key session` : summary)}`,
    `CATEGORIES:${['Laree', SPORT_LABEL[session.sport]].map(escapeText).join(',')}`,
    `DESCRIPTION:${escapeText(description.join('\n'))}`,
    ...(link ? [`URL:${link}`] : []),
    timed ? 'TRANSP:OPAQUE' : 'TRANSP:TRANSPARENT',
    'END:VEVENT',
  ];
}

/** An all-day event for a race; its end date is the next day because DTEND is exclusive. */
function raceEvent(race: Race, stamp: Stamp): string[] {
  const distances = race.distancesKm.map((k) => String(k)).join(' / ');
  return [
    'BEGIN:VEVENT',
    `UID:race.${race.id}@laree.app`,
    `DTSTAMP:${stamp.dtstamp}`,
    'SEQUENCE:0',
    `DTSTART;VALUE=DATE:${compactOf(race.day, stamp.startEpoch)}`,
    `DTEND;VALUE=DATE:${compactOf(race.day + 1, stamp.startEpoch)}`,
    `SUMMARY:${escapeText(`${race.priority} race · ${race.name} · ${distances} km`)}`,
    `CATEGORIES:${['Laree', 'Race'].map(escapeText).join(',')}`,
    'TRANSP:TRANSPARENT',
    'END:VEVENT',
  ];
}

/** Wraps events in a VCALENDAR; the VTIMEZONE block goes in only when some event is timed. */
function calendarText(calendarName: string, events: string[][], anyTimed: boolean): string {
  const header = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:${PRODID}`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(calendarName)}`,
  ];
  const zone = anyTimed ? TIMEZONE_BLOCK : [];
  const lines = [...header, ...zone, ...events.flat(), 'END:VCALENDAR'].map(foldLine);
  return crlf(lines);
}

function calendarNameOf(athlete: ExportAthlete): string {
  return `Laree · ${athlete.name}`;
}

/** `laree-{athleteId}-{yyyy-mm-dd}-{slug(title)}.ics` for one session (io.md 3.4). */
export function sessionIcs(input: SessionIcsInput): ExportFile {
  const startEpoch = runtimeStartEpochDay(input.now);
  const stamp: Stamp = { dtstamp: stampOf(input.now), startEpoch };
  const event = sessionEvent(input.session, input.thresholds, input.sequence ?? 0, input.link, stamp);
  const text = calendarText(
    calendarNameOf(input.athlete),
    [event],
    input.session.startMinute !== undefined,
  );
  const fileName = `laree-${input.athlete.id}-${isoOf(input.session.day, startEpoch)}-${slug(input.session.title)}.ics`;
  return makeFile(fileName, MIME_TYPE, text);
}

/**
 * `laree-{athleteId}-week-{yyyy-mm-dd of the Monday}.ics` for a week. Sessions come first, ordered by day
 * and then by order, then the races of the week ordered by day. Rest days get no event.
 */
export function weekIcs(input: WeekIcsInput): ExportFile {
  const startEpoch = runtimeStartEpochDay(input.now);
  const stamp: Stamp = { dtstamp: stampOf(input.now), startEpoch };
  const last = input.weekStart + 6;
  const inWeek = (day: DayOffset): boolean => day >= input.weekStart && day <= last;

  const sessions = input.sessions
    .filter((s) => inWeek(s.day))
    .toSorted((a, b) => a.day - b.day || a.order - b.order);
  const races = input.races.filter((r) => inWeek(r.day)).toSorted((a, b) => a.day - b.day);

  const events = sessions.map((s) =>
    sessionEvent(s, input.thresholdsOn(s.day), input.sequenceOf?.(s) ?? 0, input.linkOf?.(s), stamp),
  );
  for (const race of races) events.push(raceEvent(race, stamp));

  const anyTimed = sessions.some((s) => s.startMinute !== undefined);
  const text = calendarText(calendarNameOf(input.athlete), events, anyTimed);
  const fileName = `laree-${input.athlete.id}-week-${isoOf(input.weekStart, startEpoch)}.ics`;
  return makeFile(fileName, MIME_TYPE, text);
}
