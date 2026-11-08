/** The workout template library: swim, bike, run and strength. Totals come from the load engine. */
import type { LoadThresholds } from '../../domain/metrics/load.ts';
import { workoutTotals } from '../../domain/steps.ts';
import type {
  PhaseKind,
  PlainStep,
  RepeatStep,
  Sport,
  Step,
  StepKind,
  StepTarget,
  StepTargetKind,
  WorkoutTemplate,
} from '../../domain/types.ts';

const MIN = 60;

type Range = [StepTargetKind, number, number];

interface StepOpts {
  durationS?: number;
  distanceM?: number;
  target?: Range;
  note?: string;
}

function step(id: string, kind: Exclude<StepKind, 'repeat'>, o: StepOpts): PlainStep {
  const s: PlainStep = { id, kind };
  if (o.durationS !== undefined) s.durationS = o.durationS;
  if (o.distanceM !== undefined) s.distanceM = o.distanceM;
  if (o.target) {
    const t: StepTarget = { kind: o.target[0], low: o.target[1], high: o.target[2] };
    s.target = t;
  }
  if (o.note) s.note = o.note;
  return s;
}

function repeat(id: string, count: number, steps: PlainStep[]): RepeatStep {
  return { id, kind: 'repeat', repeat: count, steps };
}

/** Reference thresholds used to total the library (the library is not athlete specific). */
export const REFERENCE_THRESHOLDS: LoadThresholds = {
  ftp: 250,
  thresholdPaceSPerKm: 265,
  cssSPer100m: 108,
  lthr: 168,
  restingHr: 50,
};

interface TemplateDef {
  id: string;
  name: string;
  sport: Sport;
  description: string;
  phase?: PhaseKind;
  type: string;
  steps: Step[];
}

const pf = (low: number, high: number): Range => ['pctFtp', low, high];
const pp = (low: number, high: number): Range => ['pctThresholdPace', low, high];
const pc = (low: number, high: number): Range => ['pctCss', low, high];
const rpe = (low: number, high: number): Range => ['rpe', low, high];

