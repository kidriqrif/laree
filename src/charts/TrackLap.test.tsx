import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { lap, lapText } from '../domain/gamification.ts';
import type { GamificationInput, LapState } from '../domain/gamification.ts';
import type { Activity, PlannedWorkout, Sport } from '../domain/types.ts';
import { TrackLap, lapGeometry } from './TrackLap.tsx';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

// ---------- Fixtures. Week 1 is days 0 to 6, Monday to Sunday. ----------

function pw(id: string, day: number, sport: Sport, plannedLoad: number, plannedDurationS = 3600): PlannedWorkout {
  return {
    id,
    athleteId: 'amir',
    day,
    order: 1,
    sport,
    title: id,
    steps: [{ id: 's', kind: 'steady', durationS: plannedDurationS }],
    plannedDurationS,
    plannedLoad,
    keySession: false,
  };
}

function act(id: string, day: number, sport: Sport, load: number, durationS = 3600): Activity {
  return {
    id,
    athleteId: 'amir',
    day,
    startMinute: 360,
    sport,
    title: id,
    source: 'file',
    summary: { durationS, movingTimeS: durationS },
    load: { load, method: 'duration', confidence: 'medium', intensity: null },
  };
}

function input(today: number, planned: PlannedWorkout[], activities: Activity[] = []): GamificationInput {
  return { athleteId: 'amir', today, planned, activities, checkIns: [], kudos: [], thresholds: [], races: [], phases: [], excuses: [] };
}

function week1(today: number, planned: PlannedWorkout[], activities: Activity[] = []): LapState {
  return lap(input(today, planned, activities), 1);
}

/** L7: Amir on a Wednesday. Swim 60 of 120, bike 120 of 300, run 140 of 200; expected 60, 150, 120. */
const l7 = week1(
  2,
  [pw('s1', 0, 'swim', 60), pw('s2', 3, 'swim', 60), pw('b1', 1, 'bike', 150), pw('b2', 5, 'bike', 150), pw('r1', 2, 'run', 120), pw('r2', 6, 'run', 80)],
  [act('as', 0, 'swim', 60), act('ab', 1, 'bike', 120), act('ar', 2, 'run', 140)],
);

/** L5: swim 150 of 100, run 150 of 300. */
const l5 = week1(4, [pw('s', 0, 'swim', 100), pw('r', 1, 'run', 300)], [act('as', 0, 'swim', 150), act('ar', 1, 'run', 150)]);

const four = week1(
  3,
  [pw('s', 0, 'swim', 60), pw('b', 1, 'bike', 120), pw('r', 2, 'run', 90), pw('t', 3, 'strength', 40)],
  [act('as', 0, 'swim', 60), act('ab', 1, 'bike', 100)],
);

/** One run lane, `done` of 300 load, on Sunday of week 1. */
const runWeek = (done: number) => week1(6, [pw('r', 1, 'run', 300)], [act('a', 1, 'run', done)]);

const L1 = lapGeometry('full', 1).length;

// ---------- DOM helpers ----------

const parts = (c: HTMLElement, part: string) => Array.from(c.querySelectorAll<SVGElement>(`[data-part="${part}"]`));
const attr = (el: Element | undefined, name: string) => Number(el?.getAttribute(name));
const texts = (c: HTMLElement) => Array.from(c.querySelectorAll('svg text'), (t) => t.textContent ?? '');
const figure = (c: HTMLElement) => c.querySelector('figure');

function noNaN(container: HTMLElement) {
  for (const el of container.querySelectorAll('*')) {
    for (const a of Array.from(el.attributes)) {
      expect(a.value, `${el.tagName} ${a.name}`).not.toMatch(/NaN|undefined|Infinity/);
    }
  }
}

function stubMotion(reduce: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: reduce && query === '(prefers-reduced-motion: reduce)',
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  }));
}

// ---------- Geometry ----------

