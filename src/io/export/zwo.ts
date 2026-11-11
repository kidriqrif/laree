/**
 * Zwift .zwo writer (docs/spec/io.md section 4). Pure: a workout and an athlete's thresholds in,
 * UTF-8 XML bytes out. Zwift scales the targets to the FTP set inside Zwift, so no FTP is needed.
 */
import type { PlainStep, RepeatStep, Step } from '../../domain/types.ts';
import {
  checkPower,
  checkSteps,
  fileNameFor,
  makeFile,
  segmentOf,
  xmlEscape,
  type ExportInput,
  type ExportResult,
  type FlatSegment,
} from './common.ts';

const MIME_TYPE = 'application/xml';
const INDENT = '    ';

/** A fraction of FTP with up to three decimals and no trailing zeros: 97.5 becomes 0.975, 50 becomes 0.5. */
export function fraction(pct: number): string {
  return String(Number((pct / 100).toFixed(3)));
}

/** A block element; without children it is self-closing. Lines are returned without the trailing newline. */
function block(tag: string, attrs: string, children: string[], indent: string): string[] {
  if (children.length === 0) return [`${indent}<${tag} ${attrs}/>`];
  return [`${indent}<${tag} ${attrs}>`, ...children, `${indent}</${tag}>`];
}

/** A note becomes a textevent that Zwift shows when the segment starts (io.md 4.2). */
function textEvents(note: string | undefined, offsetS: number, indent: string): string[] {
  if (note === undefined) return [];
  return [`${indent}<textevent timeoffset="${offsetS}" message="${xmlEscape(note)}"/>`];
}

/** A plain step at the top level: a warm-up when first, a cool-down when last, otherwise a ramp or steady state. */
function topLevelStep(step: PlainStep, first: boolean, last: boolean, indent: string): string[] {
  const seg = segmentOf(step);
  const inner = indent + INDENT;
  if (seg.kind === 'ramp') {
    const tag = first ? 'Warmup' : last ? 'Cooldown' : 'Ramp';
    const attrs = `Duration="${seg.durationS}" PowerLow="${fraction(seg.startPct)}" PowerHigh="${fraction(seg.endPct)}"`;
    return block(tag, attrs, textEvents(seg.note, 0, inner), indent);
  }
  const attrs = `Duration="${seg.durationS}" Power="${fraction(seg.pct)}"`;
  return block('SteadyState', attrs, textEvents(seg.note, 0, inner), indent);
}

/** A ramp or steady state inside an expanded repeat block: always a plain Ramp or SteadyState. */
function expandedStep(step: PlainStep, indent: string): string[] {
  return topLevelStep(step, false, false, indent);
}

/** A repeat block of exactly two flat steps becomes IntervalsT (io.md 4.2). */
function isIntervalsT(rep: RepeatStep): boolean {
  if (rep.steps.length !== 2) return false;
  return rep.steps.every((c) => segmentOf(c).kind === 'flat');
}

function intervalsT(rep: RepeatStep, indent: string): string[] {
  const [onStep, offStep] = rep.steps as [PlainStep, PlainStep];
  const on = segmentOf(onStep) as FlatSegment;
  const off = segmentOf(offStep) as FlatSegment;
  const attrs =
    `Repeat="${rep.repeat}" OnDuration="${on.durationS}" OffDuration="${off.durationS}" ` +
    `OnPower="${fraction(on.pct)}" OffPower="${fraction(off.pct)}"`;
  const inner = indent + INDENT;
  const children = [...textEvents(on.note, 0, inner), ...textEvents(off.note, on.durationS, inner)];
  return block('IntervalsT', attrs, children, indent);
}

function stepLines(step: Step, first: boolean, last: boolean, indent: string): string[] {
  if (step.kind !== 'repeat') return topLevelStep(step, first, last, indent);
  if (isIntervalsT(step)) return intervalsT(step, indent);
  const out: string[] = [];
  for (let r = 0; r < step.repeat; r++) {
    for (const child of step.steps) out.push(...expandedStep(child, indent));
  }
  return out;
}

/** The description: the coach note, then one sentence about Laree and Zwift. */
function describe(input: ExportInput): string {
  const { athlete, thresholds, workout } = input;
  const ftp = thresholds.ftp ? ` at FTP ${thresholds.ftp} W` : '';
  const sentence = `Planned in Laree for ${athlete.name}${ftp}. Zwift scales targets to the FTP set in Zwift.`;
  const note = workout.description?.trim();
  return note ? `${note} ${sentence}` : sentence;
}

function tagLines(tags: string[]): string[] {
  if (tags.length === 0) return [`${INDENT}<tags/>`];
  return [`${INDENT}<tags>`, ...tags.map((t) => `${INDENT}${INDENT}<tag name="${xmlEscape(t)}"/>`), `${INDENT}</tags>`];
}

/** Writes a Zwift workout file for one workout. Refuses workouts that are not bike workouts on the power basis. */
export function writeZwo(input: ExportInput): ExportResult {
  const refusal =
    checkPower(input.workout, 'Zwift files need a bike workout with power targets.') ?? checkSteps(input.workout);
  if (refusal) return refusal;

  const { steps } = input.workout;
  const body: string[] = [];
  steps.forEach((step, i) => {
    body.push(...stepLines(step, i === 0, i === steps.length - 1, INDENT + INDENT));
  });

  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<workout_file>',
    `${INDENT}<author>Coach</author>`,
    `${INDENT}<name>${xmlEscape(input.workout.title)}</name>`,
    `${INDENT}<description>${xmlEscape(describe(input))}</description>`,
    `${INDENT}<sportType>bike</sportType>`,
    ...tagLines(input.workout.tags ?? []),
    `${INDENT}<workout>`,
    ...body,
    `${INDENT}</workout>`,
    '</workout_file>',
  ];
  const fileName = fileNameFor(input, 'zwo');
  return { ok: true, file: makeFile(fileName, MIME_TYPE, lines.join('\n') + '\n') };
}
