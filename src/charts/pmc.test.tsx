import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { Curve, Heatmap, PMC } from './index.ts';
import type { HeatRow } from './index.ts';

afterEach(cleanup);

function noNaN(container: HTMLElement) {
  for (const el of container.querySelectorAll('*')) {
    for (const a of Array.from(el.attributes)) {
      expect(a.value, `${el.tagName} ${a.name}`).not.toMatch(/NaN|undefined|Infinity/);
    }
  }
}

const pmcPoints = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    day: 100 + i,
    fitness: 40 + i * 0.3,
    fatigue: 45 + ((i * 7) % 20),
    form: -5 + ((i * 3) % 30) - 12,
    projected: i >= n - 3 && n > 3,
  }));

const curve = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ seconds: 5 * Math.pow(1.2, i), value: 900 / (1 + i * 0.05) }));

describe('PMC', () => {
  for (const n of [0, 1, 100]) {
    it(`renders ${n} points without NaN`, () => {
      const { container } = render(
        <PMC points={pmcPoints(n)} today={100 + Math.max(0, n - 4)} width={480} races={[{ day: 110, name: 'Test Race', priority: 'A' }]} />,
      );
      noNaN(container);
      expect(container.firstChild).not.toBeNull();
    });
  }

  it('states the latest Fitness, Fatigue and Form', () => {
    const pts = [
      { day: 1, fitness: 50.4, fatigue: 60.2, form: -9.6, projected: false },
      { day: 2, fitness: 51, fatigue: 58, form: -7.8, projected: false },
    ];
    const { container } = render(<PMC points={pts} today={2} width={400} />);
    const text = container.querySelector('p')?.textContent ?? '';
    expect(text).toContain('Fitness 51');
    expect(text).toContain('Fatigue 58');
    expect(text).toContain('Form −8');
    expect(text).toContain('Steady');
  });

  it('tints and names the Form bands in their own panel, below Fitness and Fatigue', () => {
    const { container } = render(<PMC points={pmcPoints(100)} today={196} width={480} />);
    const bands = Array.from(container.querySelectorAll('rect[data-band]'));
    expect(bands.length).toBeGreaterThan(0);
    // Default height 240: plot is 196 tall, the top panel 109, then a 14 gap, so Form starts at 123.
    expect(bands.map((r) => Number(r.getAttribute('y'))).every((y) => y >= 123)).toBe(true);
    const words = Array.from(container.querySelectorAll('svg text')).map((t) => t.textContent);
    expect(words).toEqual(expect.arrayContaining(['Building', 'Steady', 'Fresh']));
  });

  it('keyboard stepping moves the readout', () => {
    render(<PMC points={pmcPoints(10)} today={109} width={400} />);
    const readout = screen.getByTestId('pmc-readout');
    const before = readout.textContent;
    fireEvent.keyDown(screen.getByRole('slider', { name: /Fitness, Fatigue and Form/ }), { key: 'ArrowLeft' });
    expect(readout.textContent).not.toBe(before);
    fireEvent.keyDown(screen.getByRole('slider', { name: /Fitness, Fatigue and Form/ }), { key: 'Home' });
    expect(readout.textContent).toContain('Fitness 40');
  });
});

const rows = (nr: number, nc: number): HeatRow[] =>
  Array.from({ length: nr }, (_, r) => ({
    key: `r${r}`,
    label: `Athlete ${r}`,
    cells: Array.from({ length: nc }, (_unused, c) => (c % 5 === 4 ? null : { level: (c % 5) as 0 | 1 | 2 | 3, text: String(c), glyph: c % 3 === 0 ? '↓' : undefined })),
  }));
const cols = (nc: number) => Array.from({ length: nc }, (_, c) => ({ key: `c${c}`, label: `D${c}` }));

describe('Heatmap', () => {
  for (const [nr, nc] of [[0, 0], [1, 1], [10, 10]] as const) {
    it(`renders ${nr} by ${nc}`, () => {
      const { container } = render(<Heatmap title="Sleep" columns={cols(nc)} rows={rows(nr, nc)} />);
      noNaN(container);
      expect(container.firstChild).not.toBeNull();
    });
  }

  it('shows values, a legend, and moves with arrow keys (roving tabindex)', () => {
    const { container } = render(<Heatmap title="Sleep" columns={cols(4)} rows={rows(2, 4)} />);
    const cells = container.querySelectorAll('td');
    expect(cells[1]?.textContent).toContain('1');
    expect(container.querySelectorAll('[tabindex="0"]td').length).toBe(1);
    const first = cells[0] as HTMLElement;
    first.focus();
    fireEvent.keyDown(first, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(cells[1]);
    fireEvent.keyDown(cells[1] as HTMLElement, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(cells[5]);
    expect((cells[5] as HTMLElement).tabIndex).toBe(0);
    expect((cells[0] as HTMLElement).tabIndex).toBe(-1);
    expect(screen.getByRole('list', { name: 'Legend' })).toBeTruthy();
  });

  it('takes the status scale for compliance grids', () => {
    const { container, rerender } = render(<Heatmap title="Sleep" columns={cols(2)} rows={rows(1, 2)} />);
    expect(container.querySelector('[data-scale="heat"]')).not.toBeNull();
    rerender(<Heatmap title="Plan" columns={cols(2)} rows={rows(1, 2)} scale="status" />);
    expect(container.querySelector('[data-scale="status"]')).not.toBeNull();
    // Without a legend prop, the status scale names states, not Lowest to Highest.
    const legend = within(screen.getByRole('list', { name: 'Legend' }));
    expect(legend.getByText('On plan')).toBeTruthy();
    expect(legend.getByText('Missed')).toBeTruthy();
    expect(legend.queryByText('Lowest')).toBeNull();
  });
});

describe('Curve', () => {
  for (const n of [0, 1, 100]) {
    it(`renders ${n} points without NaN`, () => {
      const { container } = render(<Curve points={curve(n)} comparison={curve(Math.min(n, 3))} width={480} />);
      noNaN(container);
      expect(container.firstChild).not.toBeNull();
    });
  }

  it('summarises and steps by keyboard', () => {
    const { container } = render(<Curve points={curve(5)} comparison={curve(5)} width={480} />);
    expect(container.querySelector('p')?.textContent).toContain('best');
    const readout = screen.getByTestId('curve-readout');
    const before = readout.textContent;
    fireEvent.keyDown(screen.getByRole('slider', { name: /Best efforts/ }), { key: 'ArrowLeft' });
    expect(readout.textContent).not.toBe(before);
  });
});
