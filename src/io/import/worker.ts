/// <reference lib="webworker" />
import { importError } from './errors.ts';
import type { ImportResult } from './types.ts';

interface Request {
  buffer: ArrayBuffer;
  fileName: string;
}

// The worker reads a transferred buffer and posts back one ImportResult. The caller terminates it to cancel.
self.onmessage = async (event: MessageEvent<Request>) => {
  const { buffer, fileName } = event.data;
  let result: ImportResult;
  try {
    const { parseImportFile } = await import('./index.ts');
    result = await parseImportFile(buffer, fileName);
  } catch {
    result = { ok: false, error: importError('read-failed', fileName) };
  }
  (self as unknown as Worker).postMessage(result);
};
