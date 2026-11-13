import { describe, expect, it } from 'vitest';
import type { LoadThresholds } from '../../domain/metrics/load.ts';
import type { PlannedWorkout, Race } from '../../domain/types.ts';
import { escapeText, durationLabel, foldLine, sessionIcs, weekIcs } from './ics.ts';

/** Export clock: Sunday 8 November 2026, 10:00 in Kuala Lumpur. Runtime start is Monday 13 July 2026. */
const NOW = new Date('2026-11-08T02:00:00Z');
const ATHLETE = { id: 'amir' as const, name: 'Amir' };
const THRESHOLDS: LoadThresholds = { ftp: 285, lthr: 165, thresholdPaceSPerKm: 238, cssSPer100m: 103 };
const encoder = new TextEncoder();
const octets = (s: string): number => encoder.encode(s).length;

/** Threshold 4 x 8 (io.md 3.6): warm-up, four 8 min intervals with 3 min recovery, cool-down. */
function thresholdSession(overrides: Partial<PlannedWorkout> = {}): PlannedWorkout {
  return {
    id: 'pw-amir-120-1',
    athleteId: 'amir',
    day: 120,
    order: 0,
    sport: 'bike',
    title: 'Threshold 4 × 8',
    steps: [
      { id: 's1', kind: 'warmup', durationS: 900, target: { kind: 'pctFtp', low: 50, high: 75 } },
      {
        id: 'r1',
        kind: 'repeat',
        repeat: 4,
        steps: [
          { id: 'a', kind: 'interval', durationS: 480, target: { kind: 'pctFtp', low: 85, high: 89 } },
          { id: 'b', kind: 'recovery', durationS: 180, target: { kind: 'pctFtp', low: 50, high: 55 } },
        ],
      },
      { id: 'c1', kind: 'cooldown', durationS: 600, target: { kind: 'pctFtp', low: 45, high: 60 } },
    ],
    plannedDurationS: 4140,
    plannedLoad: 82,
    keySession: true,
    coachNote: 'Hold 242 W, the last rep is the hard one.',
    ...overrides,
  };
}

function easyRun(): PlannedWorkout {
  return {
    id: 'pw-amir-122-1',
    athleteId: 'amir',
    day: 122,
    order: 0,
    sport: 'run',
    title: 'Easy run',
    steps: [
      {
        id: 'e',
        kind: 'steady',
        durationS: 2700,
        target: { kind: 'pctThresholdPace', low: 75, high: 85 },
      },
    ],
    plannedDurationS: 2700,
    plannedLoad: 40,
    keySession: false,
  };
}

const TELUK: Race = {
  id: 'race-teluk',
  athleteId: 'amir',
  name: 'Teluk Half',
  day: 125,
  sport: 'triathlon',
  distancesKm: [1.9, 90, 21.1],
  priority: 'A',
};

/** Unfolds and splits a calendar into its content lines. */
function unfold(text: string): string[] {
  return text.replace(/\r\n /g, '').split('\r\n');
}

describe('durationLabel', () => {
  it('uses the spec forms', () => {
    expect(durationLabel(45)).toBe('45 s');
    expect(durationLabel(480)).toBe('8 min');
    expect(durationLabel(150)).toBe('2 min 30 s');
    expect(durationLabel(4140)).toBe('1 h 09 min');
  });
});

describe('escapeText', () => {
  it('escapes backslash, semicolon, comma and line breaks, backslash first', () => {
    expect(escapeText('a\\b;c,d\ne')).toBe('a\\\\b\\;c\\,d\\ne');
    expect(escapeText('x\r\ny')).toBe('x\\ny');
  });

  it('leaves colons and non-ASCII text alone', () => {
    expect(escapeText('Open: Laree · 5 × 3')).toBe('Open: Laree · 5 × 3');
  });
});

