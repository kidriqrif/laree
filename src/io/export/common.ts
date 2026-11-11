/**
 * Shared helpers for the workout exporters (.zwo, .mrc, .erg). Pure: no clock, no DOM.
 * See docs/spec/io.md sections 3.1 to 3.6 and 5.
 */
import type { LoadThresholds } from '../../domain/metrics/load.ts';
import type { AthleteId, PlainStep, Sport, Step, StepTarget } from '../../domain/types.ts';

export interface ExportAthlete {
  id: AthleteId;
  name: string;
}

export interface ExportWorkout {
  /** The session title, or the library template's name. */
  title: string;
  sport: Sport;
  steps: Step[];
  /** The coach note for a session, or the template description. */
  description?: string;
  /** Template tags in their stored order, for example ['build', 'threshold']. */
  tags?: string[];
}

export interface ExportInput {
  athlete: ExportAthlete;
  thresholds: LoadThresholds;
  workout: ExportWorkout;
  /** Local date in Asia/Kuala_Lumpur as yyyy-mm-dd for a planned session. Omit for a library template. */
  date?: string;
}

export interface ExportFile {
  fileName: string;
  mimeType: string;
  bytes: Uint8Array;
}

/** Why a workout cannot be written in a format. `reason` is the user-facing sentence. */
export type RefusalCode = 'not-power' | 'no-steps' | 'empty-repeat' | 'no-duration' | 'no-ftp';

export interface ExportRefusal {
  ok: false;
  code: RefusalCode;
  reason: string;
}

export type ExportResult = { ok: true; file: ExportFile } | ExportRefusal;

/** A flat step is one value for its whole length; a ramp moves from start to end. Values are percent of FTP. */
export interface FlatSegment {
  kind: 'flat';
  durationS: number;
  /** Midpoint of the step's range. */
  pct: number;
  note?: string;
}

export interface RampSegment {
  kind: 'ramp';
  durationS: number;
  startPct: number;
  endPct: number;
  note?: string;
}

export type Segment = FlatSegment | RampSegment;

/** One row of a course file: the time in whole seconds from the start, and the value at that moment. */
export interface CourseRow {
  seconds: number;
  pct: number;
}

/** Target used when a step has none (io.md 3.3 and metrics.md 3.1, power basis). */
const POWER_DEFAULT: Record<PlainStep['kind'], number> = {
  warmup: 60,
  steady: 70,
  interval: 95,
  recovery: 50,
  cooldown: 55,
};

const XML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&apos;',
};

const PUNCTUATION: Record<string, string> = {
  '×': 'x',
  '–': '-',
  '—': '-',
  '‘': "'",
  '’': "'",
  '“': '"',
  '”': '"',
  '·': '-',
  '…': '...',
};

/** Text that every trainer and watch format can hold: ASCII only, single spaces (io.md 3.4). */
export function asciiSafe(text: string): string {
  const decomposed = text.normalize('NFKD').replace(/\p{M}+/gu, '');
  const mapped = decomposed.replace(/[×–—‘’“”·…]/g, (c) => PUNCTUATION[c] ?? c);
  return mapped.replace(/[^\x20-\x7e]/g, '').replace(/ {2,}/g, ' ');
}

