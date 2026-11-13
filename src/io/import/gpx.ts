import { assemble, parseIsoTime } from './assemble.ts';
import { decodeText } from './detect.ts';
import { importError } from './errors.ts';
import { haversineM, intervalsFromGaps, intervalsTotalS } from './streams.ts';
import type { ImportResult, RawPoint } from './types.ts';
import { child, childrenNamed, findDeep, numOf, parseXml, textOf } from './xml.ts';
import type { XmlNode } from './xml.ts';
import type { Sport } from '../../domain/types.ts';

const MAX_SPEED_MPS = 50;

function sportFromType(type: string | undefined): Sport | null {
  const t = (type ?? '').toLowerCase();
  if (t.includes('run')) return 'run';
  if (t.includes('bik') || t.includes('cycl') || t.includes('ride')) return 'bike';
  if (t.includes('swim')) return 'swim';
  if (t.includes('walk') || t.includes('hik')) return 'other';
  return null;
}

function extNum(ext: XmlNode | undefined, names: string[]): number | undefined {
  return numOf(findDeep(ext, names));
}

export function parseGpx(bytes: Uint8Array, fileName: string): ImportResult {
  let root: XmlNode | null;
  try {
    root = parseXml(decodeText(bytes));
  } catch {
    return { ok: false, error: importError('damaged', fileName) };
  }
  if (!root || root.name !== 'gpx') return { ok: false, error: importError('damaged', fileName) };

  const trks = childrenNamed(root, 'trk');
  let rawCount = 0;
  const raw: RawPoint[] = [];
  const segStarts: number[] = [];
  for (const trk of trks) {
    for (const seg of childrenNamed(trk, 'trkseg')) {
      let first = true;
      for (const pt of childrenNamed(seg, 'trkpt')) {
        rawCount++;
        const t = parseIsoTime(textOf(child(pt, 'time')));
        if (!Number.isFinite(t)) continue;
        const lat = Number(pt.attrs.lat);
        const lon = Number(pt.attrs.lon);
        const p: RawPoint = { t };
        if (pt.attrs.lat !== undefined && Number.isFinite(lat) && pt.attrs.lon !== undefined && Number.isFinite(lon)) {
          p.lat = lat;
          p.lon = lon;
        }
        const ele = numOf(child(pt, 'ele'));
        if (ele !== undefined) p.ele = ele;
        const ext = child(pt, 'extensions');
        const hr = extNum(ext, ['hr', 'heartrate']);
        if (hr !== undefined) p.hr = hr;
        const power = extNum(ext, ['power', 'powerinwatts', 'watts']);
        if (power !== undefined) p.power = power;
        const cad = extNum(ext, ['cad', 'cadence']);
        if (cad !== undefined) p.cad = cad;
        const temp = extNum(ext, ['atemp', 'temp']);
        if (temp !== undefined) p.temp = temp;
        if (first) segStarts.push(t);
        first = false;
        raw.push(p);
      }
    }
  }
  if (raw.length === 0) {
    const planned = rawCount > 0 || childrenNamed(root, 'rte').length > 0 || childrenNamed(root, 'wpt').length > 0;
    return { ok: false, error: importError(planned ? 'no-timestamps' : 'no-data', fileName) };
  }

  // Sort by time; duplicate times keep the last point.
  raw.sort((a, b) => a.t - b.t);
  const dedup: RawPoint[] = [];
  for (const p of raw) {
    const last = dedup[dedup.length - 1];
    if (last && last.t === p.t) dedup[dedup.length - 1] = p;
    else dedup.push(p);
  }

  // Drop GPS spikes and accumulate distance.
  const points: RawPoint[] = [];
  let prevGeo: RawPoint | undefined;
  let dist = 0;
  for (const p of dedup) {
    if (p.lat !== undefined && p.lon !== undefined) {
      if (prevGeo) {
        const d = haversineM(prevGeo.lat as number, prevGeo.lon as number, p.lat, p.lon);
        const dt = (p.t - prevGeo.t) / 1000;
        if (dt > 0 && d / dt > MAX_SPEED_MPS) continue;
        dist += d;
      }
      prevGeo = p;
      p.dist = dist;
    }
    points.push(p);
  }

  const intervals = intervalsFromGaps(points, 20_000, segStarts.slice(1));
  const first = points[0] as RawPoint;
  const last = points[points.length - 1] as RawPoint;
  const sport = sportFromType(textOf(child(trks[0], 'type')));
  const activity = assemble({
    format: 'gpx',
    fileName,
    sport,
    startMs: first.t,
    points,
    intervals,
    timerSeconds: intervalsTotalS(intervals),
    elapsedSeconds: (last.t - first.t) / 1000,
    device: root.attrs.creator ?? null,
  });
  return { ok: true, format: 'gpx', activities: [activity] };
}
