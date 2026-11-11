import type { Sport } from '../../domain/types.ts';

export type ImportFormat = 'fit' | 'gpx' | 'tcx';

export type ImportErrorCode =
  | 'too-large'
  | 'empty'
  | 'zip'
  | 'not-supported'
  | 'fit-workout'
  | 'fit-course'
  | 'fit-other'
  | 'damaged'
  | 'no-timestamps'
  | 'no-data'
  | 'too-long'
  | 'read-failed';

/** A typed error naming the file and the reason. `message` is the user-facing sentence from io.md section 12.1. */
export interface ImportError {
  code: ImportErrorCode;
  fileName: string;
  message: string;
  /** Extra hint, for example "This looks like a PDF". */
  hint?: string;
}

export type ImportWarningCode = 'cut-short' | 'multisport' | 'ask-sport' | 'short';

export interface ImportWarning {
  code: ImportWarningCode;
  message: string;
}

export interface ImportLap {
  /** Timer seconds from the start of the activity. */
  startOffsetS: number;
  timerS: number;
  distanceM: number | null;
  avgHr: number | null;
  avgPowerW: number | null;
  avgSpeedMps: number | null;
}

export interface ImportStreams {
  v: 1;
  n: number;
  power?: Float32Array;
  hr?: Float32Array;
  cadence?: Float32Array;
  speed?: Float32Array;
  temperature?: Float32Array;
  distance?: Float32Array;
  altitude?: Float32Array;
  trace?: Float32Array;
}

export interface ImportSummary {
  avgHr: number | null;
  maxHr: number | null;
  avgPowerW: number | null;
  maxPowerW: number | null;
  avgCadence: number | null;
  avgTempC: number | null;
  avgSpeedMps: number | null;
  movingSeconds: number;
}

export interface ParsedActivity {
  format: ImportFormat;
  fileName: string;
  sport: Sport | null;
  setting: 'indoor' | 'treadmill' | 'pool' | 'openWater' | null;
  startUtc: string;
  timerSeconds: number;
  elapsedSeconds: number;
  distanceM: number | null;
  ascentM: number | null;
  laps: ImportLap[];
  summary: ImportSummary;
  summaryWeightedPowerW: number | null;
  device: string | null;
  groupId: string | null;
  streams: ImportStreams | null;
  warnings: ImportWarning[];
}

export type ImportResult =
  | { ok: true; format: ImportFormat; activities: ParsedActivity[] }
  | { ok: false; error: ImportError };

/** One recorded point, shared by the three readers. Times are epoch milliseconds. */
export interface RawPoint {
  t: number;
  lat?: number;
  lon?: number;
  ele?: number;
  hr?: number;
  power?: number;
  cad?: number;
  speed?: number;
  dist?: number;
  temp?: number;
}

export const MAX_BYTES = 40 * 1024 * 1024;
export const MAX_TIMER_S = 24 * 3600;
export const MAX_ACTIVITIES = 10;