describe('foldLine', () => {
  it('folds an ASCII line at 75 octets, with 74 octets on each continuation', () => {
    const line = `SUMMARY:${'a'.repeat(200)}`;
    const physical = foldLine(line).split('\r\n');
    expect(octets(physical[0] ?? '')).toBe(75);
    for (const cont of physical.slice(1)) {
      expect(cont.startsWith(' ')).toBe(true);
      expect(octets(cont)).toBeLessThanOrEqual(75);
      expect(octets(cont.slice(1))).toBeLessThanOrEqual(74);
    }
    const rebuilt = physical.map((p, i) => (i === 0 ? p : p.slice(1))).join('');
    expect(rebuilt).toBe(line);
  });

  it('never splits a two-byte character', () => {
    const line = `DESCRIPTION:${'é'.repeat(80)}`;
    const physical = foldLine(line).split('\r\n');
    // 12 ASCII octets then 31 two-byte characters fill 74 octets; the 32nd would make 76.
    expect(octets(physical[0] ?? '')).toBe(74);
    expect(octets(physical[1]?.slice(1) ?? '')).toBe(74);
    for (const p of physical) {
      expect(octets(p)).toBeLessThanOrEqual(75);
      expect(() => new TextDecoder('utf-8', { fatal: true }).decode(encoder.encode(p))).not.toThrow();
    }
    expect(physical.map((p, i) => (i === 0 ? p : p.slice(1))).join('')).toBe(line);
  });

  it('never splits a four-byte character', () => {
    const line = `SUMMARY:${'𝄞'.repeat(30)}`;
    const physical = foldLine(line).split('\r\n');
    for (const p of physical) {
      expect(octets(p)).toBeLessThanOrEqual(75);
      expect(p).not.toContain('�');
    }
    expect(physical.map((p, i) => (i === 0 ? p : p.slice(1))).join('')).toBe(line);
  });

  it('returns a short line unchanged', () => {
    expect(foldLine('UID:pw-amir-120-1@laree.app')).toBe('UID:pw-amir-120-1@laree.app');
  });
});

describe('sessionIcs', () => {
  it('writes an untimed session as an all-day, transparent event with no VTIMEZONE', () => {
    const file = sessionIcs({ athlete: ATHLETE, session: thresholdSession(), thresholds: THRESHOLDS, now: NOW });
    const text = new TextDecoder().decode(file.bytes);
    const lines = unfold(text);
    expect(file.fileName).toBe('laree-amir-2026-11-10-threshold-4x8.ics');
    expect(file.mimeType).toBe('text/calendar; charset=utf-8');
    expect(lines).toContain('DTSTART;VALUE=DATE:20261110');
    expect(lines).toContain('DTEND;VALUE=DATE:20261111');
    expect(lines).toContain('TRANSP:TRANSPARENT');
    expect(lines).toContain('UID:pw-amir-120-1@laree.app');
    expect(lines).toContain('DTSTAMP:20261108T020000Z');
    expect(lines).toContain('SEQUENCE:0');
    expect(lines).not.toContain('BEGIN:VTIMEZONE');
    expect(text).toMatchSnapshot();
  });

  it('writes a timed session with TZID, VTIMEZONE and the rounded-up end', () => {
    const file = sessionIcs({
      athlete: ATHLETE,
      session: thresholdSession({ startMinute: 390 }),
      thresholds: THRESHOLDS,
      now: NOW,
    });
    const text = new TextDecoder().decode(file.bytes);
    const lines = unfold(text);
    expect(lines).toContain('BEGIN:VTIMEZONE');
    expect(lines).toContain('TZID:Asia/Kuala_Lumpur');
    expect(lines).toContain('TZNAME:+08');
    expect(lines).toContain('DTSTART;TZID=Asia/Kuala_Lumpur:20261110T063000');
    // 06:30 plus 4140 s (69 whole minutes) ends at 07:39.
    expect(lines).toContain('DTEND;TZID=Asia/Kuala_Lumpur:20261110T073900');
    expect(lines).toContain('TRANSP:OPAQUE');
    expect(text).toMatchSnapshot();
  });

  it('writes the step summary, totals and coach note into DESCRIPTION, escaped and unfolded', () => {
    const file = sessionIcs({
      athlete: ATHLETE,
      session: thresholdSession(),
      thresholds: THRESHOLDS,
      now: NOW,
      link: 'https://laree.example/#/athlete/workout/pw-amir-120-1',
    });
    const lines = unfold(new TextDecoder().decode(file.bytes));
    const description = lines.find((l) => l.startsWith('DESCRIPTION:')) ?? '';
    expect(description).toContain('15 min warm-up from 143 to 214 W');
    expect(description).toContain('4 × (8 min interval at 242-254 W + 3 min recovery at 143-157 W)');
    expect(description).toContain('10 min cool-down from 171 to 128 W');
    expect(description).toContain('1 h 09 min · Load 82 · planned at FTP 285 W');
    expect(description).toContain('Coach: Hold 242 W\\, the last rep is the hard one.');
    expect(description).toContain('Open in Laree: https://laree.example/#/athlete/workout/pw-amir-120-1');
    expect(lines).toContain('URL:https://laree.example/#/athlete/workout/pw-amir-120-1');
  });

  it('escapes commas and semicolons in SUMMARY and keeps the key session note', () => {
    const file = sessionIcs({
      athlete: ATHLETE,
      session: thresholdSession({ title: 'Hills, drills; fun' }),
      thresholds: THRESHOLDS,
      now: NOW,
    });
    const lines = unfold(new TextDecoder().decode(file.bytes));
    expect(lines).toContain('SUMMARY:Bike · Hills\\, drills\\; fun · 1 h 09 min · key session');
    expect(lines).toContain('CATEGORIES:Laree,Bike');
    expect(file.fileName).toBe('laree-amir-2026-11-10-hills-drills-fun.ics');
  });

  it('uses CRLF on every line, including the last, and no bare LF', () => {
    const file = sessionIcs({ athlete: ATHLETE, session: thresholdSession(), thresholds: THRESHOLDS, now: NOW });
    const text = new TextDecoder().decode(file.bytes);
    expect(text.endsWith('END:VCALENDAR\r\n')).toBe(true);
    expect(text.replace(/\r\n/g, '')).not.toMatch(/[\r\n]/);
  });

  it('folds every physical line to 75 octets or fewer', () => {
    const file = sessionIcs({ athlete: ATHLETE, session: thresholdSession(), thresholds: THRESHOLDS, now: NOW });
    for (const line of new TextDecoder().decode(file.bytes).split('\r\n')) {
      expect(octets(line)).toBeLessThanOrEqual(75);
    }
  });

  it('omits the threshold clause when the athlete has no FTP, and the link when none is given', () => {
    const file = sessionIcs({ athlete: ATHLETE, session: thresholdSession(), thresholds: {}, now: NOW });
    const lines = unfold(new TextDecoder().decode(file.bytes));
    const description = lines.find((l) => l.startsWith('DESCRIPTION:')) ?? '';
    expect(description).toContain('1 h 09 min · Load 82');
    expect(description).not.toContain('planned at');
    expect(lines.some((l) => l.startsWith('URL:'))).toBe(false);
  });
});

