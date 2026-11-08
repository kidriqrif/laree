// Renders the PNGs and favicon.ico from brand/svg/ (run build-logo.ts first; npm run brand does both).
// Run: node scripts/brand/rasterize.ts

import { Resvg } from '@resvg/resvg-js';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PALETTE as C } from '../../brand/src/logo-geometry.ts';
import { makeIco, readIcoDirectory } from './make-ico.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const SVG_DIR = join(ROOT, 'brand/svg');
const PNG_DIR = join(ROOT, 'brand/png');
const PUBLIC = join(ROOT, 'public');

/** Wordmark pixels per logo unit at 1x (48 units = 120 px); keep in step with build-logo.ts. */
const WORDMARK_PX = 2.5;

function render(file: string, width: number, background?: string): { png: Buffer; width: number; height: number } {
  const svg = readFileSync(join(SVG_DIR, file), 'utf8');
  const img = new Resvg(svg, { fitTo: { mode: 'width', value: width }, background, font: { loadSystemFonts: false } }).render();
  return { png: img.asPng(), width: img.width, height: img.height };
}

const written: string[] = [];
function save(dir: string, name: string, out: { png: Buffer; width: number; height: number }): Buffer {
  writeFileSync(join(dir, name), out.png);
  written.push(`  ${relative(ROOT, join(dir, name)).replaceAll('\\', '/')}  ${out.width}x${out.height}`);
  return out.png;
}

function main(): void {
  mkdirSync(PNG_DIR, { recursive: true });
  mkdirSync(PUBLIC, { recursive: true });

  // brand/png: masters for documents and other people's layouts (transparent)
  const unitWidth = Number(/viewBox="0 0 ([\d.]+) /.exec(readFileSync(join(SVG_DIR, 'laree-wordmark.svg'), 'utf8'))?.[1]);
  if (!Number.isFinite(unitWidth)) throw new Error('laree-wordmark.svg has no viewBox');
  for (const x of [1, 2, 4]) save(PNG_DIR, `laree-wordmark@${x}x.png`, render('laree-wordmark.svg', Math.round(unitWidth * WORDMARK_PX * x)));
  for (const px of [512, 1024]) save(PNG_DIR, `laree-mark-${px}.png`, render('laree-mark.svg', px));
  save(PNG_DIR, 'laree-app-icon-1024.png', render('laree-app-icon.svg', 1024));

  // public: what the app ships (manifest icons, touch icon, social card, favicon.ico)
  save(PUBLIC, 'pwa-192.png', render('laree-app-icon.svg', 192));
  save(PUBLIC, 'pwa-512.png', render('laree-app-icon.svg', 512));
  save(PUBLIC, 'pwa-maskable-512.png', render('laree-app-icon-maskable.svg', 512));
  save(PUBLIC, 'pwa-monochrome-512.png', render('laree-icon-monochrome.svg', 512));
  // iOS masks its own corners and shows black behind transparency, so the touch icon is a full ink square.
  save(PUBLIC, 'apple-touch-icon.png', render('laree-app-icon.svg', 180, C.ink));
  save(PUBLIC, 'og.png', render('og-image.svg', 1200));

  // Each favicon size is drawn on its own pixel grid, never scaled from another.
  const ico = makeIco(([16, 32, 48] as const).map((size) => ({ size, png: render(`favicon-${size}.svg`, size).png })));
  writeFileSync(join(PUBLIC, 'favicon.ico'), ico);
  const dir = readIcoDirectory(ico);
  written.push(`  public/favicon.ico  ${dir.map(([s]) => `${s}`).join('/')} px, ${(ico.length / 1024).toFixed(1)} KB`);

  console.log(written.join('\n'));
}

main();
