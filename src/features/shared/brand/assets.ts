// Brand files, resolved by Vite so the links are hashed and work under any base path.
const svgModules = import.meta.glob('../../../../brand/svg/*.svg', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>
const pngModules = import.meta.glob('../../../../brand/png/*.png', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>

function byName(mods: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [path, url] of Object.entries(mods)) out[path.slice(path.lastIndexOf('/') + 1)] = url
  return out
}

export const SVG_URLS = byName(svgModules)
export const PNG_URLS = byName(pngModules)

/** Exact byte sizes of the files in brand/ (a test checks this table against the disk). */
export const FILE_BYTES: Record<string, number> = {
  'construction.svg': 5000,
  'favicon-16.svg': 469,
  'favicon-32.svg': 451,
  'favicon-48.svg': 505,
  'laree-app-icon-maskable.svg': 706,
  'laree-app-icon.svg': 923,
  'laree-icon-monochrome.svg': 650,
  'laree-mark-mono.svg': 586,
  'laree-mark-solid.svg': 281,
  'laree-mark.svg': 586,
  'laree-wordmark-mono-ink.svg': 1233,
  'laree-wordmark-mono-paper.svg': 1233,
  'laree-wordmark-on-paper.svg': 1333,
  'laree-wordmark-reversed.svg': 1333,
  'laree-wordmark-small.svg': 1069,
  'laree-wordmark-solid.svg': 955,
  'laree-wordmark.svg': 1260,
  'misuse.svg': 82223,
  'og-image.svg': 8550,
  'laree-app-icon-1024.png': 24897,
  'laree-mark-1024.png': 27219,
  'laree-mark-512.png': 11167,
  'laree-wordmark@1x.png': 7257,
  'laree-wordmark@2x.png': 15031,
  'laree-wordmark@4x.png': 32706,
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  return `${(bytes / 1024).toFixed(1)} KB`
}

/** A link that never starts with "/": resolved against the page's base, so it survives any deploy path. */
export function resolveHref(url: string): string {
  try {
    return new URL(url, document.baseURI).href
  } catch {
    return url.replace(/^\/+/, '')
  }
}
