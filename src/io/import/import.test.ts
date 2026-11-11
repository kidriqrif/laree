import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { buildRideFit, RIDE_START_MS } from './__fixtures__/generate-fit.ts';
import { detectFormat } from './detect.ts';
import { parseImportFile } from './index.ts';
import type { ImportResult, ParsedActivity } from './index.ts';
import { buildStreams, intervalsFromGaps } from './streams.ts';
import { parseXml } from './xml.ts';

const DIR = resolve(process.cwd(), 'src/io/import');
const fixtureText = (name: string) => readFileSync(resolve(DIR, '__fixtures__', name), 'utf8');
const fixture = (name: string) => new Uint8Array(readFileSync(resolve(DIR, '__fixtures__', name)));

function only(result: ImportResult): ParsedActivity {
  if (!result.ok) throw new Error(`expected success, got ${result.error.code}`);
  expect(result.activities).toHaveLength(1);
  return result.activities[0] as ParsedActivity;
}

function errorCode(result: ImportResult): string {
  if (result.ok) throw new Error('expected an error');
  return result.error.code;
}

describe('detection from bytes', () => {
  it('reads each format whatever the file is called', async () => {
    expect(await detectFormat(fixture('run.gpx'), 'x.fit')).toMatchObject({ ok: true, format: 'gpx' });
    expect(await detectFormat(fixture('ride.tcx'), 'x.gpx')).toMatchObject({ ok: true, format: 'tcx' });
    expect(await detectFormat(fixture('ride.fit'), 'x.tcx')).toMatchObject({ ok: true, format: 'fit' });
  });

  it('sees through gzip', async () => {
    for (const [file, format] of [['run.gpx', 'gpx'], ['ride.tcx', 'tcx'], ['ride.fit', 'fit']] as const) {
      const zipped = new Uint8Array(gzipSync(fixture(file)));
      expect(await detectFormat(zipped, `${file}.gz`)).toMatchObject({ ok: true, format });
    }
  });

  it('rejects zip, PDF, empty and unknown files with the right code', async () => {
    const zip = await detectFormat(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0, 0]), 'a.zip');
    expect(zip).toMatchObject({ ok: false, error: { code: 'zip' } });
    const pdf = await detectFormat(new TextEncoder().encode('%PDF-1.7 hello'), 'plan.fit');
    expect(pdf).toMatchObject({ ok: false, error: { code: 'not-supported', hint: 'This looks like a PDF.' } });
    expect(await detectFormat(new Uint8Array(0), 'a.fit')).toMatchObject({ ok: false, error: { code: 'empty' } });
    const csv = await detectFormat(new TextEncoder().encode('a,b,c\n1,2,3\n'), 'a.csv');
    expect(csv).toMatchObject({ ok: false, error: { hint: 'This looks like a CSV file.' } });
  });

  it('reads a UTF-16 GPX and a TCX with leading spaces', async () => {
    const gpx = fixtureText('run.gpx');
    const utf16 = new Uint8Array(2 + gpx.length * 2);
    utf16.set([0xff, 0xfe]);
    for (let i = 0; i < gpx.length; i++) {
      const c = gpx.charCodeAt(i);
      utf16[2 + i * 2] = c & 0xff;
      utf16[3 + i * 2] = c >> 8;
    }
    expect(await detectFormat(utf16, 'a.txt')).toMatchObject({ ok: true, format: 'gpx' });
    const tcx = '   \n  ' + fixtureText('ride.tcx');
    expect(await detectFormat(new TextEncoder().encode(tcx), 'a.tcx')).toMatchObject({ ok: true, format: 'tcx' });
  });

  it('rejects files over 40 MB', async () => {
    const big = new Uint8Array(40 * 1024 * 1024 + 1);
    big[0] = 0x25;
    expect(await detectFormat(big, 'big.fit')).toMatchObject({ ok: false, error: { code: 'too-large' } });
  });
});

describe('xml reader', () => {
  it('handles entities, CDATA, comments, DOCTYPE and namespaces', () => {
    const root = parseXml('<?xml version="1.0"?><!DOCTYPE a [<!ENTITY x "y">]><!-- c --><a:r xmlns:a="u"><n v="1 &amp; 2">&#65;&lt;<![CDATA[<b>]]></n></a:r>');
    expect(root?.name).toBe('r');
    expect(root?.children[0]?.attrs.v).toBe('1 & 2');
    expect(root?.children[0]?.text).toBe('A<<b>');
  });

  it('throws on unbalanced tags', () => {
    expect(() => parseXml('</a>')).toThrow(/tags/);
    expect(() => parseXml('<a><b>')).toThrow(/tags/);
  });
});