const DEFS: TemplateDef[] = [
  {
    id: 'swim-endurance',
    name: 'Swim: Aerobic endurance',
    sport: 'swim',
    description: 'Easy continuous swimming to build the aerobic base. Keep the stroke long and relaxed.',
    phase: 'base',
    type: 'endurance',
    steps: [
      step('s1', 'warmup', { distanceM: 300, target: pc(80, 85) }),
      step('s2', 'steady', { distanceM: 1500, target: pc(90, 95), note: 'Breathe every three strokes.' }),
      step('s3', 'cooldown', { distanceM: 200, target: pc(75, 80) }),
    ],
  },
  {
    id: 'swim-css',
    name: 'Swim: Threshold set',
    sport: 'swim',
    description: '8 x 200 m at your critical swim speed with a short rest. Hold the same time on every repeat.',
    phase: 'build',
    type: 'threshold',
    steps: [
      step('s1', 'warmup', { distanceM: 400, target: pc(80, 85) }),
      repeat('s2', 8, [
        step('s2a', 'interval', { distanceM: 200, target: pc(98, 102) }),
        step('s2b', 'recovery', { durationS: 20 }),
      ]),
      step('s3', 'cooldown', { distanceM: 200, target: pc(75, 80) }),
    ],
  },
  {
    id: 'swim-technique',
    name: 'Swim: Technique and pull',
    sport: 'swim',
    description: 'Drills and short repeats that sharpen the catch, then a steady pull set.',
    phase: 'base',
    type: 'technique',
    steps: [
      step('s1', 'warmup', { distanceM: 300, target: pc(80, 85) }),
      repeat('s2', 6, [
        step('s2a', 'interval', { distanceM: 100, target: pc(85, 90), note: 'Drill, then swim.' }),
        step('s2b', 'recovery', { durationS: 15 }),
      ]),
      step('s3', 'steady', { distanceM: 400, target: pc(88, 92), note: 'Pull buoy.' }),
    ],
  },
  {
    id: 'bike-endurance',
    name: 'Bike: Endurance ride',
    sport: 'bike',
    description: 'A steady aerobic ride. Smooth pedalling, eat and drink on the hour.',
    phase: 'base',
    type: 'endurance',
    steps: [
      step('s1', 'warmup', { durationS: 10 * MIN, target: pf(55, 65) }),
      step('s2', 'steady', { durationS: 90 * MIN, target: pf(65, 72) }),
      step('s3', 'cooldown', { durationS: 10 * MIN, target: pf(50, 55) }),
    ],
  },
  {
    id: 'bike-long',
    name: 'Bike: Long ride',
    sport: 'bike',
    description: 'The weekly long ride. Stay aerobic, with two short efforts to practise race pace.',
    phase: 'build',
    type: 'long',
    steps: [
      step('s1', 'warmup', { durationS: 15 * MIN, target: pf(55, 65) }),
      step('s2', 'steady', { durationS: 120 * MIN, target: pf(66, 74) }),
      repeat('s3', 2, [
        step('s3a', 'interval', { durationS: 10 * MIN, target: pf(82, 88) }),
        step('s3b', 'recovery', { durationS: 5 * MIN, target: pf(50, 55) }),
      ]),
      step('s4', 'steady', { durationS: 30 * MIN, target: pf(66, 72) }),
      step('s5', 'cooldown', { durationS: 10 * MIN, target: pf(50, 55) }),
    ],
  },
  {
    id: 'bike-sweetspot',
    name: 'Bike: Sweet spot 3 x 15',
    sport: 'bike',
    description: 'Three long efforts just below threshold. Hard enough to build fitness, easy enough to repeat.',
    phase: 'build',
    type: 'sweet spot',
    steps: [
      step('s1', 'warmup', { durationS: 15 * MIN, target: pf(55, 70) }),
      repeat('s2', 3, [
        step('s2a', 'interval', { durationS: 15 * MIN, target: pf(88, 94) }),
        step('s2b', 'recovery', { durationS: 5 * MIN, target: pf(50, 55) }),
      ]),
      step('s3', 'cooldown', { durationS: 10 * MIN, target: pf(50, 55) }),
    ],
  },
  {
    id: 'bike-threshold',
    name: 'Bike: Threshold 4 x 10',
    sport: 'bike',
    description: 'Four ten-minute efforts at threshold. Aim for an even power on every repeat.',
    phase: 'build',
    type: 'threshold',
    steps: [
      step('s1', 'warmup', { durationS: 15 * MIN, target: pf(55, 70) }),
      repeat('s2', 4, [
        step('s2a', 'interval', { durationS: 10 * MIN, target: pf(98, 102) }),
        step('s2b', 'recovery', { durationS: 5 * MIN, target: pf(50, 55) }),
      ]),
      step('s3', 'cooldown', { durationS: 10 * MIN, target: pf(50, 55) }),
    ],
  },
  {
    id: 'bike-vo2',
    name: 'Bike: Short hard 5 x 4',
    sport: 'bike',
    description: 'Five four-minute efforts well above threshold, with equal rest. Sharpens top-end power.',
    phase: 'peak',
    type: 'vo2',
    steps: [
      step('s1', 'warmup', { durationS: 15 * MIN, target: pf(55, 70) }),
      repeat('s2', 5, [
        step('s2a', 'interval', { durationS: 4 * MIN, target: pf(112, 118) }),
        step('s2b', 'recovery', { durationS: 4 * MIN, target: pf(50, 55) }),
      ]),
      step('s3', 'cooldown', { durationS: 10 * MIN, target: pf(50, 55) }),
    ],
  },
  {
    id: 'bike-climbing',
    name: 'Bike: Climbing repeats',
    sport: 'bike',
    description: 'Six six-minute climbs at threshold, seated and steady. Build the legs for long gradients.',
    phase: 'build',
    type: 'climbing',
    steps: [
      step('s1', 'warmup', { durationS: 15 * MIN, target: pf(55, 70) }),
      repeat('s2', 6, [
        step('s2a', 'interval', { durationS: 6 * MIN, target: pf(95, 100) }),
        step('s2b', 'recovery', { durationS: 4 * MIN, target: pf(50, 55) }),
      ]),
      step('s3', 'cooldown', { durationS: 10 * MIN, target: pf(50, 55) }),
    ],
  },
  {
    id: 'bike-recovery',
    name: 'Bike: Recovery spin',
    sport: 'bike',
    description: 'A short, very easy spin to loosen the legs. If it feels like work, go easier.',
    phase: 'recovery',
    type: 'recovery',
    steps: [step('s1', 'steady', { durationS: 45 * MIN, target: pf(50, 56) })],
  },
  {
    id: 'run-easy',
    name: 'Run: Easy run',
    sport: 'run',
    description: 'A relaxed run you could talk through. Finish feeling you could do more.',
    phase: 'base',
    type: 'easy',
    steps: [step('s1', 'steady', { durationS: 45 * MIN, target: pp(74, 80) })],
  },
  {
    id: 'run-long',
    name: 'Run: Long run',
    sport: 'run',
    description: 'The weekly long run. Start easy, settle into a steady aerobic effort and take fluids as you go.',
    phase: 'build',
    type: 'long',
    steps: [
      step('s1', 'warmup', { durationS: 10 * MIN, target: pp(70, 76) }),
      step('s2', 'steady', { durationS: 80 * MIN, target: pp(76, 84) }),
      step('s3', 'cooldown', { durationS: 5 * MIN, target: pp(65, 70) }),
    ],
  },
  {
    id: 'run-threshold',
    name: 'Run: Threshold 3 x 10',
    sport: 'run',
    description: 'Three ten-minute efforts at threshold pace with a jog between. Controlled, not flat out.',
    phase: 'build',
    type: 'threshold',
    steps: [
      step('s1', 'warmup', { durationS: 15 * MIN, target: pp(70, 78) }),
      repeat('s2', 3, [
        step('s2a', 'interval', { durationS: 10 * MIN, target: pp(98, 102) }),
        step('s2b', 'recovery', { durationS: 3 * MIN, target: pp(60, 65) }),
      ]),
      step('s3', 'cooldown', { durationS: 10 * MIN, target: pp(65, 70) }),
    ],
  },
  {
    id: 'run-intervals',
    name: 'Run: Fast repeats 6 x 3',
    sport: 'run',
    description: 'Six three-minute repeats faster than threshold, with two minutes of jogging between.',
    phase: 'peak',
    type: 'intervals',
    steps: [
      step('s1', 'warmup', { durationS: 15 * MIN, target: pp(70, 78) }),
      repeat('s2', 6, [
        step('s2a', 'interval', { durationS: 3 * MIN, target: pp(106, 110) }),
        step('s2b', 'recovery', { durationS: 2 * MIN, target: pp(58, 62) }),
      ]),
      step('s3', 'cooldown', { durationS: 10 * MIN, target: pp(65, 70) }),
    ],
  },
  {
    id: 'run-marathon-pace',
    name: 'Run: Marathon pace block',
    sport: 'run',
    description: 'An hour at goal marathon effort, between an easy warm-up and cool-down.',
    phase: 'peak',
    type: 'race pace',
    steps: [
      step('s1', 'warmup', { durationS: 15 * MIN, target: pp(70, 78) }),
      step('s2', 'steady', { durationS: 60 * MIN, target: pp(90, 94) }),
      step('s3', 'cooldown', { durationS: 10 * MIN, target: pp(65, 70) }),
    ],
  },
  {
    id: 'run-brick',
    name: 'Run: Off the bike',
    sport: 'run',
    description: 'A short run straight after the long ride. The first minutes feel odd, so start easy.',
    phase: 'build',
    type: 'brick',
    steps: [step('s1', 'steady', { durationS: 20 * MIN, target: pp(86, 92) })],
  },
  {
    id: 'strength-foundation',
    name: 'Strength: Foundation',
    sport: 'strength',
    description: 'Squats, hinges, single-leg work and upper-body pulls. Leave two reps in reserve.',
    phase: 'base',
    type: 'strength',
    steps: [
      step('s1', 'warmup', { durationS: 10 * MIN, target: rpe(3, 3) }),
      step('s2', 'steady', { durationS: 35 * MIN, target: rpe(6, 7) }),
      step('s3', 'cooldown', { durationS: 5 * MIN, target: rpe(2, 2) }),
    ],
  },
  {
    id: 'strength-core',
    name: 'Strength: Core and mobility',
    sport: 'strength',
    description: 'Short and steady: planks, side bridges, hip mobility and calf work.',
    phase: 'base',
    type: 'mobility',
    steps: [step('s1', 'steady', { durationS: 30 * MIN, target: rpe(4, 5) })],
  },
];

