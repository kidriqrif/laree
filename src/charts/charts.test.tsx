import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Bars, Bullet, Sparkline, ZoneBar } from './index.ts';
import { fmtDuration, fmtMinutes, fmtNumber, fmtPace, fmtSigned } from './format.ts';

afterEach(cleanup);

function noNaN(container: HTMLElement) {
  for (const el of container.querySelectorAll('*')) {
    for (const a of Array.from(el.attributes)) {
      expect(a.value, `${el.tagName} ${a.name}`).not.toMatch(/NaN|undefined|Infinity/);
    }
  }
}

const series = (n: number) => Array.from({ length: n }, (_, i) => 10 + ((i * 7) % 13));
const bars = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ key: `k${i}`, label: `W${i}`, value: 3600 + ((i * 37) % 50) * 60, target: 4000 }));

describe('chart kit', () => {
  for (const n of [0, 1, 100]) {
    it(`Sparkline renders ${n} points`, () => {
      const { container } = render(<Sparkline values={series(n)} label="Fitness" width={120} />);
      noNaN(container);
      expect(container.querySelector('p')?.textContent).toContain(n === 0 ? 'no data' : `${n} ${n === 1 ? 'point' : 'points'}`);
    });
    it(`Bars renders ${n} points`, () => {
      const { container } = render(<Bars data={bars(n)} title="Weekly volume" sport="run" width={400} formatValue={(v) => fmtMinutes(v / 60)} />);
      noNaN(container);
      const text = container.querySelector('p')?.textContent ?? '';
      expect(text).toMatch(n === 0 ? /no data/ : /Latest.*against a target of 1:07/);
    });
  }

  it('Sparkline survives gaps and a flat series', () => {
    const { container } = render(<Sparkline values={[5, null, 5, NaN, 5]} label="Flat" width={80} />);
    noNaN(container);
    expect(container.querySelector('p')?.textContent).toContain('3 points');
  });

  it('Bars table toggle shows a table', () => {
    render(<Bars data={bars(3)} title="Volume" width={300} />);
    fireEvent.click(screen.getByRole('button', { name: 'Show table' }));
    expect(screen.getByRole('table')).toBeTruthy();
    expect(screen.getAllByRole('row')).toHaveLength(4);
  });

  it('ZoneBar states zone minutes', () => {
    const { container } = render(<ZoneBar seconds={[600, 1800, 900, 300, 0]} width={300} />);
    noNaN(container);
    const text = container.querySelector('p')?.textContent ?? '';
    expect(text).toContain('Z2 30 min');
    expect(text).toContain('1 h 00 min in total');
    expect(container.textContent).toContain('Z1');
  });

  it('ZoneBar handles empty and single-zone input', () => {
    const a = render(<ZoneBar seconds={[]} width={200} />);
    noNaN(a.container);
    expect(a.container.querySelector('p')?.textContent).toContain('no time in zones');
    const b = render(<ZoneBar seconds={[0, 0, 3600]} width={200} />);
    noNaN(b.container);
    expect(b.container.textContent).toContain('Z3');
  });

  it('Bullet states actual, target and band', () => {
    const { container } = render(<Bullet title="Weekly Load" actual={90} target={100} width={240} />);
    noNaN(container);
    const text = container.querySelector('p')?.textContent ?? '';
    expect(text).toContain('90 against a target of 100');
    expect(text).toContain('90% of target');
    expect(text).toContain('On plan');
  });

  it('Bullet handles zero and no target', () => {
    const a = render(<Bullet title="Zero" actual={0} target={0} width={200} />);
    noNaN(a.container);
    expect(a.container.querySelector('p')?.textContent).toContain('No target set');
    const b = render(<Bullet title="Over" actual={121} target={100} width={200} />);
    noNaN(b.container);
    expect(b.container.querySelector('p')?.textContent).toContain('Over');
  });
});

describe('format', () => {
  it('follows metrics section 9', () => {
    expect(fmtSigned(-11.905)).toBe('−12');
    expect(fmtSigned(5.5)).toBe('+6');
    expect(fmtSigned(-0.4)).toBe('0');
    expect(fmtSigned(6.678, 1)).toBe('+6.7');
    expect(fmtNumber(21097.5)).toBe('21,098');
    expect(fmtDuration(3725)).toBe('1:02');
    expect(fmtDuration(5430)).toBe('1:31');
    expect(fmtDuration(45)).toBe('45 s');
    expect(fmtPace(1000 / 300, 'run')).toBe('5:00 /km');
    expect(fmtPace(0.9259, 'swim')).toBe('1:48 /100 m');
    expect(fmtPace(7.5, 'bike')).toBe('27.0 km/h');
  });
});