describe('lap geometry', () => {
  it('L6: full size, four lanes', () => {
    const g = lapGeometry('full', 4);
    expect(g.lanes.map((x) => x.radius)).toEqual([48, 62, 76, 90]);
    expect(g.lanes.map((x) => x.stagger)).toEqual([0, expect.closeTo(88.0, 1), expect.closeTo(175.9, 1), expect.closeTo(263.9, 1)]);
    expect(g.length).toBeCloseTo(541.6, 1);
  });

  it('runs every lane exactly one lap from its start to the finish line', () => {
    for (const size of ['full', 'compact'] as const) {
      for (let n = 1; n <= 4; n++) {
        const g = lapGeometry(size, n);
        for (const lane of g.lanes) expect(lane.perimeter - lane.stagger).toBeCloseTo(g.length, 6);
      }
    }
  });

  it('keeps to the four lane sports', () => {
    expect(lapGeometry('full', 7).lanes).toHaveLength(4);
    expect(lapGeometry('compact', -1).lanes).toHaveLength(0);
    expect(lapGeometry('full', 0).length).toBe(0);
  });

  it('L6 drawn: lane 1 starts on the finish line, the others at staggered start marks', () => {
    const { container } = render(<TrackLap lap={four} />);
    expect(parts(container, 'lane')[0]?.getAttribute('d')).toMatch(/^M220 148 /);
    expect(parts(container, 'start')).toHaveLength(3);
    const finish = parts(container, 'finish')[0];
    expect([attr(finish, 'x1'), attr(finish, 'x2')]).toEqual([220, 220]);
    // From the inside edge of lane 1 (cy + r_1 − w/2) to the outer edge (cy + R).
    expect([attr(finish, 'y1'), attr(finish, 'y2')]).toEqual([142, 196]);
  });

  it('compact, four lanes: the outside lane starts on the back straight', () => {
    const { container } = render(<TrackLap lap={four} size="compact" />);
    expect(container.querySelector('svg')?.getAttribute('viewBox')).toBe('0 0 320 120');
    const tick = parts(container, 'start').at(-1);
    // Square to a straight: an upright tick across the lane at cy − r_4 = 8, between the bends.
    expect(attr(tick, 'x1')).toBeCloseTo(attr(tick, 'x2'), 3);
    expect([attr(tick, 'y1'), attr(tick, 'y2')]).toEqual([12, 4]);
    expect(attr(tick, 'x1')).toBeGreaterThan(60);
    expect(attr(tick, 'x1')).toBeLessThan(260);
  });
});

// ---------- Lanes and fills ----------

describe('lanes', () => {
  it('draws one lane per planned sport, inside lane first, and none for unplanned sports', () => {
    const l = week1(3, [pw('r', 1, 'run', 100), pw('s', 0, 'swim', 50)], [act('t', 2, 'strength', 40)]);
    const { container } = render(<TrackLap lap={l} />);
    expect(parts(container, 'lane').map((p) => p.dataset.sport)).toEqual(['swim', 'run']);
    expect(container.querySelector('svg')?.getAttribute('data-lanes')).toBe('2');
    expect(screen.getByText("Strength: not in this week's plan")).toBeTruthy();
  });

  it('follows the number of sports, one to four', () => {
    const sports = ['swim', 'bike', 'run', 'strength'] as const;
    for (let n = 1; n <= 4; n++) {
      const l = week1(3, sports.slice(0, n).map((s, i) => pw(s, i, s, 60)));
      for (const size of ['full', 'compact'] as const) {
        const { container, unmount } = render(<TrackLap lap={l} size={size} />);
        expect(parts(container, 'lane')).toHaveLength(n);
        expect(parts(container, 'fill')).toHaveLength(n);
        noNaN(container);
        unmount();
      }
    }
  });

  it('names every lane in words and marks its place on the bend, so colour is never the only cue', () => {
    const { container } = render(<TrackLap lap={l7} />);
    for (const name of ['Swim', 'Bike', 'Run']) expect(screen.getByText(name)).toBeTruthy();
    const rows = Array.from(container.querySelectorAll('li[data-sport]'));
    rows.forEach((row, i) => {
      const arcs = Array.from(row.querySelectorAll('svg path'));
      expect(arcs).toHaveLength(3);
      expect(arcs.findIndex((a) => a.hasAttribute('data-on'))).toBe(i);
    });
  });
});

describe('fills', () => {
  it('L1: run 240 of 300 fills 0.8 of the lap, no caution', () => {
    const l = runWeek(240);
    expect(l.lanes[0]?.pct).toBe(80);
    const { container } = render(<TrackLap lap={l} />);
    const fill = parts(container, 'fill')[0];
    expect(fill?.dataset.fill).toBe('0.8');
    expect(attr(fill, 'data-length')).toBeCloseTo(0.8 * L1, 2);
    expect(Number(fill?.style.strokeDashoffset)).toBeCloseTo(0.2 * L1, 2);
    expect(figure(container)?.hasAttribute('data-caution')).toBe(false);
  });

  it('L7: each lane fills in proportion to done over planned', () => {
    const { container } = render(<TrackLap lap={l7} />);
    const L = lapGeometry('full', 3).length;
    const fills = parts(container, 'fill');
    expect(fills.map((f) => Number(f.dataset.fill))).toEqual([0.5, 0.4, 0.7]);
    for (const f of fills) {
      const share = Number(f.dataset.fill);
      expect(attr(f, 'data-length')).toBeCloseTo(share * L, 2);
      expect(Number(f.style.strokeDashoffset)).toBeCloseTo((1 - share) * L, 2);
      expect(f.style.strokeDasharray.split(/[\s,]+/).map(Number)).toEqual([expect.closeTo(L, 2), expect.closeTo(2 * L, 2)]);
    }
  });

  it('L2: caps the fill at one lap; 120.0% is not caution, 120.3% is', () => {
    for (const [done, pct, caution] of [
      [360, 120, false],
      [361, 120.3, true],
    ] as const) {
      const l = runWeek(done);
      expect(l.lanes[0]?.pct).toBe(pct);
      const { container, unmount } = render(<TrackLap lap={l} />);
      expect(attr(parts(container, 'fill')[0], 'data-length')).toBeCloseTo(L1, 2);
      expect(figure(container)?.hasAttribute('data-caution')).toBe(caution);
      expect(parts(container, 'hatch')).toHaveLength(caution ? 1 : 0);
      unmount();
    }
  });
});

