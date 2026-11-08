import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { wordmarkGeometry } from '../../../brand/src/logo-geometry.ts';
import { Logo } from './Logo.tsx';

const svgOf = (ui: React.ReactElement): SVGSVGElement => {
  const svg = render(ui).container.querySelector('svg');
  if (!svg) throw new Error('no svg rendered');
  return svg;
};
const subpaths = (svg: SVGSVGElement): number => (svg.querySelector('path')?.getAttribute('d')?.match(/M/g) ?? []).length;
const fills = (tone: 'primary' | 'reversed' | 'mono'): (string | null)[] =>
  [...svgOf(<Logo tone={tone} />).querySelectorAll('path')].map((p) => p.getAttribute('fill'));

describe('Logo', () => {
  it('is an image named by its title', () => {
    const svg = svgOf(<Logo title="Laree" />);
    expect(svg.getAttribute('role')).toBe('img');
    const title = svg.querySelector('title');
    expect(title?.textContent).toBe('Laree');
    expect(svg.getAttribute('aria-labelledby')).toBe(title?.id);
    expect(svg.hasAttribute('aria-hidden')).toBe(false);
  });

  it('is hidden from assistive technology when decorative', () => {
    const svg = svgOf(<Logo />);
    expect(svg.getAttribute('aria-hidden')).toBe('true');
    expect(svg.hasAttribute('role')).toBe(false);
    expect(svg.querySelector('title')).toBeNull();
  });

  it('keeps the artwork proportions at the requested height', () => {
    const g = wordmarkGeometry(4);
    const svg = svgOf(<Logo size={96} />);
    expect(svg.getAttribute('height')).toBe('96');
    expect(Number(svg.getAttribute('width'))).toBeCloseTo((96 * g.width) / g.height, 1);
    const mark = svgOf(<Logo variant="mark" size={40} />);
    expect(mark.getAttribute('width')).toBe('40');
    expect(mark.querySelectorAll('path')).toHaveLength(1);
  });

  it('uses fewer, wider lanes at small sizes', () => {
    expect(subpaths(svgOf(<Logo size={28} />))).toBe(2);
    expect(subpaths(svgOf(<Logo size={64} />))).toBe(4);
    expect(subpaths(svgOf(<Logo variant="mark" size={48} />))).toBe(3);
  });

  it('colours by tone: track red stays, letters flip, mono follows the text colour', () => {
    expect(fills('primary')).toEqual(['var(--palette-track, #E4572E)', 'var(--color-text, var(--palette-ink, #1A1714))']);
    expect(fills('reversed')).toEqual(['var(--palette-track, #E4572E)', 'var(--palette-paper, #FBF6EE)']);
    expect(fills('mono')).toEqual(['currentColor', 'currentColor']);
  });
});