describe('GPX', () => {
  it('returns a summary with heart rate, distance and one lap', async () => {
    const a = only(await parseImportFile(fixture('run.gpx'), 'run.gpx'));
    expect(a.format).toBe('gpx');
    expect(a.sport).toBe('run');
    expect(a.startUtc).toBe('2026-10-04T00:00:00.000Z');
    expect(a.timerSeconds).toBe(20);
    expect(a.distanceM).toBeGreaterThan(40);
    expect(a.distanceM).toBeLessThan(60);
    // streams hold one entry per second, so the sample at the very end falls outside them (io.md 10.2)
    expect(a.summary.maxHr).toBe(135);
    expect(a.summary.avgHr).toBeGreaterThan(120);
    expect(a.summary.avgPowerW).toBeNull();
    expect(a.laps).toHaveLength(1);
    expect(a.device).toBe('Laree test');
    // run cadence under 120 is doubled
    expect(a.streams?.cadence?.[0]).toBe(160);
  });

  it('refuses a route with no times', async () => {
    const route = '<gpx><trk><trkseg><trkpt lat="1" lon="1"></trkpt></trkseg></trk></gpx>';
    const r = await parseImportFile(new TextEncoder().encode(route), 'route.gpx');
    expect(errorCode(r)).toBe('no-timestamps');
  });

  it('reads bare power and drops a GPS spike', async () => {
    const pts = [
      ['2026-10-04T00:00:00Z', 3.139, 200],
      ['2026-10-04T00:00:01Z', 3.1391, 210],
      ['2026-10-04T00:00:02Z', 4.5, 220],
      ['2026-10-04T00:00:03Z', 3.1392, 230],
    ]
      .map(([t, lat, p]) => `<trkpt lat="${lat}" lon="101.6"><time>${t}</time><extensions><power>${p}</power></extensions></trkpt>`)
      .join('');
    const gpx = `<gpx><trk><type>cycling</type><trkseg>${pts}</trkseg></trk></gpx>`;
    const a = only(await parseImportFile(new TextEncoder().encode(gpx), 'ride.gpx'));
    expect(a.sport).toBe('bike');
    expect(a.distanceM).toBeLessThan(30);
    expect(a.summary.maxPowerW).toBe(210);
  });
});

describe('TCX', () => {
  it('returns laps, power and the lap totals', async () => {
    const a = only(await parseImportFile(fixture('ride.tcx'), 'ride.tcx'));
    expect(a.sport).toBe('bike');
    expect(a.timerSeconds).toBe(10);
    expect(a.distanceM).toBe(80);
    expect(a.summary.avgHr).toBeCloseTo(125, 0);
    expect(a.summary.maxHr).toBe(130);
    expect(a.summary.avgPowerW).toBeCloseTo(190, 0);
    expect(a.laps).toHaveLength(1);
    expect(a.laps[0]).toMatchObject({ timerS: 10, distanceM: 80, avgHr: 130 });
    expect(a.device).toBe('Test Head Unit');
    expect(a.ascentM).toBe(0);
  });

  it('removes the gap between two Track elements in a lap', async () => {
    const tp = (t: string) => `<Trackpoint><Time>${t}</Time></Trackpoint>`;
    const tcx =
      '<TrainingCenterDatabase><Activities><Activity Sport="Running"><Id>2026-10-05T06:00:00Z</Id>' +
      '<Lap StartTime="2026-10-05T06:00:00Z"><Track>' +
      [0, 1, 2, 3].map((s) => tp(`2026-10-05T06:00:0${s}Z`)).join('') +
      '</Track><Track>' +
      [0, 1, 2].map((s) => tp(`2026-10-05T06:01:0${s}Z`)).join('') +
      '</Track></Lap></Activity></Activities></TrainingCenterDatabase>';
    const a = only(await parseImportFile(new TextEncoder().encode(tcx), 'r.tcx'));
    expect(a.timerSeconds).toBe(5);
    expect(a.elapsedSeconds).toBe(62);
    expect(a.sport).toBe('run');
  });
});