// ---------- Caution ----------

describe('caution', () => {
  it('L5: the over lane stops at the finish, gets the hatch and "More than planned"; nothing moves', () => {
    stubMotion(false);
    expect(l5.lapPct).toBe(62.5);
    const { container } = render(<TrackLap lap={l5} />);
    expect(texts(container)[0]).toBe('62%');
    const [swim, run] = parts(container, 'fill');
    expect(swim?.hasAttribute('data-over')).toBe(true);
    expect(run?.hasAttribute('data-over')).toBe(false);
    expect(attr(swim, 'data-length')).toBeCloseTo(lapGeometry('full', 2).length, 2);
    expect(parts(container, 'hatch')).toHaveLength(1);
    expect(screen.getAllByText('More than planned')).toHaveLength(1);
    expect(screen.getByText("That's more than planned. Coach can see it.")).toBeTruthy();
    expect(figure(container)?.dataset.motion).toBe('none');
    expect(swim?.style.transition).toBe('none');
  });

  it('L3: a sport outside the plan can tip the week over, and the text says so', () => {
    const l = week1(3, [pw('r', 1, 'run', 300)], [act('ar', 1, 'run', 300), act('ab', 2, 'bike', 70)]);
    expect(l.totalPct).toBe(123.3);
    const { container } = render(<TrackLap lap={l} />);
    expect(figure(container)?.hasAttribute('data-caution')).toBe(true);
    expect(parts(container, 'hatch')).toHaveLength(0);
    expect(screen.getByText("Bike: not in this week's plan")).toBeTruthy();
    expect(screen.getByRole('figure').getAttribute('aria-labelledby')).toBeTruthy();
    expect(screen.getByRole('figure', { name: lapText(l).short }).textContent).toContain(
      "Bike wasn't in this week's plan. That's more than planned. Coach can see it.",
    );
  });
});

// ---------- Pace lights ----------

describe('pace lights', () => {
  it('L4: the light sits where the plan expects the athlete today', () => {
    const l = week1(2, [pw('r1', 0, 'run', 50), pw('r2', 2, 'run', 100), pw('r3', 5, 'run', 150)], [act('a', 0, 'run', 50)]);
    expect(l.lanes[0]?.light).toBe(0.5);
    const { container } = render(<TrackLap lap={l} />);
    const lights = parts(container, 'light');
    expect(lights).toHaveLength(1);
    // Half a one-lane lap ends where the back straight meets the left bend: (cx − S/2, cy − r).
    expect(attr(lights[0], 'cx')).toBeCloseTo(100, 3);
    expect(attr(lights[0], 'cy')).toBeCloseTo(10, 3);
  });

  it('shows one light per lane in the current week', () => {
    const { container } = render(<TrackLap lap={l7} />);
    expect(parts(container, 'light').map((x) => x.dataset.sport)).toEqual(['swim', 'bike', 'run']);
  });
});

// ---------- Text version ----------

