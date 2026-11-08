import { useId, type CSSProperties } from 'react';
import {
  PALETTE,
  lanesForSize,
  markGeometry,
  wordmarkGeometry,
  type LaneCount,
  type LogoGeometry,
} from '../../../brand/src/logo-geometry.ts';

export type LogoVariant = 'wordmark' | 'mark';
export type LogoTone = 'primary' | 'reversed' | 'mono';

export interface LogoProps {
  /** The full "laree" (default), or the l on its own for tight spaces. */
  variant?: LogoVariant;
  /**
   * primary: track red l, letters in the theme's text colour (ink on paper, chalk at night).
   * reversed: paper letters for a fixed ink or photo background. mono: everything in currentColor.
   */
  tone?: LogoTone;
  /** Rendered height in CSS pixels. The width follows the artwork. Default 32. */
  size?: number;
  /**
   * Accessible name, usually "Laree". Leave it out when the logo is decorative, for example
   * next to the visible word or inside a link that already has a name.
   */
  title?: string;
  className?: string;
  style?: CSSProperties;
}

// Tokens from src/styles, with the brand values as fallbacks. Primary letters follow --color-text,
// so the same logo reads ink on paper and chalk on the night theme without a second variant.
const TRACK = `var(--palette-track, ${PALETTE.track})`;
const TEXT = `var(--color-text, var(--palette-ink, ${PALETTE.ink}))`;
const PAPER = `var(--palette-paper, ${PALETTE.paper})`;

/** [l, letters] fills per tone. The track red never changes between primary and reversed. */
const FILLS: Record<LogoTone, readonly [string, string]> = {
  primary: [TRACK, TEXT],
  reversed: [TRACK, PAPER],
  mono: ['currentColor', 'currentColor'],
};

// Eight possible shapes in all (two variants, four lane cuts), so they are built once and shared.
const shapes = new Map<string, LogoGeometry>();
function shape(variant: LogoVariant, lanes: LaneCount): LogoGeometry {
  const key = `${variant}-${lanes}`;
  let g = shapes.get(key);
  if (!g) {
    g = variant === 'mark' ? markGeometry(lanes) : wordmarkGeometry(lanes);
    shapes.set(key, g);
  }
  return g;
}

/**
 * The Laree logo as inline SVG, drawn from brand/src/logo-geometry.ts. Below 64 px (wordmark) or
 * 128 px (mark) it switches to a cut with fewer, wider lanes, so the lane lines never blur shut.
 */
export function Logo({ variant = 'wordmark', tone = 'primary', size = 32, title, className, style }: LogoProps) {
  const titleId = `${useId()}logo-title`;
  const g = shape(variant, lanesForSize(variant, size));
  const [trackFill, letterFill] = FILLS[tone];
  const width = Math.round(((size * g.width) / g.height) * 100) / 100;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={g.viewBox}
      width={width}
      height={size}
      className={className}
      style={style}
      role={title ? 'img' : undefined}
      aria-labelledby={title ? titleId : undefined}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      {title ? <title id={titleId}>{title}</title> : null}
      <path fill={trackFill} d={g.track} />
      {g.letters ? <path fill={letterFill} d={g.letters} /> : null}
    </svg>
  );
}