/** Escapes text for an XML text node or attribute value. */
export function xmlEscape(text: string): string {
  return text.replace(/[&<>"']/g, (c) => XML_ESCAPES[c] ?? c);
}

/** Lower-case file name part: `Threshold 4 × 8` becomes `threshold-4x8` (io.md 3.4). */
export function slug(text: string): string {
  const cleaned = asciiSafe(text)
    .replace(/(\d+)\s*x\s*(\d+)/gi, '$1x$2')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/, '');
  return cleaned || 'workout';
}

/** `laree-{athleteId}-{yyyy-mm-dd}-{slug}.{ext}` for a session, `laree-{athleteId}-{slug}.{ext}` for a template. */
export function fileNameFor(input: ExportInput, ext: string): string {
  const parts = ['laree', input.athlete.id];
  if (input.date) parts.push(input.date);
  parts.push(slug(input.workout.title));
  return `${parts.join('-')}.${ext}`;
}

export function makeFile(fileName: string, mimeType: string, text: string): ExportFile {
  return { fileName, mimeType, bytes: new TextEncoder().encode(text) };
}

export function refuse(code: RefusalCode, reason: string): ExportRefusal {
  return { ok: false, code, reason };
}

const isPowerStep = (s: PlainStep) => !s.target || s.target.kind === 'pctFtp';

function allTargetsPower(steps: Step[]): boolean {
  return steps.every((s) => (s.kind === 'repeat' ? s.steps.every(isPowerStep) : isPowerStep(s)));
}

/** Refuses a workout that is not a bike workout on the power basis. `reason` is the format's own sentence. */
export function checkPower(workout: ExportWorkout, reason: string): ExportRefusal | null {
  if (workout.sport !== 'bike' || !allTargetsPower(workout.steps)) return refuse('not-power', reason);
  return null;
}

/** Refuses empty workouts, empty repeat blocks and steps with no duration. */
export function checkSteps(workout: ExportWorkout): ExportRefusal | null {
  if (workout.steps.length === 0) {
    return refuse('no-steps', 'This workout has no steps to export. Add a step first.');
  }
  for (const s of workout.steps) {
    if (s.kind === 'repeat') {
      if (s.repeat < 1 || s.steps.length === 0) {
        return refuse('empty-repeat', 'Fix the steps first: the repeat block is empty.');
      }
      if (s.steps.some((c) => c.durationS === undefined)) {
        return refuse('no-duration', 'Fix the steps first: every step needs a duration.');
      }
    } else if (s.durationS === undefined) {
      return refuse('no-duration', 'Fix the steps first: every step needs a duration.');
    }
  }
  return null;
}

/** The step's target, with the default for its kind when it has none. */
export function targetOf(step: PlainStep): StepTarget {
  if (step.target) return step.target;
  const v = POWER_DEFAULT[step.kind];
  return { kind: 'pctFtp', low: v, high: v };
}

/** Turns one plain step into a flat or ramp segment (io.md 3.3 items 3 and 4). Assumes checkSteps passed. */
export function segmentOf(step: PlainStep): Segment {
  const target = targetOf(step);
  const durationS = Math.round(step.durationS ?? 0);
  const note = step.note ? step.note : undefined;
  const isRamp = target.low < target.high && (step.kind === 'warmup' || step.kind === 'cooldown');
  if (isRamp) {
    const [startPct, endPct] = step.kind === 'warmup' ? [target.low, target.high] : [target.high, target.low];
    return note === undefined
      ? { kind: 'ramp', durationS, startPct, endPct }
      : { kind: 'ramp', durationS, startPct, endPct, note };
  }
  const pct = (target.low + target.high) / 2;
  return note === undefined ? { kind: 'flat', durationS, pct } : { kind: 'flat', durationS, pct, note };
}

/** Every segment in order, with repeat blocks expanded. */
export function expandSegments(steps: Step[]): Segment[] {
  const out: Segment[] = [];
  for (const s of steps) {
    if (s.kind === 'repeat') {
      for (let r = 0; r < s.repeat; r++) for (const c of s.steps) out.push(segmentOf(c));
    } else {
      out.push(segmentOf(s));
    }
  }
  return out;
}

/**
 * Two rows per segment: its start and its end. Rows are never merged, so a step edge is a vertical
 * line. Time is cumulative whole seconds, so rounding never builds up (io.md 5.1).
 */
export function courseRows(segments: Segment[]): CourseRow[] {
  const rows: CourseRow[] = [];
  let seconds = 0;
  for (const seg of segments) {
    const start = seg.kind === 'flat' ? seg.pct : seg.startPct;
    const end = seg.kind === 'flat' ? seg.pct : seg.endPct;
    rows.push({ seconds, pct: start });
    seconds += seg.durationS;
    rows.push({ seconds, pct: end });
  }
  return rows;
}

/** Minutes with exactly two decimals. */
export function minutesLabel(seconds: number): string {
  return (seconds / 60).toFixed(2);
}

/** The FTP fragment of a description, or nothing when the athlete has no FTP. */
export function ftpPhrase(thresholds: LoadThresholds): string {
  return thresholds.ftp ? `, FTP ${thresholds.ftp} W` : '';
}

/** Joins CRLF lines and ends with CRLF, as course files do. */
export function crlf(lines: string[]): string {
  return lines.join('\r\n') + '\r\n';
}
