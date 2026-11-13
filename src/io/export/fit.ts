/**
 * .fit workout writer (docs/spec/io.md section 6). The SDK is loaded by dynamic import() only when a
 * file is built, so it never reaches a page's first load. Pure apart from that: the export clock is
 * passed in, never read here.
 */
import type { PlainStep, Sport, Step, StepTarget } from '../../domain/types.ts';
import {
  asciiSafe,
  fileNameFor,
  targetOf,
  type ExportInput,
  type ExportRefusal,
  type RefusalCode,
} from './common.ts';

const MIME_TYPE = 'application/vnd.ant.fit';
/** A common Garmin device limit [verify] (io.md 3.1). */
export const FIT_MAX_STEPS = 50;

export type FitRefusalCode = RefusalCode | 'too-many-steps' | 'no-lthr' | 'no-pace' | 'check-failed';

export interface FitRefusal extends Omit<ExportRefusal, 'code'> {
  code: FitRefusalCode;
}

export type FitResult =
  | { ok: true; file: { fileName: string; mimeType: string; bytes: Uint8Array } }
  | FitRefusal;

export interface FitOptions {
  /** The export clock; goes into file_id.timeCreated. */
  now: Date;
  /** True when the session is marked indoor (indoor cycling, treadmill). */
  indoor?: boolean;
}

type FitMesg = Record<string, string | number | Date>;

const KIND_NAME: Record<PlainStep['kind'], string> = {
  warmup: 'Warm-up',
  steady: 'Steady',
  interval: 'Interval',
  recovery: 'Recovery',
  cooldown: 'Cool-down',
};

const INTENSITY: Record<PlainStep['kind'], string> = {
  warmup: 'warmup',
  steady: 'active',
  interval: 'active',
  recovery: 'recovery',
  cooldown: 'cooldown',
};

function isRefusal(x: FitMesg | FitRefusal): x is FitRefusal {
  return x['ok'] === false;
}

function failure(code: FitRefusalCode, reason: string): FitRefusal {
  return { ok: false, code, reason };
}

/** 32-bit FNV-1a hash of a string. */
export function fnv1a32(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i) & 0xff;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

function sportOf(sport: Sport, indoor: boolean): { sport: string; subSport: string } {
  switch (sport) {
    case 'bike':
      return { sport: 'cycling', subSport: indoor ? 'indoorCycling' : 'generic' };
    case 'run':
      return { sport: 'running', subSport: indoor ? 'treadmill' : 'generic' };
    case 'swim':
      return { sport: 'swimming', subSport: 'lapSwimming' };
    case 'strength':
      return { sport: 'training', subSport: 'strengthTraining' };
    default:
      return { sport: 'generic', subSport: 'generic' };
  }
}

/** Cuts text to at most `max` characters after the ASCII clean-up (ASCII, so bytes too). */
function cut(text: string, max: number): string {
  return asciiSafe(text).slice(0, max).trim();
}

const mmss = (s: number): string => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

/** The text label of an open target, for the step name. */
function openLabel(t: StepTarget, input: ExportInput): string | null {
  if (t.kind === 'rpe') return t.low === t.high ? `RPE ${t.low}` : `RPE ${t.low}-${t.high}`;
  const css = input.thresholds.cssSPer100m;
  if (t.kind === 'pctCss' && css) {
    const fast = mmss(Math.round(css / (t.high / 100)));
    const slow = mmss(Math.round(css / (t.low / 100)));
    return fast === slow ? `${fast} /100 m` : `${fast}-${slow} /100 m`;
  }
  return null;
}

/** Widens a single value by 2 percentage points each side (io.md 3.3 item 4). */
function band(t: StepTarget): { low: number; high: number } {
  return t.low === t.high ? { low: t.low - 2, high: t.high + 2 } : { low: t.low, high: t.high };
}

function plainStep(step: PlainStep, index: number, input: ExportInput): FitMesg | FitRefusal {
  const { workout, thresholds, athlete } = input;
  const mesg: FitMesg = { messageIndex: index };
  let name = KIND_NAME[step.kind];
  if (step.durationS !== undefined) {
    mesg['durationType'] = 'time';
    mesg['durationValue'] = Math.round(step.durationS * 1000);
  } else if (step.distanceM !== undefined && workout.sport !== 'bike') {
    mesg['durationType'] = 'distance';
    mesg['durationValue'] = Math.round(step.distanceM * 100);
  } else {
    return failure('no-duration', 'Fix the steps first: every step needs a duration.');
  }

  const target = workout.sport === 'bike' ? targetOf(step) : step.target;
  let custom: { type: string; low: number; high: number } | null = null;
  if (target) {
    const { low, high } = band(target);
    if (target.kind === 'pctFtp') {
      if (!thresholds.ftp) return failure('no-ftp', `${athlete.name} has no FTP yet. Add one in Zones and thresholds.`);
      custom = {
        type: 'power',
        low: Math.round((low * thresholds.ftp) / 100) + 1000,
        high: Math.round((high * thresholds.ftp) / 100) + 1000,
      };
    } else if (target.kind === 'pctLthr') {
      if (!thresholds.lthr) return failure('no-lthr', `${athlete.name} has no LTHR yet. Add one in Zones and thresholds.`);
      custom = {
        type: 'heartRate',
        low: Math.round((low * thresholds.lthr) / 100) + 100,
        high: Math.round((high * thresholds.lthr) / 100) + 100,
      };
    } else if (target.kind === 'pctThresholdPace') {
      const pace = thresholds.thresholdPaceSPerKm;
      if (!pace) return failure('no-pace', `${athlete.name} has no threshold pace yet. Add one in Zones and thresholds.`);
      const speed = (pct: number) => Math.round(((pct / 100) * 1000 * 1000) / pace);
      custom = { type: 'speed', low: speed(low), high: speed(high) };
    } else {
      const label = openLabel(target, input);
      if (label) name = `${name}, ${label}`;
    }
  }
  mesg['wktStepName'] = cut(name, 40);
  if (step.note) mesg['notes'] = cut(step.note, 254);
  if (custom) {
    mesg['targetType'] = custom.type;
    mesg['targetValue'] = 0;
    mesg['customTargetValueLow'] = custom.low;
    mesg['customTargetValueHigh'] = custom.high;
  } else {
    mesg['targetType'] = 'open';
  }
  mesg['intensity'] = workout.sport === 'swim' && step.kind === 'recovery' ? 'rest' : INTENSITY[step.kind];
  return mesg;
}

