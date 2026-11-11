import { importError } from './errors.ts';
import type { ImportError, ImportFormat } from './types.ts';
import { MAX_BYTES } from './types.ts';
import { localName } from './xml.ts';

export type Detection =
  | { ok: true; format: ImportFormat; bytes: Uint8Array }
  | { ok: false; error: ImportError };

/** Decodes bytes as text: UTF-8 or UTF-16 by byte-order mark, otherwise UTF-8. */
export function decodeText(bytes: Uint8Array): string {
  let label = 'utf-8';
  let start = 0;
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) start = 3;
  else if (bytes[0] === 0xff && bytes[1] === 0xfe) {
    label = 'utf-16le';
    start = 2;
  } else if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    label = 'utf-16be';
    start = 2;
  }
  return new TextDecoder(label).decode(bytes.subarray(start));
}

/** Local name of the first element after whitespace, the XML declaration, comments, instructions and DOCTYPE. */
export function firstElementName(text: string): string | null {
  let i = 0;
  const n = text.length;
  while (i < n) {
    while (i < n && /\s/.test(text[i] as string)) i++;
    if (text[i] !== '<') return null;
    if (text.startsWith('<?', i)) {
      const e = text.indexOf('?>', i + 2);
      if (e < 0) return null;
      i = e + 2;
    } else if (text.startsWith('<!--', i)) {
      const e = text.indexOf('-->', i + 4);
      if (e < 0) return null;
      i = e + 3;
    } else if (text.startsWith('<!', i)) {
      let depth = 0;
      let j = i + 2;
      for (; j < n; j++) {
        const c = text[j];
        if (c === '[') depth++;
        else if (c === ']') depth--;
        else if (c === '>' && depth <= 0) break;
      }
      i = j + 1;
    } else {
      const m = /^<([^\s/>]+)/.exec(text.slice(i, i + 200));
      return m ? localName(m[1] as string) : null;
    }
  }
  return null;
}

/** The unpacked bytes, 'too-large' when they pass the size limit, or null when the gzip data is damaged. */
async function gunzip(bytes: Uint8Array): Promise<Uint8Array | 'too-large' | null> {
  try {
    const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream('gzip'));
    const reader = stream.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_BYTES) {
        await reader.cancel();
        return 'too-large';
      }
      chunks.push(value);
    }
    const out = new Uint8Array(total);
    let o = 0;
    for (const c of chunks) {
      out.set(c, o);
      o += c.byteLength;
    }
    return out;
  } catch {
    return null;
  }
}

function hintFor(bytes: Uint8Array, text: string): string | undefined {
  const head = (s: string) => text.startsWith(s);
  if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) return 'This looks like a PDF.';
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'This looks like an image.';
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return 'This looks like an image.';
  if (head('GIF8')) return 'This looks like an image.';
  const first = firstElementName(text);
  if (first && first.toLowerCase() === 'kml') return 'This looks like a KML map file.';
  if (!first && /^[^\n<]*,[^\n]*\n/.test(text.slice(0, 2000))) return 'This looks like a CSV file.';
  return undefined;
}

/** Detects the format from the bytes alone. The file name is used only in messages. */
export async function detectFormat(input: Uint8Array, fileName: string, depth = 0): Promise<Detection> {
  let bytes = input;
  if (bytes.length === 0) return { ok: false, error: importError('empty', fileName) };
  if (bytes.length > MAX_BYTES) {
    return { ok: false, error: importError('too-large', fileName, { sizeMb: bytes.length / 1048576 }) };
  }
  if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
    if (depth > 0) return { ok: false, error: importError('not-supported', fileName) };
    const out = await gunzip(bytes);
    if (!out) return { ok: false, error: importError('damaged', fileName) };
    if (out === 'too-large') {
      return { ok: false, error: importError('too-large', fileName, { sizeMb: Infinity }) };
    }
    return detectFormat(out, fileName, depth + 1);
  }
  if (bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04) {
    return { ok: false, error: importError('zip', fileName) };
  }
  if (
    (bytes[0] === 12 || bytes[0] === 14) &&
    bytes[8] === 0x2e &&
    bytes[9] === 0x46 &&
    bytes[10] === 0x49 &&
    bytes[11] === 0x54
  ) {
    return { ok: true, format: 'fit', bytes };
  }
  const text = decodeText(bytes.subarray(0, 16384));
  const first = firstElementName(text);
  if (first === 'gpx') return { ok: true, format: 'gpx', bytes };
  if (first === 'TrainingCenterDatabase') return { ok: true, format: 'tcx', bytes };
  return { ok: false, error: importError('not-supported', fileName, { hint: hintFor(bytes, text) }) };
}
