/** Shared domain types for Laree. Pure types: no runtime code. */

export type AthleteId = 'amir' | 'danial' | 'irfan';
export type CoachId = 'coach';
export type PersonId = AthleteId | CoachId;

/** Whole days since the runtime start (Monday 00:00 of history week 1). */
export type DayOffset = number;

export type Sport = 'swim' | 'bike' | 'run' | 'strength' | 'other';
export type LoadMethod = 'power' | 'pace' | 'swim' | 'heartRate' | 'effort' | 'duration';
export type Confidence = 'high' | 'medium' | 'low';

export interface LoadResult {
  /** Full precision; the UI rounds. */
  load: number;
  method: LoadMethod;
  confidence: Confidence;
  /** Power, pace and swim methods only. */
  intensity: number | null;
  /** Power method only. */
  weightedPowerW?: number;
  /** Pace method only. */
  gradedSpeedMps?: number;
}

export interface Baselines {
  restingHr: number;
  hrvMs: number;
}

export interface Athlete {
  id: AthleteId;
  name: string;
  sports: Sport[];
  weightKg?: number;
  baselines: Baselines;
}

export interface Coach {
  id: CoachId;
  displayName: string;
}

export type RacePriority = 'A' | 'B' | 'C';

export interface Race {
  id: string;
  athleteId: AthleteId;
  name: string;
  day: DayOffset;
  sport: Sport | 'triathlon';
  /** Leg distances in km, for example [1.9, 90, 21.1]. */
  distancesKm: number[];
  climbingM?: number;
  priority: RacePriority;
  /** Goal time in seconds. */
  goalTimeS?: number;
}

export type PhaseKind = 'base' | 'build' | 'peak' | 'taper' | 'race' | 'recovery';

export interface WeeklyTarget {
  week: number;
  loadTarget: number;
  hoursTarget: number;
  downWeek?: boolean;
}

export interface Phase {
  id: string;
  athleteId: AthleteId;
  kind: PhaseKind;
  firstWeek: number;
  lastWeek: number;
  weeklyTargets: WeeklyTarget[];
}

export type StepKind = 'warmup' | 'steady' | 'interval' | 'recovery' | 'cooldown' | 'repeat';

export type StepTargetKind = 'pctFtp' | 'pctThresholdPace' | 'pctLthr' | 'pctCss' | 'rpe';

/** A low-high range. For rpe the values are 1-10; otherwise integer percentages. */
export interface StepTarget {
  kind: StepTargetKind;
  low: number;
  high: number;
}

interface StepBase {
  id: string;
  /** Duration in seconds or distance in metres; at least one is set. */
  durationS?: number;
  distanceM?: number;
  target?: StepTarget;
  note?: string;
}

export interface PlainStep extends StepBase {
  kind: Exclude<StepKind, 'repeat'>;
}

/** Repeat blocks hold plain steps only: they never nest. */
export interface RepeatStep {
  id: string;
  kind: 'repeat';
  repeat: number;
  steps: PlainStep[];
}

export type Step = PlainStep | RepeatStep;

export interface PlannedWorkout {
  id: string;
  athleteId: AthleteId;
  day: DayOffset;
  /** Order within the day. */
  order: number;
  startMinute?: number;
  sport: Sport;
  title: string;
  steps: Step[];
  plannedDurationS: number;
  plannedDistanceM?: number;
  plannedLoad: number;
  keySession: boolean;
  coachNote?: string;
  sourceTemplateId?: string;
}

export interface WorkoutTemplate {
  id: string;
  name: string;
  sport: Sport;
  description: string;
  tags: { phase?: PhaseKind; type?: string };
  steps: Step[];
  estimatedDurationS: number;
  estimatedDistanceM?: number;
  estimatedLoad: number;
}

export type ActivitySource = 'file' | 'manual' | 'simulatedDevice';

export type ComplianceBand =
  | 'onPlan'
  | 'short'
  | 'under'
  | 'over'
  | 'wellOver'
  | 'missed'
  | 'unplanned';

export interface ActivitySummary {
  durationS: number;
  movingTimeS: number;
  distanceM?: number;
  elevationGainM?: number;
  avgHr?: number;
  maxHr?: number;
  avgPowerW?: number;
  weightedPowerW?: number;
  intensity?: number;
  /** Average speed in m/s; pace is always stored as speed. */
  avgSpeedMps?: number;
  cadence?: number;
}

export interface Activity {
  id: string;
  athleteId: AthleteId;
  day: DayOffset;
  /** Minutes after local midnight. */
  startMinute: number;
  sport: Sport;
  title: string;
  source: ActivitySource;
  summary: ActivitySummary;
  load: LoadResult;
  rpe?: number;
  notes?: string;
  matchedWorkoutId?: string;
  complianceBand?: ComplianceBand;
}

export interface CheckIn {
  id: string;
  athleteId: AthleteId;
  day: DayOffset;
  sleepHours: number;
  /** 1-5. */
  soreness: number;
  /** 1-5. */
  mood: number;
  restingHr?: number;
  hrvMs?: number;
  note?: string;
}

export type FlagState = 'open' | 'acknowledged' | 'resolved';

export interface Flag {
  id: string;
  athleteId: AthleteId;
  ruleId: string;
  raisedDay: DayOffset;
  values: Record<string, number | string>;
  explanation: string;
  state: FlagState;
  resolutionNote?: string;
  citedCheckInIds: string[];
  citedActivityIds: string[];
}

export interface Kudos {
  id: string;
  athleteId: AthleteId;
  activityId?: string;
  message?: string;
  day: DayOffset;
  seenByAthlete: boolean;
}

export interface Badge {
  id: string;
  athleteId: AthleteId;
  /** Key from the catalogue in docs/spec/gamification.md. */
  key: string;
  earnedDay: DayOffset;
  sourceItemId?: string;
}

export type ThresholdKind = 'ftp' | 'thresholdPace' | 'css' | 'lthr' | 'restingHr';
export type ThresholdSource = 'test' | 'coachEdit' | 'seed';

export interface Threshold {
  athleteId: AthleteId;
  kind: ThresholdKind;
  /** W for FTP, m/s for threshold pace and CSS (pace is stored as speed), bpm otherwise. */
  value: number;
  effectiveFromDay: DayOffset;
  source: ThresholdSource;
}

export type UnitSystem = 'metric';
export type ThemePreference = 'light' | 'dark' | 'system';

export interface Settings {
  owner: PersonId;
  units: UnitSystem;
  theme: ThemePreference;
  aiConsent: boolean;
  /** Coach only. */
  singleKeyShortcuts?: boolean;
}
