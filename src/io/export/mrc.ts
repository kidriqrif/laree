/**
 * .mrc writer (docs/spec/io.md section 5). Pure: a workout and an athlete's thresholds in, ASCII
 * course text out. The values are percentages of FTP, so the trainer app scales them to the rider.
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
  type ExportInput,
  type ExportResult,
} from './common.ts';

const MIME_TYPE = 'text/plain';

/** The course file for a workout. Refuses workouts that are not bike workouts on the power basis. */
export function writeMrc(input: ExportInput): ExportResult {
  const refusal = checkPower(input.workout, '.mrc needs a bike workout with power targets.') ?? checkSteps(input.workout);
  if (refusal) return refusal;

  const fileName = fileNameFor(input, 'mrc');
  const description = `${asciiSafe(input.workout.title)} for ${asciiSafe(input.athlete.name)}${ftpPhrase(input.thresholds)}`;
  const rows = courseRows(expandSegments(input.workout.steps)).map(
    (row) => `${minutesLabel(row.seconds)}\t${row.pct.toFixed(2)}`,
  );
  const text = crlf([
    '[COURSE HEADER]',
    'VERSION = 2',
    'UNITS = ENGLISH',
    `DESCRIPTION = ${description}`,
    `FILE NAME = ${fileName}`,
    'MINUTES PERCENT',
    '[END COURSE HEADER]',
    '[COURSE DATA]',
    ...rows,
    '[END COURSE DATA]',
  ]);
  return { ok: true, file: makeFile(fileName, MIME_TYPE, text) };
}