describe('text version', () => {
  it('L7: names the compact lap with the short version, word for word', () => {
    const { container } = render(<TrackLap lap={l7} size="compact" />);
    expect(
      screen.getByRole('figure', {
        name: "This week's lap: 51% of planned load done, plan by today 53%. Swim 50%, bike 40%, run 70%.",
      }),
    ).toBeTruthy();
    expect(container.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
    expect(texts(container)).toEqual(['51%']);
    expect(screen.getByText('Plan by today 53%')).toBeTruthy();
    // The full text version travels with the compact lap too.
    const items = Array.from(container.querySelectorAll('ul.sr-only li'), (li) => li.textContent);
    expect(items).toEqual(lapText(l7).full);
  });

  it('lists done, planned and the pace light for each lane under the full lap', () => {
    const { container } = render(<TrackLap lap={l7} />);
    const items = Array.from(container.querySelectorAll('ul.sr-only li'), (li) => li.textContent);
    expect(items).toEqual(lapText(l7).full);
    expect(items[0]).toBe('Swim: 50% of planned load, 1:00 of 2:00. Plan by today: 50%.');
    expect(items[2]).toBe('Run: 70% of planned load, 1:00 of 2:00. Plan by today: 60%.');
    expect(texts(container)).toEqual(['51%', "of this week's plan", 'Plan by today 53%']);
  });

  it('announces the new short version after a change, never on first render', () => {
    const before = runWeek(120);
    const after = week1(6, [pw('r', 1, 'run', 300)], [act('a', 1, 'run', 120), act('b', 3, 'run', 60)]);
    const { rerender } = render(<TrackLap lap={before} />);
    const status = screen.getByRole('status');
    expect(status.textContent).toBe('');
    rerender(<TrackLap lap={after} />);
    expect(status.textContent).toBe(lapText(after).short);
  });

  it('stays quiet when announce is off', () => {
    const { rerender } = render(<TrackLap lap={runWeek(120)} announce={false} />);
    rerender(<TrackLap lap={runWeek(180)} announce={false} />);
    expect(screen.getByRole('status').textContent).toBe('');
  });
});

// ---------- Motion ----------

describe('motion', () => {
  it('moves a changed fill from its old length to its new one', () => {
    stubMotion(false);
    const { container, rerender } = render(<TrackLap lap={runWeek(120)} />);
    const before = parts(container, 'fill')[0];
    expect(Number(before?.style.strokeDashoffset)).toBeCloseTo(0.6 * L1, 2);
    expect(figure(container)?.dataset.motion).toBe('fill');
    rerender(<TrackLap lap={runWeek(240)} />);
    const after = parts(container, 'fill')[0];
    // The same element, so the transition runs from the old length to the new one.
    expect(after).toBe(before);
    expect(Number(after?.style.strokeDashoffset)).toBeCloseTo(0.2 * L1, 2);
    expect(after?.style.transition).toContain('stroke-dashoffset');
  });

  it('drops the transition under reduced motion, so fills jump', () => {
    stubMotion(true);
    const { container, rerender } = render(<TrackLap lap={runWeek(120)} />);
    rerender(<TrackLap lap={runWeek(240)} />);
    const fill = parts(container, 'fill')[0];
    expect(fill?.style.transition).toBe('none');
    expect(figure(container)?.dataset.motion).toBe('none');
    expect(Number(fill?.style.strokeDashoffset)).toBeCloseTo(0.2 * L1, 2);
  });
});

// ---------- Week states ----------

describe('states', () => {
  it('no plan: the outer edge only and "No plan this week"', () => {
    const l = week1(3, []);
    expect(l.status).toBe('noPlan');
    const { container } = render(<TrackLap lap={l} />);
    expect(parts(container, 'edge')).toHaveLength(1);
    expect(parts(container, 'lane')).toHaveLength(0);
    expect(parts(container, 'finish')).toHaveLength(0);
    expect(texts(container)).toEqual(['No plan this week']);
    expect(screen.getByRole('figure', { name: 'No plan this week.' })).toBeTruthy();
    noNaN(container);
  });

  it('future week: empty lanes, no lights and the planned hours', () => {
    const l = lap(input(2, [pw('n', 9, 'run', 60, 5400)]), 2);
    expect(l.status).toBe('future');
    const { container } = render(<TrackLap lap={l} />);
    expect(parts(container, 'fill').map((f) => f.dataset.fill)).toEqual(['0']);
    expect(parts(container, 'light')).toHaveLength(0);
    expect(texts(container)).toEqual(['1:30 h', 'Planned']);
    noNaN(container);
  });

  it('past week: final fills, no lights, then "Full lap" or "Excused"', () => {
    const past = week1(9, [pw('r', 1, 'run', 100)], [act('a', 1, 'run', 100)]);
    expect(past.status).toBe('past');
    const full = render(<TrackLap lap={{ ...past, fullLap: true }} />);
    expect(parts(full.container, 'light')).toHaveLength(0);
    expect(texts(full.container)).toEqual(['100%', "of the week's plan"]);
    expect(screen.getByText('Full lap')).toBeTruthy();
    full.unmount();
    // An excused week is never a full lap (the domain's rule).
    render(<TrackLap lap={{ ...past, excused: true, fullLap: false }} />);
    expect(screen.getByText('Excused')).toBeTruthy();
    expect(screen.queryByText('Full lap')).toBeNull();
  });
});