function build(def: TemplateDef): WorkoutTemplate {
  const totals = workoutTotals(def.steps, def.sport, REFERENCE_THRESHOLDS);
  const t: WorkoutTemplate = {
    id: def.id,
    name: def.name,
    sport: def.sport,
    description: def.description,
    tags: def.phase ? { phase: def.phase, type: def.type } : { type: def.type },
    steps: def.steps,
    estimatedDurationS: Math.round(totals.durationS),
    estimatedLoad: Math.round(totals.load * 10) / 10,
  };
  if (totals.distanceM !== undefined) t.estimatedDistanceM = Math.round(totals.distanceM);
  return t;
}

export const TEMPLATES: WorkoutTemplate[] = DEFS.map(build);

const BY_ID = new Map(TEMPLATES.map((t) => [t.id, t]));

export function templateById(id: string): WorkoutTemplate {
  const t = BY_ID.get(id);
  if (!t) throw new Error(`Unknown template ${id}`);
  return t;
}

const roundTo = (x: number, unit: number): number => Math.round(x / unit) * unit;

/**
 * Scale a template's steps by a factor. Single steps grow or shrink in duration or distance;
 * repeat blocks change their repeat count. Ids are prefixed so they stay unique per workout.
 */
export function scaleSteps(steps: readonly Step[], factor: number, idPrefix: string): Step[] {
  return steps.map((s): Step => {
    if (s.kind === 'repeat') {
      return {
        id: `${idPrefix}-${s.id}`,
        kind: 'repeat',
        repeat: Math.max(1, Math.round(s.repeat * factor)),
        steps: s.steps.map((c) => ({ ...c, id: `${idPrefix}-${c.id}` })),
      };
    }
    const out: PlainStep = { ...s, id: `${idPrefix}-${s.id}` };
    if (s.durationS !== undefined) out.durationS = Math.max(MIN, roundTo(s.durationS * factor, MIN));
    if (s.distanceM !== undefined) out.distanceM = Math.max(100, roundTo(s.distanceM * factor, 100));
    return out;
  });
}