describe('weekIcs', () => {
  it('writes sessions in day order, races as all-day events, and skips rest days', () => {
    const file = weekIcs({
      athlete: ATHLETE,
      weekStart: 119,
      sessions: [easyRun(), thresholdSession({ startMinute: 390 })],
      races: [TELUK],
      thresholdsOn: () => THRESHOLDS,
      linkOf: (s) => `https://laree.example/#/athlete/workout/${s.id}`,
      now: NOW,
    });
    const text = new TextDecoder().decode(file.bytes);
    const lines = unfold(text);
    expect(file.fileName).toBe('laree-amir-week-2026-11-09.ics');
    expect(lines.filter((l) => l === 'BEGIN:VEVENT')).toHaveLength(3);
    expect(lines.indexOf('UID:pw-amir-120-1@laree.app')).toBeLessThan(lines.indexOf('UID:pw-amir-122-1@laree.app'));
    expect(lines).toContain('SUMMARY:A race · Teluk Half · 1.9 / 90 / 21.1 km');
    expect(lines).toContain('UID:race.race-teluk@laree.app');
    expect(lines).toContain('DTSTART;VALUE=DATE:20261115');
    expect(lines).toContain('BEGIN:VTIMEZONE');
    expect(lines).toContain('DTSTART;TZID=Asia/Kuala_Lumpur:20261110T063000');
    expect(lines).toContain('SUMMARY:Run · Easy run · 45 min');
    expect(lines).toContain('DESCRIPTION:45 min steady at 4:40-5:17 /km\\n45 min · Load 40 · planned at threshold pace 3:58 /km\\nOpen in Laree: https://laree.example/#/athlete/workout/pw-amir-122-1');
    expect(text).toMatchSnapshot();
  });

  it('leaves out sessions and races outside the week', () => {
    const file = weekIcs({
      athlete: ATHLETE,
      weekStart: 119,
      sessions: [thresholdSession({ id: 'pw-amir-112-1', day: 112 }), thresholdSession({ id: 'pw-amir-126-1', day: 126 })],
      races: [{ ...TELUK, day: 112 }],
      thresholdsOn: () => THRESHOLDS,
      now: NOW,
    });
    const lines = unfold(new TextDecoder().decode(file.bytes));
    expect(lines.some((l) => l === 'BEGIN:VEVENT')).toBe(false);
    expect(lines).not.toContain('BEGIN:VTIMEZONE');
  });

  it('gives each session its own revision and UID', () => {
    const file = weekIcs({
      athlete: ATHLETE,
      weekStart: 119,
      sessions: [thresholdSession()],
      races: [],
      thresholdsOn: () => THRESHOLDS,
      sequenceOf: () => 3,
      now: NOW,
    });
    const lines = unfold(new TextDecoder().decode(file.bytes));
    expect(lines).toContain('SEQUENCE:3');
    expect(lines).toContain('UID:pw-amir-120-1@laree.app');
  });
});
