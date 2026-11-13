import type { Sport } from '../../domain/types.ts';
import { assemble } from './assemble.ts';
import { importError } from './errors.ts';
import { intervalsFromGaps, intervalsTotalS, realToTimer } from './streams.ts';
import type { Interval } from './streams.ts';
import type { ImportLap, ImportResult, ImportWarning, ParsedActivity, RawPoint } from './types.ts';
import { MAX_ACTIVITIES } from './types.ts';

type Mesg = Record<string, unknown>;

const num = (m: Mesg, key: string): number | undefined => {
  const v = m[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
};
const str = (m: Mesg, key: string): string | undefined => {
  const v = m[key];
  return typeof v === 'string' ? v : undefined;
};
const time = (m: Mesg, key: string): number | undefined => {
  const v = m[key];
  if (v instanceof Date) {
    const t = v.getTime();
    return Number.isFinite(t) ? t : undefined;
  }
  return undefined;
};

const SEMICIRCLE_TO_DEG = 180 / 2 ** 31;
const toDegrees = (v: number): number => (Math.abs(v) > 180 ? v * SEMICIRCLE_TO_DEG : v);

function mapSport(session: Mesg): { sport: Sport | null; setting: ParsedActivity['setting']; skip: boolean } {
  const sport = str(session, 'sport');
  const sub = str(session, 'subSport');
  switch (sport) {
    case 'running':
      return { sport: 'run', setting: sub === 'treadmill' ? 'treadmill' : null, skip: false };
    case 'cycling':
      return { sport: 'bike', setting: sub === 'indoorCycling' || sub === 'virtualActivity' ? 'indoor' : null, skip: false };
    case 'swimming':
      return { sport: 'swim', setting: sub === 'lapSwimming' ? 'pool' : sub === 'openWater' ? 'openWater' : null, skip: false };
    case 'training':
      return { sport: sub === 'strengthTraining' ? 'strength' : 'other', setting: null, skip: false };
    case 'transition':
      return { sport: null, setting: null, skip: true };
    default:
      return { sport: 'other', setting: null, skip: false };
  }
}

function toPoint(r: Mesg): RawPoint | null {
  const t = time(r, 'timestamp');
  if (t === undefined) return null;
  const p: RawPoint = { t };
  const lat = num(r, 'positionLat');
  const lon = num(r, 'positionLong');
  if (lat !== undefined && lon !== undefined) {
    p.lat = toDegrees(lat);
    p.lon = toDegrees(lon);
  }
  const ele = num(r, 'enhancedAltitude') ?? num(r, 'altitude');
  if (ele !== undefined) p.ele = ele;
  const hr = num(r, 'heartRate');
  if (hr !== undefined) p.hr = hr;
  const power = num(r, 'power');
  if (power !== undefined) p.power = power;
  const cad = num(r, 'cadence');
  if (cad !== undefined) p.cad = cad + (num(r, 'fractionalCadence') ?? 0);
  const speed = num(r, 'enhancedSpeed') ?? num(r, 'speed');
  if (speed !== undefined) p.speed = speed;
  const dist = num(r, 'distance');
  if (dist !== undefined) p.dist = dist;
  const temp = num(r, 'temperature');
  if (temp !== undefined) p.temp = temp;
  return p;
}

function formatDuration(s: number): string {
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  return h > 0 ? `${h} h ${m % 60} min` : `${m} min`;
}

function runningIntervals(events: Mesg[], start: number, end: number, points: RawPoint[]): Interval[] {
  const stops = events
    .filter((e) => str(e, 'event') === 'timer')
    .map((e) => ({ t: time(e, 'timestamp'), type: str(e, 'eventType') }))
    .filter((e): e is { t: number; type: string | undefined } => e.t !== undefined && e.t >= start && e.t <= end)
    .toSorted((a, b) => a.t - b.t);
  if (stops.length === 0) return points.length ? intervalsFromGaps([points[0] as RawPoint, points[points.length - 1] as RawPoint], Infinity) : [];
  const out: Interval[] = [];
  let running = true;
  let from = start;
  for (const e of stops) {
    if ((e.type === 'stop' || e.type === 'stopAll') && running) {
      if (e.t > from) out.push({ start: from, end: e.t });
      running = false;
    } else if (e.type === 'start' && !running) {
      from = e.t;
      running = true;
    }
  }
  if (running) {
    const lastT = points.length ? (points[points.length - 1] as RawPoint).t : end;
    const closeAt = Math.min(end, Math.max(lastT, from));
    if (closeAt > from) out.push({ start: from, end: closeAt });
  }
  return out;
}

export async function parseFit(bytes: Uint8Array, fileName: string): Promise<ImportResult> {
  const { Decoder, Stream } = await import('@garmin/fitsdk');
  let messages: Record<string, Mesg[] | undefined>;
  let intact = false;
  try {
    const decoder = new Decoder(Stream.fromByteArray(bytes));
    if (!decoder.isFIT()) return { ok: false, error: importError('damaged', fileName) };
    intact = decoder.checkIntegrity();
    messages = decoder.read().messages as unknown as Record<string, Mesg[] | undefined>;
  } catch {
    return { ok: false, error: importError('damaged', fileName) };
  }

  const fileId = messages.fileIdMesgs?.[0];
  if (!fileId) return { ok: false, error: importError('damaged', fileName) };
  const type = str(fileId, 'type');
  if (type !== 'activity') {
    const code = type === 'workout' ? 'fit-workout' : type === 'course' ? 'fit-course' : 'fit-other';
    return { ok: false, error: importError(code, fileName) };
  }

  const records = (messages.recordMesgs ?? []).map(toPoint).filter((p): p is RawPoint => p !== null).toSorted((a, b) => a.t - b.t);
  let sessions = (messages.sessionMesgs ?? []).filter((s) => time(s, 'startTime') !== undefined);
  if (!sessions.length && !records.length) {
    return { ok: false, error: importError(intact ? 'no-data' : 'damaged', fileName) };
  }
  if (!sessions.length) {
    const first = records[0] as RawPoint;
    const last = records[records.length - 1] as RawPoint;
    sessions = [{ sport: 'generic', startTime: new Date(first.t), totalElapsedTime: (last.t - first.t) / 1000 }];
  }
  sessions = sessions.toSorted((a, b) => (time(a, 'startTime') as number) - (time(b, 'startTime') as number));

  const events = messages.eventMesgs ?? [];
  const laps = messages.lapMesgs ?? [];
  const device = [str(fileId, 'manufacturer'), str(fileId, 'garminProduct') ?? (num(fileId, 'product')?.toString() ?? undefined)]
    .filter(Boolean)
    .join(' ') || str(fileId, 'productName') || null;

  const kept = sessions.map((s) => ({ s, ...mapSport(s) })).filter((x) => !x.skip).slice(0, MAX_ACTIVITIES);
  if (!kept.length) return { ok: false, error: importError('no-data', fileName) };
  const multi = kept.length > 1;

  const activities: ParsedActivity[] = [];
  for (const { s, sport, setting } of kept) {
    const startMs = time(s, 'startTime') as number;
    const elapsedS = num(s, 'totalElapsedTime');
    const timerS = num(s, 'totalTimerTime');
    const windowed = multi || sessions.length > 1;
    const lastRecT = records.length ? (records[records.length - 1] as RawPoint).t : startMs;
    const endMs = elapsedS !== undefined ? startMs + elapsedS * 1000 : lastRecT;
    const pts = windowed ? records.filter((p) => p.t >= startMs && p.t <= endMs) : records;
    const intervals = runningIntervals(events, startMs, windowed ? endMs : Math.max(endMs, lastRecT), pts);
    if (!intervals.length && !pts.length && timerS === undefined) continue;
    const timerSeconds = timerS ?? intervalsTotalS(intervals);
    const hasPower = pts.some((p) => p.power !== undefined);
    const weighted = num(s, 'normalizedPower');

    const lapOut: ImportLap[] = laps
      .filter((l) => {
        const t = time(l, 'startTime');
        return t !== undefined && t >= startMs && t <= endMs + 1000;
      })
      .map((l) => {
        const t = time(l, 'startTime') as number;
        const lt = num(l, 'totalTimerTime') ?? 0;
        const d = num(l, 'totalDistance');
        return {
          startOffsetS: intervals.length ? realToTimer(intervals, t) : (t - startMs) / 1000,
          timerS: lt,
          distanceM: d ?? null,
          avgHr: num(l, 'avgHeartRate') ?? null,
          avgPowerW: num(l, 'avgPower') ?? null,
          avgSpeedMps: num(l, 'enhancedAvgSpeed') ?? num(l, 'avgSpeed') ?? (d !== undefined && lt > 0 ? d / lt : null),
        };
      });

    const warnings: ImportWarning[] = [];
    if (!intact && activities.length === 0) {
      warnings.push({
        code: 'cut-short',
        message: `This file looks cut short, perhaps because the device switched off. Laree read the first ${formatDuration(timerSeconds)}.`,
      });
    }
    if (multi && activities.length === 0) {
      const names = kept.map((k) => k.sport ?? 'other');
      const list = names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : (names[0] ?? '');
      warnings.push({
        code: 'multisport',
        message: `This file holds ${kept.length} sessions: ${list}. Laree saves each one on its own. Transitions are left out.`,
      });
    }

    activities.push(
      assemble({
        format: 'fit',
        fileName,
        sport,
        setting,
        startMs,
        points: pts,
        intervals,
        timerSeconds,
        elapsedSeconds: elapsedS ?? timerSeconds,
        distanceM: num(s, 'totalDistance') ?? null,
        ascentM: num(s, 'totalAscent') ?? null,
        laps: lapOut,
        device,
        groupId: multi ? `${fileName}@${time(sessions[0] as Mesg, 'startTime')}` : null,
        weightedPowerW: !hasPower && weighted !== undefined ? weighted : null,
        warnings,
      }),
    );
  }
  if (!activities.length) return { ok: false, error: importError('no-data', fileName) };
  return { ok: true, format: 'fit', activities };
}
