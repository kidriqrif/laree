import type { Sport } from '../../domain/types.ts';
import { ascentFromAltitudes, buildStreams, lapFromStreams, summarise } from './streams.ts';
import type { Interval } from './streams.ts';
import type { ImportFormat, ImportLap, ImportWarning, ParsedActivity, RawPoint } from './types.ts';

export interface AssembleInput {
  format: ImportFormat;
  fileName: string;
  sport: Sport | null;
  setting?: ParsedActivity['setting'];
  startMs: number;
  points: RawPoint[];
  intervals: Interval[];
  timerSeconds: number;
  elapsedSeconds: number;
  distanceM?: number | null;
  ascentM?: number | null;
  laps?: ImportLap[];
  device?: string | null;
  groupId?: string | null;
  weightedPowerW?: number | null;
  warnings?: ImportWarning[];
}

/** ISO 8601 time; a time with no zone is read as UTC. Returns NaN when it is not a time. */
export function parseIsoTime(s: string | undefined): number {
  if (!s) return NaN;
  const t = s.trim();
  if (!/^\d{4}-\d{2}-\d{2}/.test(t)) return NaN;
  const spaced = t.replace(/^(\d{4}-\d{2}-\d{2})\s+(?=\d)/, '$1T');
  const zoned = /(Z|[+-]\d{2}:?\d{2})$/i.test(spaced);
  return Date.parse(zoned || !spaced.includes('T') ? spaced : `${spaced}Z`);
}

export function assemble(input: AssembleInput): ParsedActivity {
  const streams = buildStreams(input.points, input.intervals, input.timerSeconds, input.sport);
  const n = streams?.n ?? Math.round(input.timerSeconds);
  const distanceM = input.distanceM ?? (streams?.distance ? (streams.distance[n] as number) : null);
  const setting = input.setting ?? null;
  const warnings: ImportWarning[] = [...(input.warnings ?? [])];
  if (input.sport === null) {
    warnings.push({ code: 'ask-sport', message: "The file doesn't say which sport this was. Choose one." });
  }
  if (input.timerSeconds < 60) {
    warnings.push({ code: 'short', message: 'This session is under a minute long, so it adds no load.' });
  }
  const summary = summarise(streams, input.sport, input.timerSeconds, distanceM, setting);
  return {
    format: input.format,
    fileName: input.fileName,
    sport: input.sport,
    setting,
    startUtc: new Date(input.startMs).toISOString(),
    timerSeconds: input.timerSeconds,
    elapsedSeconds: input.elapsedSeconds,
    distanceM,
    ascentM: input.ascentM ?? (streams?.altitude ? ascentFromAltitudes(streams.altitude) : null),
    laps: input.laps?.length ? input.laps : [lapFromStreams(streams, 0, n)],
    summary,
    summaryWeightedPowerW: input.weightedPowerW ?? null,
    device: input.device ?? null,
    groupId: input.groupId ?? null,
    streams,
    warnings,
  };
}
