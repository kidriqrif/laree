// Writes every logo SVG into brand/svg/ and public/favicon.svg, from brand/src/logo-geometry.ts.
// Run: node scripts/brand/build-logo.ts   (or npm run brand, which also rasterizes)

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { variableFont, type Outliner } from './font-outline.ts';
import {
  PALETTE as C,
  PARAMS,
  faviconGeometry,
  fmt,
  iconGeometry,
  markGeometry,
  mirrorPath,
  placePath,
  track,
  wordmarkGeometry,
  type LogoGeometry,
  type Pt,
} from '../../brand/src/logo-geometry.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const SVG_DIR = join(ROOT, 'brand/svg');
const PUBLIC = join(ROOT, 'public');

/** Pixels per logo unit for the wordmark's intrinsic (1x) size: 48 units = 120 px. */
export const WORDMARK_PX = 2.5;

// ---------------------------------------------------------------- svg helpers

function doc(o: { w: number; h: number; viewBox: string; title: string; body: string }): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${fmt(o.w)}" height="${fmt(o.h)}" viewBox="${o.viewBox}" ` +
    `role="img" aria-labelledby="title"><title id="title">${o.title}</title>${o.body}</svg>\n`
  );
}

const path = (fill: string, d: string, extra = ''): string => `<path fill="${fill}"${extra} d="${d}"/>`;

const rect = (x: number, y: number, w: number, h: number, fill: string): string =>
  `<rect x="${fmt(x)}" y="${fmt(y)}" width="${fmt(w)}" height="${fmt(h)}" fill="${fill}"/>`;

/** Wordmark in two colours; tight viewBox, or with the clear space and a background. */
function wordmarkSvg(g: LogoGeometry, trackFill: string, letterFill: string, bg?: string): string {
  const body = trackFill === letterFill ? path(trackFill, g.track + g.letters) : path(trackFill, g.track) + path(letterFill, g.letters);
  if (!bg) return doc({ w: g.width * WORDMARK_PX, h: g.height * WORDMARK_PX, viewBox: g.viewBox, title: 'Laree', body });
  const cs = g.clearSpace;
  const w = g.width + 2 * cs;
  const h = g.height + 2 * cs;
  return doc({
    w: w * WORDMARK_PX,
    h: h * WORDMARK_PX,
    viewBox: `${fmt(-cs)} ${fmt(-cs)} ${fmt(w)} ${fmt(h)}`,
    title: 'Laree',
    body: rect(-cs, -cs, w, h, bg) + body,
  });
}

const FONTS = join(ROOT, 'node_modules/@fontsource-variable');

// ---------------------------------------------------------------- social image (1200 x 630)

/**
 * Wordmark and tagline in the infield of a big track bend. The bend is the logo's own track() at
 * pixel scale (lane 20, line 5: the master's 4:1), mirrored: the lanes come in along the bottom from a
 * staggered start and leave off the top edge at a common line, so every lane runs the same distance.
 */
function ogImage(tagFont: Outliner): string {
  const W = 1200;
  const H = 630;
  const left = 96;
  const lanes = { lanes: 4, lane: 20, line: 5 };
  const outerRight = 1144;
  const outerBottom = 574;
  const lanePaths = track(
    { x0: W - outerRight, y0: 0, ...lanes, r0: 70, tip: outerBottom + 40, finish: W - left, split: 0 },
    outerBottom,
  );
  const bend = mirrorPath(lanePaths.d, W / 2);

  const g = wordmarkGeometry(4);
  const s = 4.2;
  const top = 92;
  const word = path(C.track, placePath(g.track, s, left, top)) + path(C.ink, placePath(g.letters, s, left, top));

  const tag = tagFont('Every lane counts.', 64, left, top + g.baseline * s + 116);

  return doc({
    w: W,
    h: H,
    viewBox: `0 0 ${W} ${H}`,
    title: 'Laree. Every lane counts.',
    body: rect(0, 0, W, H, C.paper) + path(C.track, bend) + word + path(C.ink, tag.d),
  });
}

/** The athlete display setting from DESIGN.md: Anybody, width 125, weight 800, italic. */
function athleteDisplay(): Outliner {
  return variableFont(join(FONTS, 'anybody/files/anybody-latin-standard-italic.woff2'), { wdth: 125, wght: 800 });
}

// ---------------------------------------------------------------- misuse sheet (for the brand guide)