describe('FIT', () => {
  it('reads a ride with a pause, power, heart rate and a lap', async () => {
    const a = only(await parseImportFile(fixture('ride.fit'), 'ride.fit'));
    expect(a.format).toBe('fit');
    expect(a.sport).toBe('bike');
    expect(a.startUtc).toBe(new Date(RIDE_START_MS).toISOString());
    expect(a.timerSeconds).toBe(120);
    expect(a.elapsedSeconds).toBe(140);
    expect(a.distanceM).toBe(960);
    expect(a.summary.avgPowerW).toBeGreaterThan(200);
    expect(a.summary.maxHr).toBeGreaterThan(130);
    expect(a.streams?.n).toBe(120);
    expect(a.streams?.power).toHaveLength(120);
    expect(a.streams?.distance).toHaveLength(121);
    expect(a.laps).toHaveLength(1);
    expect(a.laps[0]).toMatchObject({ startOffsetS: 0, timerS: 120, avgHr: 135, avgPowerW: 210 });
    expect(a.warnings).toEqual([]);
  });

  it('refuses a workout file', async () => {
    expect(errorCode(await parseImportFile(fixture('workout.fit'), 'w.fit'))).toBe('fit-workout');
  });

  it('is the same file in memory as on disk', () => {
    expect(Array.from(buildRideFit())).toEqual(Array.from(fixture('ride.fit')));
  });

  it('imports what it can from a cut-short file', async () => {
    const full = fixture('ride.fit');
    const result = await parseImportFile(full.subarray(0, full.length - 120), 'cut.fit');
    const outcome = result.ok ? (result.activities[0]?.warnings.map((w) => w.code) ?? []).join() : result.error.code;
    expect(['cut-short', 'damaged']).toContain(outcome);
  });
});

describe('bad files store nothing and name the file', () => {
  it('corrupt FIT is damaged', async () => {
    const r = await parseImportFile(fixture('corrupt.fit'), 'corrupt.fit');
    expect(errorCode(r)).toBe('damaged');
    expect(r.ok ? '' : r.error.message).toContain('“corrupt.fit”');
  });

  it('a GPX named .fit is read as GPX', async () => {
    const a = only(await parseImportFile(fixture('renamed.fit'), 'renamed.fit'));
    expect(a.format).toBe('gpx');
  });

  it('an empty file is empty', async () => {
    const r = await parseImportFile(fixture('empty.fit'), 'empty.fit');
    expect(errorCode(r)).toBe('empty');
    expect(r.ok ? '' : r.error.message).toContain('empty.fit');
  });

  it('broken XML is damaged', async () => {
    const r = await parseImportFile(new TextEncoder().encode('<gpx><trk>'), 'x.gpx');
    expect(errorCode(r)).toBe('damaged');
  });

  it('parsing is pure: the same bytes give the same result', async () => {
    const bytes = fixture('run.gpx');
    expect(await parseImportFile(bytes, 'a.gpx')).toEqual(await parseImportFile(bytes, 'a.gpx'));
  });
});

describe('streams', () => {
  const pt = (s: number, extra: Record<string, number> = {}) => ({ t: s * 1000, ...extra });

  it('has n instant entries and n + 1 cumulative entries', () => {
    const pts = [pt(0, { hr: 100, dist: 0, ele: 10 }), pt(5, { hr: 110, dist: 50, ele: 20 })];
    const s = buildStreams(pts, intervalsFromGaps(pts), 5, 'bike');
    expect(s?.hr).toHaveLength(5);
    expect(s?.distance).toHaveLength(6);
    expect(s?.distance?.[3]).toBeCloseTo(30);
    expect(s?.altitude?.[5]).toBe(20);
  });

  it('holds a value for 10 s, then marks it missing', () => {
    const pts = [pt(0, { hr: 100 }), pt(15, { hr: 110 })];
    const s = buildStreams(pts, [{ start: 0, end: 15_000 }], 15, 'bike');
    expect(s?.hr?.[10]).toBe(100);
    expect(Number.isNaN(s?.hr?.[11])).toBe(true);
  });

  it('removes pauses and pads to the file timer total', () => {
    const pts = [pt(0, { hr: 100 }), pt(1, { hr: 100 }), pt(100, { hr: 120 }), pt(101, { hr: 120 })];
    const intervals = intervalsFromGaps(pts);
    const s = buildStreams(pts, intervals, 20, 'bike');
    expect(s?.n).toBe(20);
    expect(s?.hr?.[0]).toBe(100);
    expect(s?.hr?.[1]).toBe(120);
    expect(Number.isNaN(s?.hr?.[19])).toBe(true);
  });

  it('drops running power and thins the trace to 1,000 points', () => {
    const pts = Array.from({ length: 3000 }, (_, i) => pt(i, { power: 200, lat: 3 + i * 1e-5, lon: 101 }));
    const s = buildStreams(pts, intervalsFromGaps(pts), 2999, 'run');
    expect(s?.power).toBeUndefined();
    expect((s?.trace?.length ?? 0) / 2).toBeLessThanOrEqual(1001);
    expect(s?.trace?.[(s.trace.length ?? 2) - 2]).toBeCloseTo(3 + 2999 * 1e-5, 4);
  });
});

describe('FIT SDK loading', () => {
  it('is never imported statically', () => {
    for (const name of readdirSync(DIR).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))) {
      const src = readFileSync(resolve(DIR, name), 'utf8');
      expect(`${name}: ${/^import[^;]*from ['"]@garmin\/fitsdk['"]/m.test(src)}`).toBe(`${name}: false`);
      
    }
  });
});
