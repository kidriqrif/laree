import { assemble, parseIsoTime } from './assemble.ts';
import { decodeText } from './detect.ts';
import { importError } from './errors.ts';
import { intervalsFromGaps, intervalsTotalS, realToTimer } from './streams.ts';
import type { ImportLap, ImportWarning, ParsedActivity, RawPoint, ImportResult } from './types.ts';
import { MAX_ACTIVITIES } from './types.ts';
import { child, childrenNamed, findDeep, numOf, parseXml, textOf } from './xml.ts';
import type { XmlNode } from './xml.ts';
import type { Sport } from '../../domain/types.ts';

function sportOf(s: string | undefined): Sport | null {
  if (s === 'Running') return 'run';
  if (s === 'Biking') return 'bike';
  return null;
}

function valueOf(node: XmlNode | undefined): number | undefined {
  return numOf(child(node, 'Value'));
}

export function parseTcx(bytes: Uint8Array, fileName: string): ImportResult {
  let root: XmlNode | null;
  try {
    root = parseXml(decodeText(bytes));
  } catch {
    return { ok: false, error: importError('damaged', fileName) };
  }
  if (!root || root.name !== 'TrainingCenterDatabase') return { ok: false, error: importError('damaged', fileName) };

  const activities: ParsedActivity[] = [];
  let sawTrackpoints = false;
  const nodes = childrenNamed(child(root, 'Activities'), 'Activity').slice(0, MAX_ACTIVITIES);
  for (const act of nodes) {
    const points: RawPoint[] = [];
    const trackStarts: number[] = [];
    const lapNodes = childrenNamed(act, 'Lap');
    for (const lap of lapNodes) {
      for (const track of childrenNamed(lap, 'Track')) {
        let firstInTrack = true;
        for (const tp of childrenNamed(track, 'Trackpoint')) {
          sawTrackpoints = true;
          const t = parseIsoTime(textOf(child(tp, 'Time')));
          if (!Number.isFinite(t)) continue;
          const p: RawPoint = { t };
          const pos = child(tp, 'Position');
          const lat = numOf(child(pos, 'LatitudeDegrees'));
          const lon = numOf(child(pos, 'LongitudeDegrees'));
          if (lat !== undefined && lon !== undefined) {
            p.lat = lat;
            p.lon = lon;
          }
          const alt = numOf(child(tp, 'AltitudeMeters'));
          if (alt !== undefined) p.ele = alt;
          const dist = numOf(child(tp, 'DistanceMeters'));
          if (dist !== undefined) p.dist = dist;
          const hr = valueOf(child(tp, 'HeartRateBpm'));
          if (hr !== undefined) p.hr = hr;
          const cad = numOf(child(tp, 'Cadence')) ?? numOf(findDeep(child(tp, 'Extensions'), ['RunCadence']));
          if (cad !== undefined) p.cad = cad;
          const ext = child(tp, 'Extensions');
          const watts = numOf(findDeep(ext, ['Watts']));
          if (watts !== undefined) p.power = watts;
          const speed = numOf(findDeep(ext, ['Speed']));
          if (speed !== undefined) p.speed = speed;
          if (firstInTrack) trackStarts.push(t);
          firstInTrack = false;
          points.push(p);
        }
      }
    }
    points.sort((a, b) => a.t - b.t);
    if (points.length === 0 && lapNodes.length === 0) continue;

    const intervals = intervalsFromGaps(points, 20_000, trackStarts.slice(1));
    const lapTimerSum = lapNodes.reduce((s, l) => s + (numOf(child(l, 'TotalTimeSeconds')) ?? 0), 0);
    const timerSeconds = lapTimerSum > 0 ? lapTimerSum : intervalsTotalS(intervals);
    const idTime = parseIsoTime(textOf(child(act, 'Id')));
    const firstLapStart = parseIsoTime(lapNodes[0]?.attrs.StartTime);
    const first = points[0];
    const last = points[points.length - 1];
    const startMs = Number.isFinite(idTime) ? idTime : Number.isFinite(firstLapStart) ? firstLapStart : first?.t;
    if (startMs === undefined) continue;

    const laps: ImportLap[] = lapNodes.map((l) => {
      const start = parseIsoTime(l.attrs.StartTime);
      const timerS = numOf(child(l, 'TotalTimeSeconds')) ?? 0;
      const distanceM = numOf(child(l, 'DistanceMeters')) ?? null;
      const lx = findDeep(child(l, 'Extensions'), ['LX']);
      const avgSpeed = numOf(child(lx, 'AvgSpeed'));
      return {
        startOffsetS: Number.isFinite(start) && intervals.length ? realToTimer(intervals, start) : 0,
        timerS,
        distanceM,
        avgHr: valueOf(child(l, 'AverageHeartRateBpm')) ?? null,
        avgPowerW: numOf(child(lx, 'AvgWatts')) ?? null,
        avgSpeedMps: avgSpeed ?? (distanceM !== null && timerS > 0 ? distanceM / timerS : null),
      };
    });

    const lastDist = points.toReversed().find((p) => p.dist !== undefined)?.dist;
    const lapDistSum = laps.reduce((s, l) => s + (l.distanceM ?? 0), 0);
    const distanceM = lastDist ?? (lapDistSum > 0 ? lapDistSum : null);
    const warnings: ImportWarning[] = [];
    const creator = textOf(child(child(act, 'Creator'), 'Name'));
    activities.push(
      assemble({
        format: 'tcx',
        fileName,
        sport: sportOf(act.attrs.Sport),
        startMs,
        points,
        intervals,
        timerSeconds,
        elapsedSeconds: last ? (last.t - startMs) / 1000 : timerSeconds,
        distanceM,
        laps: laps.length ? laps : undefined,
        device: creator ?? null,
        warnings,
      }),
    );
  }

  if (activities.length === 0) {
    return { ok: false, error: importError(sawTrackpoints ? 'no-timestamps' : 'no-data', fileName) };
  }
  return { ok: true, format: 'tcx', activities };
}