function misuseSheet(retype: Outliner, caption: Outliner): string {
  const g = wordmarkGeometry(4);
  const tw = 380;
  const th = 230;
  const gap = 20;
  const W = 3 * tw + 4 * gap;
  const H = 2 * th + 3 * gap;
  const s = 1.9;
  /** The wordmark centred at (cx, cy), with an extra transform about its centre. */
  const placed = (cx: number, cy: number, extra: string, trackAttrs: string, letterFill: string): string =>
    `<g transform="translate(${cx} ${cy}) ${extra} scale(${s}) translate(${fmt(-g.width / 2)} ${fmt(-g.height / 2)})">` +
    `<path ${trackAttrs} d="${g.track}"/><path fill="${letterFill}" d="${g.letters}"/></g>`;
  const red = `fill="${C.track}"`;
  const tiles: { note: string; bg: string; art: (cx: number, cy: number) => string }[] = [
    { note: 'Don’t stretch or squash it.', bg: C.paper2, art: (x, y) => placed(x, y, 'scale(1.25 0.7)', red, C.ink) },
    { note: 'Don’t swap the colours.', bg: C.paper2, art: (x, y) => placed(x, y, '', `fill="${C.ink}"`, C.track) },
    {
      note: 'Don’t draw the lanes as outlines.',
      bg: C.paper2,
      art: (x, y) => placed(x, y, '', `fill="none" stroke="${C.track}" stroke-width="0.5"`, C.ink),
    },
    { note: 'Don’t slant or rotate it.', bg: C.paper2, art: (x, y) => placed(x, y, 'skewX(-14)', red, C.ink) },
    { note: 'Don’t set it on track red.', bg: C.track, art: (x, y) => placed(x, y, '', red, C.ink) },
    {
      note: 'Don’t retype the name in a font.',
      bg: C.paper2,
      art: (x, y) => {
        const size = 78;
        const l = retype('l', size, 0, 0);
        const rest = retype('aree', size, 0, 0);
        const x0 = x - (l.width + rest.width) / 2;
        const base = y + size * 0.36;
        return path(C.track, retype('l', size, x0, base).d) + path(C.ink, retype('aree', size, x0 + l.width, base).d);
      },
    },
  ];
  const out: string[] = [rect(0, 0, W, H, C.paper)];
  tiles.forEach((t, i) => {
    const x = gap + (i % 3) * (tw + gap);
    const y = gap + Math.floor(i / 3) * (th + gap);
    out.push(`<rect x="${x}" y="${y}" width="${tw}" height="${th}" rx="12" fill="${t.bg}"/>`, t.art(x + tw / 2, y + 96));
    const w = caption(t.note, 19, 0, 0).width;
    out.push(path(C.ink, caption(t.note, 19, x + (tw - w) / 2, y + th - 28).d));
  });
  return doc({ w: W, h: H, viewBox: `0 0 ${W} ${H}`, title: 'Laree logo misuse', body: out.join('') });
}

// ---------------------------------------------------------------- construction overlay

const label = (x: number, y: number, t: string, anchor = 'start', fill = ''): string =>
  `<text x="${fmt(x)}" y="${fmt(y)}" text-anchor="${anchor}"${fill ? ` fill="${fill}"` : ''}>${t}</text>`;

const line = (a: Pt, b: Pt, stroke: string, sw: number, dash = ''): string =>
  `<line x1="${fmt(a.x)}" y1="${fmt(a.y)}" x2="${fmt(b.x)}" y2="${fmt(b.y)}" stroke="${stroke}" stroke-width="${sw}"${dash ? ` stroke-dasharray="${dash}"` : ''}/>`;

const cross = (p: Pt, r: number, stroke: string): string =>
  line({ x: p.x - r, y: p.y }, { x: p.x + r, y: p.y }, stroke, 0.12) + line({ x: p.x, y: p.y - r }, { x: p.x, y: p.y + r }, stroke, 0.12);

/** The segment a to b, lengthened by `by` at both ends. */
function extend(a: Pt, b: Pt, by: number): [Pt, Pt] {
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  const ux = (b.x - a.x) / len;
  const uy = (b.y - a.y) / len;
  return [
    { x: a.x - ux * by, y: a.y - uy * by },
    { x: b.x + ux * by, y: b.y + uy * by },
  ];
}

