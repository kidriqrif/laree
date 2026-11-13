import { describe, expect, it } from 'vitest';
import { Decoder, Stream } from '@garmin/fitsdk';
import { fnv1a32, writeFit } from './fit.ts';
import { intervalSession, steadySession, thresholdSession } from './workouts.fixture.ts';
import type { ExportInput } from './common.ts';

const NOW = new Date('2026-11-08T02:00:00Z');

async function build(input: ExportInput, indoor = false) {
  const r = await writeFit(input, { now: NOW, indoor });
  if (!r.ok) throw new Error(r.reason);
  return r.file;
}

type Mesgs = Record<string, Record<string, unknown>[]>;

function decode(bytes: Uint8Array): Mesgs {
  expect(Decoder.isFIT(Stream.fromByteArray(bytes))).toBe(true);
  expect(new Decoder(Stream.fromByteArray(bytes)).checkIntegrity()).toBe(true);
  const { messages, errors } = new Decoder(Stream.fromByteArray(bytes)).read();
  expect(errors).toEqual([]);
  return messages as unknown as Mesgs;
}

describe('writeFit', () => {
  it('writes the sample workout as in the spec and reads it back', async () => {
    const file = await build(thresholdSession);
    expect(file.fileName).toBe('laree-amir-2026-11-10-threshold-4x8.fit');
    expect(file.mimeType).toBe('application/vnd.ant.fit');
    // 14-byte header, 452 bytes of records and a 2-byte CRC (docs/spec/io.md 6.7).
    expect(file.bytes.length).toBe(468);
    const m = decode(file.bytes);
    expect(m['fileIdMesgs']).toHaveLength(1);
    expect(m['fileIdMesgs']![0]).toMatchObject({ type: 'workout', manufacturer: 'development', product: 0 });
    expect(m['workoutMesgs']![0]).toMatchObject({
      wktName: 'Threshold 4 x 8',
      sport: 'cycling',
      subSport: 'generic',
      numValidSteps: 5,
      wktDescription: 'Even pacing. If interval 4 drops below 242 W, stop there.',
    });
    const steps = m['workoutStepMesgs']!;
    expect(steps).toHaveLength(5);
    const pick = (i: number) => {
      const s = steps[i]!;
      return [
        s['messageIndex'],
        s['durationType'],
        s['durationValue'],
        s['customTargetValueLow'],
        s['customTargetValueHigh'],
        s['intensity'],
      ];
    };
    expect(pick(0)).toEqual([0, 'time', 900000, 1128, 1191, 'warmup']);
    expect(pick(1)).toEqual([1, 'time', 480000, 1242, 1255, 'active']);
    expect(pick(2)).toEqual([2, 'time', 180000, 1128, 1153, 'recovery']);
    expect(pick(4)).toEqual([4, 'time', 600000, 1115, 1166, 'cooldown']);
    expect(steps[1]!['notes']).toBe('Seated. Cadence 90 or more.');
    expect(steps[0]!['targetValue']).toBe(0);
  });

  it('writes a repeat step that points at the first child and carries the count', async () => {
    const m = decode((await build(thresholdSession)).bytes);
    const rep = m['workoutStepMesgs']![3]!;
    expect(rep['durationType']).toBe('repeatUntilStepsCmplt');
    expect(rep['durationValue']).toBe(1);
    expect(rep['targetValue']).toBe(4);
  });

  it('is byte-for-byte repeatable for the same clock', async () => {
    const a = await build(thresholdSession);
    const b = await build(thresholdSession);
    expect(Array.from(a.bytes)).toEqual(Array.from(b.bytes));
  });

  it('widens a single value by 2 percentage points each side', async () => {
    const m = decode((await build(intervalSession)).bytes);
    const s = m['workoutStepMesgs']![1]!;
    expect(s['customTargetValueLow']).toBe(1000 + Math.round((108 * 255) / 100));
    expect(s['customTargetValueHigh']).toBe(1000 + Math.round((112 * 255) / 100));
  });

  it('uses indoor sub sports when marked', async () => {
    const m = decode((await build(steadySession, true)).bytes);
    expect(m['workoutMesgs']![0]).toMatchObject({ sport: 'cycling', subSport: 'indoorCycling' });
  });

  it('writes pace targets as speed in mm/s, slower end first', async () => {
    const input: ExportInput = {
      athlete: { id: 'danial', name: 'Danial' },
      thresholds: { thresholdPaceSPerKm: 238 },
      workout: {
        title: 'Tempo',
        sport: 'run',
        steps: [{ id: 't', kind: 'steady', durationS: 1200, target: { kind: 'pctThresholdPace', low: 95, high: 100 } }],
      },
    };
    const m = decode((await build(input)).bytes);
    const s = m['workoutStepMesgs']![0]!;
    expect(m['workoutMesgs']![0]).toMatchObject({ sport: 'running' });
    expect(s['targetType']).toBe('speed');
    expect(s['customTargetValueLow']).toBe(3992);
    expect(s['customTargetValueHigh']).toBe(4202);
  });

  it('writes heart rate targets as bpm plus 100', async () => {
    const input: ExportInput = {
      athlete: { id: 'danial', name: 'Danial' },
      thresholds: { lthr: 166 },
      workout: {
        title: 'Easy',
        sport: 'run',
        steps: [{ id: 'e', kind: 'steady', durationS: 1800, target: { kind: 'pctLthr', low: 85, high: 90 } }],
      },
    };
    const s = decode((await build(input)).bytes)['workoutStepMesgs']![0]!;
    expect(s['targetType']).toBe('heartRate');
    expect(s['customTargetValueLow']).toBe(241);
    expect(s['customTargetValueHigh']).toBe(249);
  });

  it('writes swim and effort steps with an open target and the target in the name', async () => {
    const input: ExportInput = {
      athlete: { id: 'amir', name: 'Amir' },
      thresholds: { cssSPer100m: 108 },
      workout: {
        title: 'Swim set',
        sport: 'swim',
        steps: [
          { id: 'a', kind: 'interval', distanceM: 400, target: { kind: 'pctCss', low: 100, high: 105 } },
          { id: 'b', kind: 'recovery', durationS: 30, target: { kind: 'rpe', low: 3, high: 3 } },
        ],
      },
    };
    const m = decode((await build(input)).bytes);
    const [a, b] = m['workoutStepMesgs']!;
    expect(m['workoutMesgs']![0]).toMatchObject({ sport: 'swimming', subSport: 'lapSwimming' });
    expect(a).toMatchObject({
      durationType: 'distance',
      durationValue: 40000,
      targetType: 'open',
      wktStepName: 'Interval, 1:43-1:48 /100 m',
    });
    expect(b).toMatchObject({ intensity: 'rest', wktStepName: 'Recovery, RPE 3' });
  });

  it('refuses an empty workout, a missing threshold and too many steps', async () => {
    const empty = await writeFit({ ...steadySession, workout: { ...steadySession.workout, steps: [] } }, { now: NOW });
    expect(empty).toMatchObject({ ok: false, code: 'no-steps', reason: 'This workout has no steps to send to a watch.' });

    const noFtp = await writeFit({ ...steadySession, thresholds: {} }, { now: NOW });
    expect(noFtp).toMatchObject({
      ok: false,
      code: 'no-ftp',
      reason: 'Amir has no FTP yet. Add one in Zones and thresholds.',
    });

    const hr: ExportInput = {
      athlete: { id: 'danial', name: 'Danial' },
      thresholds: {},
      workout: {
        title: 'x',
        sport: 'run',
        steps: [{ id: 'e', kind: 'steady', durationS: 60, target: { kind: 'pctLthr', low: 80, high: 85 } }],
      },
    };
    expect(await writeFit(hr, { now: NOW })).toMatchObject({
      ok: false,
      code: 'no-lthr',
      reason: 'Danial has no LTHR yet. Add one in Zones and thresholds.',
    });

    const many = Array.from({ length: 54 }, (_, i) => ({
      id: `s${i}`,
      kind: 'steady' as const,
      durationS: 60,
      target: { kind: 'pctFtp' as const, low: 60, high: 70 },
    }));
    const big = await writeFit({ ...steadySession, workout: { ...steadySession.workout, steps: many } }, { now: NOW });
    expect(big).toMatchObject({
      ok: false,
      code: 'too-many-steps',
      reason: 'This workout needs 54 watch steps. Garmin watches take up to 50.',
    });
  });

  it('refuses an empty repeat block', async () => {
    const r = await writeFit(
      {
        ...steadySession,
        workout: { ...steadySession.workout, steps: [{ id: 'r', kind: 'repeat', repeat: 3, steps: [] }] },
      },
      { now: NOW },
    );
    expect(r).toMatchObject({ ok: false, code: 'empty-repeat' });
  });

  it('shows a damaged file through the CRC', async () => {
    const { bytes } = await build(thresholdSession);
    const bad = bytes.slice();
    bad[40] = (bad[40]! ^ 0xff) & 0xff;
    expect(new Decoder(Stream.fromByteArray(bad)).checkIntegrity()).toBe(false);
  });

  it('hashes ids to a 32-bit serial', () => {
    expect(fnv1a32('pw-amir-120-1')).toBeGreaterThan(0);
    expect(fnv1a32('')).toBe(0x811c9dc5);
  });
});
