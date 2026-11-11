import { describe, expect, it } from 'vitest';
import { writeMrc } from './mrc.ts';
import { intervalSession, steadySession, thresholdSession } from './workouts.fixture.ts';
import type { ExportInput } from './common.ts';

const decode = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

/** docs/spec/io.md section 5.2, with tabs and CRLF line endings. */
const SPEC_MRC = [
  '[COURSE HEADER]',
  'VERSION = 2',
  'UNITS = ENGLISH',
  'DESCRIPTION = Threshold 4 x 8 for Amir, FTP 255 W',
  'FILE NAME = laree-amir-2026-11-10-threshold-4x8.mrc',
  'MINUTES PERCENT',
  '[END COURSE HEADER]',
  '[COURSE DATA]',
  '0.00\t50.00',
  '15.00\t75.00',
  '15.00\t97.50',
  '23.00\t97.50',
  '23.00\t55.00',
  '26.00\t55.00',
  '26.00\t97.50',
  '34.00\t97.50',
  '34.00\t55.00',
  '37.00\t55.00',
  '37.00\t97.50',
  '45.00\t97.50',
  '45.00\t55.00',
  '48.00\t55.00',
  '48.00\t97.50',
  '56.00\t97.50',
  '56.00\t55.00',
  '59.00\t55.00',
  '59.00\t65.00',
  '69.00\t45.00',
  '[END COURSE DATA]',
  '',
].join('\r\n');

function text(input: ExportInput): string {
  const result = writeMrc(input);
  if (!result.ok) throw new Error(result.reason);
  return decode(result.file.bytes);
}

describe('writeMrc', () => {
  it('writes exactly the spec example for the sample threshold session', () => {
    const result = writeMrc(thresholdSession);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.file.fileName).toBe('laree-amir-2026-11-10-threshold-4x8.mrc');
    expect(result.file.mimeType).toBe('text/plain');
    expect(decode(result.file.bytes)).toBe(SPEC_MRC);
  });

  it('writes ASCII with CRLF on every line, including the last', () => {
    const out = text(thresholdSession);
    expect([...out].every((c) => c.charCodeAt(0) >= 0x20 || c === '\t' || c === '\r' || c === '\n')).toBe(true);
    expect([...out].every((c) => c.charCodeAt(0) < 0x7f)).toBe(true);
    expect(out.endsWith('[END COURSE DATA]\r\n')).toBe(true);
    expect(out.split('\r\n').length - 1).toBe(out.split('\n').length - 1);
  });

  it.each([
    ['steady', steadySession],
    ['interval', intervalSession],
    ['repeat block', thresholdSession],
  ])('matches the snapshot for a %s workout', (_name, input) => {
    expect(text(input)).toMatchSnapshot();
  });

  it('refuses a run workout with a reason', () => {
    const result = writeMrc({ ...steadySession, workout: { ...steadySession.workout, sport: 'run' } });
    expect(result).toEqual({
      ok: false,
      code: 'not-power',
      reason: '.mrc needs a bike workout with power targets.',
    });
  });

  it('refuses a swim workout with a pace target', () => {
    const input: ExportInput = {
      ...steadySession,
      workout: {
        ...steadySession.workout,
        steps: [{ id: 'p', kind: 'steady', durationS: 600, target: { kind: 'pctThresholdPace', low: 90, high: 95 } }],
      },
    };
    expect(writeMrc(input)).toMatchObject({ ok: false, code: 'not-power' });
  });

  it('refuses an empty workout', () => {
    expect(writeMrc({ ...steadySession, workout: { ...steadySession.workout, steps: [] } })).toMatchObject({
      ok: false,
      code: 'no-steps',
    });
  });

  it('does not need an FTP: percentages are scaled by the trainer app', () => {
    expect(writeMrc({ ...thresholdSession, thresholds: {} }).ok).toBe(true);
  });
});