function constructionSvg(): string {
  const g = wordmarkGeometry(4);
  const c = g.construction;
  const cs = g.clearSpace;
  const mx = 34;
  const x0 = -cs - mx;
  const y0 = -cs - 5;
  const w = g.width + 2 * (cs + mx);
  const h = g.height + 2 * cs + 10;
  const pitch = c.pitch;
  // Labels are 2.6 units: about 10 px when a document shows the overlay at 880 px wide.
  const font = `font-family="'Atkinson Hyperlegible Mono', ui-monospace, monospace" font-size="2.6" fill="${C.ink}"`;

  const out: string[] = [rect(x0, y0, w, h, C.paper)];
  // grid: 16 lane pitches tall
  const grid: string[] = [];
  for (let y = 0; y <= PARAMS.grid + 1e-9; y += pitch) grid.push(`M0 ${fmt(y)}H${fmt(g.width)}`);
  for (let x = 0; x <= g.width + 1e-9; x += pitch) grid.push(`M${fmt(x)} 0V${fmt(PARAMS.grid)}`);
  out.push(`<path d="${grid.join('')}" stroke="${C.ink}" stroke-opacity="0.12" stroke-width="0.05" fill="none"/>`);
  // the artwork, tinted
  out.push(path(C.track, g.track, ' fill-opacity="0.38"'), path(C.ink, g.letters, ' fill-opacity="0.2"'));
  // clear space
  out.push(
    `<rect x="${fmt(-cs)}" y="${fmt(-cs)}" width="${fmt(g.width + 2 * cs)}" height="${fmt(g.height + 2 * cs)}" fill="none" stroke="${C.trackInk}" stroke-width="0.12" stroke-dasharray="0.8 0.6"/>`,
  );
  // horizontal guides, labelled in units above the baseline
  const guides: [number, string, string][] = [
    [0, `grid ${PARAMS.grid} = 16 × ${fmt(pitch)}`, C.ink],
    [c.xHeightY, `x-height ${PARAMS.xHeight}`, C.ink],
    [c.centreLine, `bend centre ${fmt(PARAMS.grid - c.centreLine)}`, C.trackInk],
    [c.baselineY, 'baseline 0', C.ink],
  ];
  for (const [y, t, col] of guides) {
    out.push(line({ x: -cs - 4, y }, { x: g.width + cs + 4, y }, col, 0.1, col === C.trackInk ? '0.6 0.4' : ''));
    out.push(label(-cs - 5, y + 0.9, t, 'end', col));
  }
  out.push(label(g.width + 1.5, c.centreLine - 0.9, 'top of the e bars', 'start', C.trackInk));
  // lane centre lines, with the bend centre and radii
  const bc = c.bendCentre;
  const onStart = (x: number): number => {
    const [a, b] = c.start;
    return a.y + ((b.y - a.y) * (x - a.x)) / (b.x - a.x);
  };
  const onFinish = (y: number): number => {
    const [a, b] = c.finish;
    return a.x + ((b.x - a.x) * (y - a.y)) / (b.y - a.y);
  };
  for (const r of c.radii) {
    const x = bc.x - r.centre;
    const y = bc.y + r.centre;
    out.push(
      `<path d="M${fmt(x)} ${fmt(onStart(x))}L${fmt(x)} ${fmt(bc.y)}A${fmt(r.centre)} ${fmt(r.centre)} 0 0 0 ${fmt(bc.x)} ${fmt(y)}L${fmt(onFinish(y))} ${fmt(y)}" fill="none" stroke="${C.ink}" stroke-width="0.08" stroke-dasharray="0.5 0.35"/>`,
    );
  }
  // the bend centre and the inside radius, labelled above the a with a leader
  const inner = c.radii[0]?.inner ?? PARAMS.r0;
  out.push(cross(bc, 1.2, C.trackInk));
  out.push(line(bc, { x: bc.x - inner * Math.SQRT1_2, y: bc.y + inner * Math.SQRT1_2 }, C.trackInk, 0.1));
  out.push(line(bc, { x: bc.x + 2.2, y: 10.2 }, C.trackInk, 0.08));
  out.push(label(bc.x + 2.6, 9.4, `bend centre, inside radius ${PARAMS.r0}`, 'start', C.trackInk));
  // start and finish lines
  const [s0, s1] = extend(c.start[0], c.start[1], 5);
  out.push(line(s0, s1, C.trackInk, 0.14));
  out.push(label(c.start[1].x + 3, -1.6, `start ${c.startAngle.toFixed(1)}°: dy/dx = ${PARAMS.split} × π/2`, 'start', C.trackInk));
  const [f0, f1] = extend(c.finish[0], c.finish[1], 4);
  out.push(line(f0, f1, C.trackInk, 0.14));
  const below = PARAMS.grid + PARAMS.overshoot;
  out.push(
    label(c.finish[0].x + 1.4, below + 4.4, `finish ${c.finishAngle.toFixed(1)}° off vertical: dx/dy = ${fmt(1 - PARAMS.split)} × π/2`, 'start', C.trackInk),
    label(c.finish[0].x + 1.4, below + 8.4, `every lane ${(g.laneLengths[0] ?? 0).toFixed(3)} long, lanes 1 to 4`, 'start'),
  );
  // r: same inside radius as the l; terminal parallel to the start line
  if (c.rCentre) {
    out.push(cross(c.rCentre, 1, C.trackInk));
    out.push(line(c.rCentre, { x: c.rCentre.x + 1.2, y: 14.6 }, C.trackInk, 0.08));
    out.push(label(c.rCentre.x + 1.6, 13.8, `r ${PARAMS.r0}, as the l`, 'start', C.trackInk));
  }
  out.push(label(-cs, -cs - 1.4, `clear space ${cs} = 4 lane pitches`, 'start', C.trackInk));
  return doc({
    w: w * 6,
    h: h * 6,
    viewBox: `${fmt(x0)} ${fmt(y0)} ${fmt(w)} ${fmt(h)}`,
    title: 'Laree logo construction',
    body: `<g ${font}>${out.join('')}</g>`,
  });
}

