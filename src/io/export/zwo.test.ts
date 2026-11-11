import { describe, expect, it } from 'vitest';
import { fraction, writeZwo } from './zwo.ts';
import { intervalSession, steadySession, thresholdSession } from './workouts.fixture.ts';
import type { ExportInput } from './common.ts';

const decode = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

/** docs/spec/io.md section 4.3, byte for byte. */
const SPEC_ZWO = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<workout_file>',
  '    <author>Coach</author>',
  '    <name>Threshold 4 × 8</name>',
  '    <description>Even pacing. If interval 4 drops below 242 W, stop there. Planned in Laree for Amir at FTP 255 W. Zwift scales targets to the FTP set in Zwift.</description>',
  '    <sportType>bike</sportType>',
  '    <tags>',
  '        <tag name="build"/>',
  '        <tag name="threshold"/>',
  '    </tags>',
  '    <workout>',
  '        <Warmup Duration="900" PowerLow="0.5" PowerHigh="0.75"/>',
  '        <IntervalsT Repeat="4" OnDuration="480" OffDuration="180" OnPower="0.975" OffPower="0.55">',
  '            <textevent timeoffset="0" message="Seated. Cadence 90 or more."/>',
  '        </IntervalsT>',
  '        <Cooldown Duration="600" PowerLow="0.65" PowerHigh="0.45"/>',
  '    </workout>',
  '</workout_file>',
  '',
].join('\n');

function text(input: ExportInput): string {
  const result = writeZwo(input);
  if (!result.ok) throw new Error(result.reason);
  return decode(result.file.bytes);
}

describe('writeZwo', () => {
  it('writes exactly the spec example for the sample threshold session', () => {
    const result = writeZwo(thresholdSession);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.file.fileName).toBe('laree-amir-2026-11-10-threshold-4x8.zwo');
    expect(result.file.mimeType).toBe('application/xml');
    expect(decode(result.file.bytes)).toBe(SPEC_ZWO);
  });

  it('writes no byte-order mark and LF line endings', () => {
    const out = text(thresholdSession);
    expect(out.charCodeAt(0)).not.toBe(0xfeff);
    expect(out.includes('\r')).toBe(false);
  });

  it.each([
    ['steady', steadySession],
    ['interval', intervalSession],
    ['repeat block', thresholdSession],
  ])('matches the snapshot for a %s workout', (_name, input) => {
    expect(text(input)).toMatchSnapshot();
  });

  it('writes a steady workout as a SteadyState with the midpoint of its range', () => {
    expect(text(steadySession)).toContain('<SteadyState Duration="3600" Power="0.7"/>');
  });

  it('keeps the title text as UTF-8 and escapes XML in notes and tags', () => {
    const input: ExportInput = {
      ...thresholdSession,
      workout: {
        ...thresholdSession.workout,
        tags: ['a&b'],
        steps: [
          {
            id: 'x',
            kind: 'steady',
            durationS: 60,
            target: { kind: 'pctFtp', low: 70, high: 70 },
            note: 'Say "go" & <breathe>',
          },
        ],
      },
    };
    const out = text(input);
    expect(out).toContain('<tag name="a&amp;b"/>');
    expect(out).toContain('message="Say &quot;go&quot; &amp; &lt;breathe&gt;"');
    expect(out).toContain('Threshold 4 × 8');
  });

  it('refuses a run workout with a reason', () => {
    const result = writeZwo({ ...steadySession, workout: { ...steadySession.workout, sport: 'run' } });
    expect(result).toEqual({
      ok: false,
      code: 'not-power',
      reason: 'Zwift files need a bike workout with power targets.',
    });
  });

  it('refuses a bike workout with a heart-rate target', () => {
    const input: ExportInput = {
      ...steadySession,
      workout: {
        ...steadySession.workout,
        steps: [{ id: 'h', kind: 'steady', durationS: 600, target: { kind: 'pctLthr', low: 80, high: 85 } }],
      },
    };
    expect(writeZwo(input)).toMatchObject({ ok: false, code: 'not-power' });
  });

  it('refuses an empty repeat block', () => {
    const input: ExportInput = {
      ...steadySession,
      workout: { ...steadySession.workout, steps: [{ id: 'r', kind: 'repeat', repeat: 3, steps: [] }] },
    };
    expect(writeZwo(input)).toMatchObject({ ok: false, code: 'empty-repeat' });
  });

  it('does not need an FTP, because Zwift scales the targets', () => {
    expect(writeZwo({ ...thresholdSession, thresholds: {} }).ok).toBe(true);
  });
});

describe('fraction', () => {
  it('writes up to three decimals with no trailing zeros', () => {
    expect(fraction(97.5)).toBe('0.975');
    expect(fraction(50)).toBe('0.5');
    expect(fraction(100)).toBe('1');
    expect(fraction(65)).toBe('0.65');
  });
});
