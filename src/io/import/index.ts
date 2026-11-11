import { detectFormat } from './detect.ts';
import { importError } from './errors.ts';
import { parseGpx } from './gpx.ts';
import { parseTcx } from './tcx.ts';
import type { ImportResult } from './types.ts';
import { MAX_TIMER_S } from './types.ts';

export type * from './types.ts';
export { detectFormat } from './detect.ts';
export { importError } from './errors.ts';

/**
 * Reads one file. Pure: it stores nothing and reads no clock. The format comes from the bytes, never the name.
 * The FIT SDK is loaded with a dynamic import only when a FIT file is detected.
 */
export async function parseImportFile(input: ArrayBuffer | Uint8Array, fileName: string): Promise<ImportResult> {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  try {
    const found = await detectFormat(bytes, fileName);
    if (!found.ok) return found;
    let result: ImportResult;
    if (found.format === 'fit') {
      const { parseFit } = await import('./fit.ts');
      result = await parseFit(found.bytes, fileName);
    } else if (found.format === 'gpx') result = parseGpx(found.bytes, fileName);
    else result = parseTcx(found.bytes, fileName);
    // Written as "not within the limit" so a timer that is not a number is turned away too.
    if (result.ok && result.activities.some((a) => !(a.timerSeconds >= 0 && a.timerSeconds <= MAX_TIMER_S))) {
      return { ok: false, error: importError('too-long', fileName) };
    }
    return result;
  } catch {
    return { ok: false, error: importError('read-failed', fileName) };
  }
}
