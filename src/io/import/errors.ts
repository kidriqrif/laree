import type { ImportError, ImportErrorCode } from './types.ts';

const quoted = (n: string) => `“${n}”`;

export function importError(code: ImportErrorCode, fileName: string, extra?: { sizeMb?: number; hint?: string }): ImportError {
  const n = quoted(fileName);
  const messages: Record<ImportErrorCode, string> = {
    'too-large': `${n} is ${extra?.sizeMb === Infinity ? 'more than 40 MB once unzipped' : `${(extra?.sizeMb ?? 0).toFixed(1)} MB`}. Laree can read files up to 40 MB. Exporting it as .FIT gives a much smaller file.`,
    empty: `${n} is empty. Export it again from your watch or app.`,
    zip: `${n} is a zip archive. Unzip it first, then import the .FIT, .GPX or .TCX file inside.`,
    'not-supported': `Laree can't read ${n}. Choose a .FIT, .GPX or .TCX file from your watch, bike computer or training app.`,
    'fit-workout': `${n} is a planned workout, not a recorded session. Import the file your device saved after you trained.`,
    'fit-course': `${n} is a course, which is a planned route, not a recorded session.`,
    'fit-other': `${n} is a .FIT file, but it holds device data, not a recorded session.`,
    damaged: `${n} is damaged, so Laree can't read it. Export it again from your watch or app, or use Quick log.`,
    'no-timestamps': `${n} has no times on its points. It looks like a planned route, not a recorded session.`,
    'no-data': `${n} has no recorded data in it.`,
    'too-long': `${n} runs for more than 24 hours. Laree can't import it. If two recordings were joined, export them separately.`,
    'read-failed': `Something went wrong while reading ${n}. Nothing was saved. Try again, or use Quick log.`,
  };
  const err: ImportError = { code, fileName, message: messages[code] };
  if (extra?.hint) err.hint = extra.hint;
  return err;
}
