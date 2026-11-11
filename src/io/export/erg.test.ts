import { describe, expect, it } from 'vitest';
import { wattsOf, writeErg } from './erg.ts';
import { intervalSession, steadySession, thresholdSession } from './workouts.fixture.ts';
import type { ExportInput } from './common.ts';

const decode = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

/** docs/spec/io.md section 5.3, with tabs and CRLF line endings. */
const SPEC_ERG = [
  '[COURSE HEADER]',
  'VERSION = 2',
  'UNITS = ENGLISH',
  'DESCRIPTION = Threshold 4 x 8 for Amir, FTP 255 W',
  'FILE NAME = laree-amir-2026-11-10-threshold-4x8.erg',
  'FTP = 255',
  'MINUTES WATTS',
  '[END COURSE HEADER]',
  '[COURSE DATA]',
  '0.00\t128',
  '15.00\t191',
  '15.00\t249',
  '23.00\t249',
  '23.00\t140',
  '26.00\t140',
  '26.00\t249',
  '34.00\t249',
  '34.00\t140',
  '37.00\t140',
  '37.00\t249',
  '45.00\t249',
  '45.00\t140',
  '48.00\t140',
  '48.00\t249',
  '56.00\t249',
  '56.00\t140',
  '59.00\t140',
  '59.00\t166',
  '69.00\t115',
  '[END COURSE DATA]',
  '',
].join('\r\n');

function text(input: ExportInput): string {
  const result = writeErg(input);
  if (!result.ok) throw new Error(result.reason);
  return decode(result.file.bytes);
}

describe('writeErg', () => {
  it('writes exactly the spec example for the sample threshold session', () => {
    const result = writeErg(thresholdSession);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.file.fileName).toBe('laree-amir-2026-11-10-threshold-4x8.erg');
    expect(decode(result.file.bytes)).toBe(SPEC_ERG);
  });

  it.each([
    ['steady', steadySession],
    ['interval', intervalSession],
    ['repeat block', thresholdSession],
  ])('matches the snapshot for a %s workout', (_name, input) => {
    expect(text(input)).toMatchSnapshot();
  });

  it('rounds watts half away from zero, multiplying before dividing', () => {
    expect(wattsOf(50, 255)).toBe(128);
    expect(wattsOf(97.5, 255)).toBe(249);
    expect(wattsOf(55, 255)).toBe(140);
  });

  it('refuses a run workout with a reason', () => {
    const result = writeErg({ ...steadySession, workout: { ...steadySession.workout, sport: 'run' } });
    expect(result).toEqual({
      ok: false,
      code: 'not-power',
      reason: '.erg needs a bike workout with power targets.',
    });
  });

  it('refuses an athlete with no FTP, naming them and where to add one', () => {
    const result = writeErg({ ...thresholdSession, thresholds: {} });
    expect(result).toEqual({
      ok: false,
      code: 'no-ftp',
      reason: 'Amir has no FTP yet. Add one in Zones and thresholds.',
    });
  });

  it('refuses an empty repeat block', () => {
    const input: ExportInput = {
      ...thresholdSession,
      workout: { ...thresholdSession.workout, steps: [{ id: 'r', kind: 'repeat', repeat: 2, steps: [] }] },
    };
    expect(writeErg(input)).toMatchObject({ ok: false, code: 'empty-repeat' });
  });
});