function buildSteps(input: ExportInput): FitMesg[] | FitRefusal {
  const out: FitMesg[] = [];
  for (const s of input.workout.steps as Step[]) {
    if (s.kind === 'repeat') {
      if (s.repeat < 1 || s.steps.length === 0) {
        return failure('empty-repeat', 'Fix the steps first: the repeat block is empty.');
      }
      const first = out.length;
      for (const c of s.steps) {
        const m = plainStep(c, out.length, input);
        if (isRefusal(m)) return m;
        out.push(m);
      }
      out.push({
        messageIndex: out.length,
        durationType: 'repeatUntilStepsCmplt',
        durationValue: first,
        targetValue: s.repeat,
      });
    } else {
      const m = plainStep(s, out.length, input);
      if (isRefusal(m)) return m;
      out.push(m);
    }
  }
  return out;
}

interface DecodedLike {
  errors: unknown[];
  messages: {
    fileIdMesgs?: Record<string, unknown>[];
    workoutMesgs?: Record<string, unknown>[];
    workoutStepMesgs?: Record<string, unknown>[];
  };
}

/** Section 6.6: header, CRC, message counts and every main field read back. Throws on any mismatch. */
async function verify(bytes: Uint8Array, steps: FitMesg[]): Promise<void> {
  const { Decoder, Stream } = await import('@garmin/fitsdk');
  if (!Decoder.isFIT(Stream.fromByteArray(bytes))) throw new Error('not a FIT file');
  if (!new Decoder(Stream.fromByteArray(bytes)).checkIntegrity()) throw new Error('integrity check failed');
  const { errors, messages } = new Decoder(Stream.fromByteArray(bytes)).read() as unknown as DecodedLike;
  if (errors.length > 0) throw new Error(`decode errors: ${errors.length}`);
  if (messages.fileIdMesgs?.length !== 1 || messages.fileIdMesgs[0]?.['type'] !== 'workout') {
    throw new Error('file_id is not a workout');
  }
  if (messages.workoutMesgs?.length !== 1) throw new Error('expected one workout message');
  const read = messages.workoutStepMesgs ?? [];
  if (read.length !== steps.length) throw new Error(`expected ${steps.length} steps, read ${read.length}`);
  steps.forEach((written, i) => {
    for (const [key, value] of Object.entries(written)) {
      if (read[i]?.[key] !== value) throw new Error(`step ${i} field ${key} did not read back`);
    }
  });
}

/**
 * The .fit workout for a session or template. Refuses workouts with no steps, more than 50 FIT
 * steps, or a missing threshold the basis needs. A file that fails its own check (io.md 6.6) comes
 * back as the `check-failed` refusal, with the details in the console.
 */
export async function writeFit(input: ExportInput, options: FitOptions): Promise<FitResult> {
  const { workout } = input;
  if (workout.steps.length === 0) {
    return failure('no-steps', 'This workout has no steps to send to a watch.');
  }
  const steps = buildSteps(input);
  if (!Array.isArray(steps)) return steps;
  if (steps.length > FIT_MAX_STEPS) {
    return failure(
      'too-many-steps',
      `This workout needs ${steps.length} watch steps. Garmin watches take up to ${FIT_MAX_STEPS}.`,
    );
  }

  const { Encoder, Profile } = await import('@garmin/fitsdk');
  const num = (name: 'FILE_ID' | 'WORKOUT' | 'WORKOUT_STEP'): number => Profile.MesgNum[name] ?? 0;
  const { sport, subSport } = sportOf(workout.sport, options.indoor === true);
  const key = input.date
    ? `${input.athlete.id}-${input.date}-${workout.title}`
    : `${input.athlete.id}-${workout.title}`;
  const description = workout.description ? cut(workout.description, 254) : '';

  const enc = new Encoder();
  type Writable = Parameters<typeof enc.writeMesg>[0];
  const write = (m: Record<string, unknown>): void => {
    enc.writeMesg(m as unknown as Writable);
  };
  write({
    mesgNum: num('FILE_ID'),
    type: 'workout',
    manufacturer: 'development',
    product: 0,
    serialNumber: fnv1a32(key) || 1,
    timeCreated: options.now,
  });
  write({
    mesgNum: num('WORKOUT'),
    wktName: cut(workout.title, 40),
    sport,
    subSport,
    numValidSteps: steps.length,
    ...(description ? { wktDescription: description } : {}),
    ...(workout.sport === 'swim' ? { poolLength: 25, poolLengthUnit: 'metric' } : {}),
  });
  for (const step of steps) write({ mesgNum: num('WORKOUT_STEP'), ...step });
  const bytes = enc.close();

  try {
    await verify(bytes, steps);
  } catch (error) {
    console.error('fit-check-failed', error);
    return failure('check-failed', "Laree couldn't build a valid .fit file for this workout. Nothing was downloaded.");
  }
  return { ok: true, file: { fileName: fileNameFor(input, 'fit'), mimeType: MIME_TYPE, bytes } };
}