// ---------------------------------------------------------------- outputs

function main(): void {
  mkdirSync(SVG_DIR, { recursive: true });
  mkdirSync(PUBLIC, { recursive: true });
  const files: Record<string, string> = {};
  const word = wordmarkGeometry(4);
  const mark = markGeometry(4);

  files['laree-wordmark.svg'] = wordmarkSvg(word, C.track, C.ink);
  files['laree-wordmark-on-paper.svg'] = wordmarkSvg(word, C.track, C.ink, C.paper);
  files['laree-wordmark-reversed.svg'] = wordmarkSvg(word, C.track, C.paper, C.ink);
  files['laree-wordmark-mono-ink.svg'] = wordmarkSvg(word, C.ink, C.ink);
  files['laree-wordmark-mono-paper.svg'] = wordmarkSvg(word, C.paper, C.paper);
  files['laree-mark.svg'] = doc({ w: 192, h: 192, viewBox: mark.viewBox, title: 'Laree', body: path(C.track, mark.track) });
  files['laree-mark-mono.svg'] = doc({ w: 192, h: 192, viewBox: mark.viewBox, title: 'Laree', body: path(C.ink, mark.track) });

  const app = iconGeometry('app');
  const mask = iconGeometry('maskable');
  const icon = (body: string): string => doc({ w: 1024, h: 1024, viewBox: '0 0 1024 1024', title: 'Laree', body });
  files['laree-app-icon.svg'] = icon(path(C.ink, app.tile) + path(C.track, app.mark));
  files['laree-app-icon-maskable.svg'] = icon(path(C.ink, mask.tile) + path(C.track, mask.mark));
  files['laree-icon-monochrome.svg'] = icon(path(C.ink, mask.mark));

  for (const size of [48, 32, 16] as const) {
    const f = faviconGeometry(size);
    files[`favicon-${size}.svg`] = doc({
      w: size,
      h: size,
      viewBox: `0 0 ${size} ${size}`,
      title: 'Laree',
      body: path(C.ink, f.tile) + path(C.track, f.track),
    });
  }
  files['laree-wordmark-small.svg'] = wordmarkSvg(wordmarkGeometry(2), C.track, C.ink);
  // One solid lane, for embroidery, debossing and stamps, where a gap would fill in.
  files['laree-wordmark-solid.svg'] = wordmarkSvg(wordmarkGeometry(1), C.track, C.ink);
  const solid = markGeometry(1);
  files['laree-mark-solid.svg'] = doc({ w: 192, h: 192, viewBox: solid.viewBox, title: 'Laree', body: path(C.track, solid.track) });
  const athlete = athleteDisplay();
  files['og-image.svg'] = ogImage(athlete);
  files['construction.svg'] = constructionSvg();
  const body = variableFont(join(FONTS, 'atkinson-hyperlegible-next/files/atkinson-hyperlegible-next-latin-wght-normal.woff2'), {
    wght: 500,
  });
  files['misuse.svg'] = misuseSheet(athlete, body);

  for (const [name, svg] of Object.entries(files)) writeFileSync(join(SVG_DIR, name), svg);
  writeFileSync(join(PUBLIC, 'favicon.svg'), files['favicon-32.svg'] ?? '');

  const lengths = word.laneLengths.map((l) => l.toFixed(6)).join(' / ');
  console.log(`lanes ${lengths}; wordmark ${word.width.toFixed(2)} x ${word.height.toFixed(2)} units`);
  console.log(`start ${word.construction.startAngle.toFixed(2)}°, finish ${word.construction.finishAngle.toFixed(2)}° off vertical`);
  console.log(`letters ${word.construction.letters.map(([a, b]) => `${a.toFixed(2)}-${b.toFixed(2)}`).join(', ')}`);
  for (const [name, svg] of Object.entries(files)) console.log(`  brand/svg/${name}  ${(svg.length / 1024).toFixed(1)} KB`);
  console.log('  public/favicon.svg');
}

main();
