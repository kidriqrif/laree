/**
 * .erg writer (docs/spec/io.md section 5). Pure: a workout and one athlete's thresholds in, ASCII
 * course text out. Values are absolute watts, so the athlete's FTP is required.
 */
import {
  asciiSafe,
  checkPower,
  checkSteps,
  courseRows,
  crlf,
  expandSegments,
  fileNameFor,
  ftpPhrase,
  makeFile,
  minutesLabel,
  refuse,
  type ExportInput,
  type ExportResult,
} from './common.ts';

const MIME_TYPE = 'text/plain';

/** Watts for a percentage of FTP. Multiplies before dividing, so halves round away from zero (metrics 1.5). */
export function wattsOf(pct: number, ftp: number): number {
  return Math.round((pct * ftp) / 100);
}

/** The ERG file for a workout and one athlete. Refuses non-power workouts and athletes with no FTP. */
export function writeErg(input: ExportInput): ExportResult {
  const { athlete, thresholds, workout } = input;
  const refusal = checkPower(workout, '.erg needs a bike workout with power targets.');
  if (refusal) return refusal;
  const ftp = thresholds.ftp;
  if (!ftp) {
    return refuse('no-ftp', `${asciiSafe(athlete.name)} has no FTP yet. Add one in Zones and thresholds.`);
  }
  const stepRefusal = checkSteps(workout);
  if (stepRefusal) return stepRefusal;

  const fileName = fileNameFor(input, 'erg');
  const description = `${asciiSafe(workout.title)} for ${asciiSafe(athlete.name)}${ftpPhrase(thresholds)}`;
  const rows = courseRows(expandSegments(workout.steps)).map(
    (row) => `${minutesLabel(row.seconds)}\t${wattsOf(row.pct, ftp)}`,
  );
  const text = crlf([
    '[COURSE HEADER]',
    'VERSION = 2',
    'UNITS = ENGLISH',
    `DESCRIPTION = ${description}`,
    `FILE NAME = ${fileName}`,
    `FTP = ${ftp}`,
    'MINUTES WATTS',
    '[END COURSE HEADER]',
    '[COURSE DATA]',
    ...rows,
    '[END COURSE DATA]',
  ]);
  return { ok: true, file: makeFile(fileName, MIME_TYPE, text) };
}
