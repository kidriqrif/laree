/**
 * The prototype's database: one zustand store, saved on the device under `laree:v1`.
 * Only stored items live here. Derived numbers (Fitness, Fatigue, Form, Ramp, compliance, the
 * streak, the lap) come from selectors.ts and are never stored.
 */
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { ATHLETES } from '../app/people.ts'
import { useViewer } from '../app/viewer.ts'
import { acknowledgeFlag, addFlagNote, resolveFlag, stepFlags, undoFlagAction } from '../domain/flags.ts'
import type { AthleteData, FlagLifecycle, FlagRecord, FlagsState } from '../domain/flags.ts'
import type { BadgeSeen, WeekExcuse } from '../domain/gamification.ts'
import { evaluateCompliance } from '../domain/metrics/compliance.ts'
import { derivePhases } from '../domain/plan.ts'
import type { DeriveOptions } from '../domain/plan.ts'
import { runtimeStartEpochDay, today as clockToday, weekOfDay, weekRange } from '../domain/time.ts'
import type {
  Activity,
  AthleteId,
  Badge,
  CheckIn,
  ComplianceBand,
  DayOffset,
  Flag,
  Kudos,
  PersonId,
  Phase,
  PlannedWorkout,
  Race,
  Settings,
  Threshold,
  ThresholdKind,
  ThresholdSource,
  WorkoutTemplate,
} from '../domain/types.ts'
import { defaultSettingsMap, migrate, STORE_VERSION } from './migrations.ts'
import {
  createLareeStorage,
  isSavedDataUnreadable,
  clearAiWithdrawn,
  isStorageFailed,
  noteAiWithdrawn,
  onStorageStatus,
  readAiWithdrawn,
  readAiWithdrawnSessionOnly,
  STORE_KEY,
} from './persist.ts'
import { generateSeed } from './seed/index.ts'
import type { SeedCheckIn } from './seed/index.ts'
import { earnedAwards, selectFitnessSeries } from './selectors.ts'

/** Everything that is saved. */
export interface LareeData {
  thresholds: Threshold[]
  races: Race[]
  phases: Phase[]
  templates: WorkoutTemplate[]
  planned: PlannedWorkout[]
  activities: Activity[]
  checkIns: SeedCheckIn[]
  /** Flags in list shape. They follow `flagsState`, which holds the full lifecycle records. */
  flags: Flag[]
  /** Flag lifecycle records per athlete: severity, status, notes, quiet rules. The source of truth. */
  flagsState: Record<AthleteId, FlagsState>
  kudos: Kudos[]
  badges: Badge[]
  badgeSeen: BadgeSeen
  excuses: WeekExcuse[]
  /** Days an athlete chose "Not today" on the check-in prompt. Recorded as no check-in. */
  skippedCheckIns: Array<{ athleteId: AthleteId; day: DayOffset }>
  /** The coach's note on an activity, by activity id. Only the coach writes it. */
  activityNotes: Record<string, string>
  /** Preferences and AI consent, per person. Each person's `aiConsent` is one consent layer. */
  settings: Record<PersonId, Settings>
  /** Unsaved sheet and builder drafts, by key. */
  drafts: Record<string, unknown>
  /** Small preferences: calendar range, analytics range, roster sort. */
  prefs: Record<string, string | number | boolean>
}

/** One change to the plan. A batch of these applies, and undoes, as one step. */
export type PlanChange =
  | { kind: 'add'; workout: PlannedWorkout }
  | { kind: 'update'; id: string; patch: Partial<Omit<PlannedWorkout, 'id' | 'athleteId'>> }
  | { kind: 'move'; id: string; day: DayOffset; order?: number }
  | { kind: 'delete'; id: string }

/** One undo step: how to put the plan back after a batch of changes. */
export interface UndoEntry {
  label: string
  /** The rows as they were before, for every workout the batch changed or deleted. */
  before: PlannedWorkout[]
  /** Ids of workouts the batch added; undo removes them. */
  added: string[]
  athleteIds: AthleteId[]
}

export interface AddFromTemplateOptions {
  keySession?: boolean
  coachNote?: string
  startMinute?: number
}

interface Persisted {
  data: LareeData
  anchor: number
}

export interface LareeState extends Persisted {
  /** Not saved: browser storage is unavailable or full. */
  storageFailed: boolean
  /**
   * True when the last "turn AI off" could not be saved in any form, so a reload could turn it
   * back on. Screens say so instead of the usual confirmation.
   */
  aiWithdrawalUnsaved: boolean
  /** Whose withdrawal that is ('coach' or an athlete id), so a screen warns only about its own owner. */
  aiUnsavedOwners: string[]
  /** Not saved: the banner was dismissed for this visit. */
  bannerDismissed: boolean
  /** Not saved: saved text was found but could not be used. */
  unreadable: boolean
  /** Not saved: undo covers this visit only. */
  undoStack: UndoEntry[]

  /** Save an activity, re-match the plan, re-run the flag rules and award badges. */
  logActivity: (activity: Activity) => void
  editPlanned: (id: string, patch: Partial<Omit<PlannedWorkout, 'id' | 'athleteId'>>) => void
  moveWorkout: (id: string, day: DayOffset, order?: number) => void
  /** Apply several plan changes as one undo step. Returns the ids of the workouts it added. */
  applyPlanChanges: (changes: readonly PlanChange[], label: string) => string[]
  /** Copy a library template onto a day of an athlete's plan. Returns the new id, or undefined. */
  addPlannedFromTemplate: (
    templateId: string,
    athleteId: AthleteId,
    day: DayOffset,
    options?: AddFromTemplateOptions,
  ) => string | undefined
  deletePlanned: (id: string) => void
  /** Undo the latest plan change: a move, an add, a delete or a whole batch. */
  undo: () => void
  /** Same as `undo`; kept so existing callers keep working. */
  undoMove: () => void
  saveTemplate: (template: WorkoutTemplate) => void
  /** Save the day's check-in, re-run the flag rules and award badges. */
  saveCheckIn: (checkIn: CheckIn) => void
  /** "Not today": the athlete skips the prompt. Recorded as no check-in. */
  skipCheckIn: (athleteId: AthleteId, day?: DayOffset) => void
  /** Re-run the flag rules for one athlete, or for all three. Running twice in a day is harmless. */
  refreshFlags: (athleteId?: AthleteId, day?: DayOffset) => void
  acknowledgeFlag: (flagId: string, athleteId: AthleteId, day?: DayOffset) => void
  resolveFlag: (flagId: string, athleteId: AthleteId, note?: string, day?: DayOffset) => void
  addFlagNote: (flagId: string, athleteId: AthleteId, text: string, day?: DayOffset) => void
  /**
   * Undo one acknowledge or resolve on one flag: `after` is how the action left it, `before` how
   * it was. False, with nothing changed, when the flag has changed since.
   */
  undoFlagAction: (athleteId: AthleteId, flagId: string, before: FlagLifecycle, after: FlagLifecycle, unquiet: boolean) => boolean
  sendKudos: (input: { athleteId: AthleteId; activityId?: string; message?: string }, day?: DayOffset) => void
  /** The athlete has seen these kudos (default: all of theirs). */
  markKudosSeen: (athleteId: AthleteId, kudosIds?: readonly string[]) => void
  /** Add or change the coach's note on an activity. A blank note removes it. */
  setActivityCoachNote: (activityId: string, note: string) => void
  changeThreshold: (
    athleteId: AthleteId,
    kind: ThresholdKind,
    value: number,
    effectiveFromDay: DayOffset,
    source?: Extract<ThresholdSource, 'test' | 'coachEdit'>,
  ) => void
  /** Add a race. Returns its id. */
  addRace: (race: Omit<Race, 'id'>) => string
  updateRace: (id: string, patch: Partial<Omit<Race, 'id' | 'athleteId'>>) => void
  deleteRace: (id: string) => void
  /** Replace all of an athlete's phases. */
  setPhases: (athleteId: AthleteId, phases: Phase[]) => void
  /** Derive an athlete's phases back from an A race and replace theirs. B and C races change nothing. */
  derivePhasesFromRace: (raceId: string, options?: DeriveOptions) => Phase[]
  /** The badge moment has been shown: mark these awards (default: all of the athlete's) as seen. */
  markBadgesSeen: (athleteId: AthleteId, badgeIds?: readonly string[]) => void
  /**
   * Turn one consent layer on or off. Turning on needs the owner to be the viewer: the coach can
   * never turn AI on for an athlete (docs/spec/ai.md 2.1). Turning off is open to the owner and,
   * for an athlete, to the coach (2.2). Returns false when the change is refused.
   */
  setAiConsent: (owner: PersonId, on: boolean) => boolean
  /** Preferences. AI consent has its own action. */
  setSettings: (owner: PersonId, patch: Partial<Omit<Settings, 'owner' | 'aiConsent'>>) => void
  setDraft: (key: string, value: unknown) => void
  clearDraft: (key: string) => void
  setPref: (key: string, value: string | number | boolean) => void
  dismissStorageBanner: () => void
  /** Restore the seed exactly, and send the viewer back to the role picker (IA 7.8). */
  reset: () => void
}

/** A fresh copy of the seed data, dated to the current week. */
export function freshData(): LareeData {
  const s = generateSeed()
  const copy = structuredClone({
    thresholds: s.thresholds,
    races: s.races,
    phases: s.phases,
    templates: s.templates,
    planned: s.planned,
    activities: s.activities,
    checkIns: s.checkIns,
    flags: s.flags,
    flagsState: s.flagsState,
    kudos: s.kudos,
    badges: s.badges,
    badgeSeen: s.badgeSeen,
    excuses: s.excuses,
  })
  return { ...copy, skippedCheckIns: [], activityNotes: {}, settings: defaultSettingsMap(), drafts: {}, prefs: {} }
}

const ARRAYS = [
  'thresholds', 'races', 'phases', 'templates', 'planned', 'activities',
  'checkIns', 'flags', 'kudos', 'badges', 'excuses',
] as const

function isUsable(d: unknown): d is LareeData {
  if (typeof d !== 'object' || d === null) return false
  const r = d as Record<string, unknown>
  if (!ARRAYS.every((k) => Array.isArray(r[k]))) return false
  for (const k of ['flagsState', 'badgeSeen', 'settings'] as const) {
    if (typeof r[k] !== 'object' || r[k] === null) return false
  }
  const fs = r['flagsState'] as Record<string, unknown>
  return ['amir', 'danial', 'irfan'].every((id) => typeof fs[id] === 'object' && fs[id] !== null)
}

const ATHLETE_IDS: readonly AthleteId[] = ['amir', 'danial', 'irfan']

const RESOLUTION_NOTE: Record<string, string> = {
  auto: 'Back inside the usual range.',
  'week-ended': 'The week ended.',
  'no-data': 'No check-ins to judge by.',
}
const CITES_ACTIVITIES = new Set(['ramp-high', 'form-deep', 'key-missed', 'mood-low-under-load', 'soreness-high'])

/** A lifecycle record in list shape. An existing row keeps the items it cites. */
function flagRow(rec: FlagRecord, data: LareeData, existing: Flag | undefined): Flag {
  const athleteId = rec.athleteId as AthleteId
  const day = rec.openedDay
  const row: Flag = {
    id: rec.id,
    athleteId,
    ruleId: rec.ruleId,
    raisedDay: rec.openedDay,
    values: rec.valuesLatest,
    explanation: rec.explanation,
    state: rec.status,
    citedCheckInIds:
      existing?.citedCheckInIds ??
      data.checkIns.filter((c) => c.athleteId === athleteId && c.day >= day - 2 && c.day <= day).map((c) => c.id),
    citedActivityIds:
      existing?.citedActivityIds ??
      (CITES_ACTIVITIES.has(rec.ruleId)
        ? data.activities.filter((a) => a.athleteId === athleteId && a.day >= day - 6 && a.day <= day).map((a) => a.id)
        : []),
  }
  const note = rec.notes[rec.notes.length - 1]?.text ?? (rec.resolution ? RESOLUTION_NOTE[rec.resolution] : undefined)
  if (note && rec.status !== 'open') row.resolutionNote = note
  return row
}

/** Owners whose consent was turned off but not saved anywhere yet. Kept out of persisted state. */
const unsavedWithdrawals = new Set<string>()

/**
 * Consent withdrawn while the main save was failing stays withdrawn after a reload.
 * Also says which owners the notes had to turn off: the main save still holds their old choice.
 */
function withAiWithdrawals(data: LareeData): { data: LareeData; withdrawn: PersonId[] } {
  const owners = readAiWithdrawn().filter((o): o is PersonId => o in data.settings && data.settings[o as PersonId].aiConsent)
  if (owners.length === 0) return { data, withdrawn: [] }
  const settings = { ...data.settings }
  for (const o of owners) settings[o] = { ...settings[o], aiConsent: false }
  return { data: { ...data, settings }, withdrawn: owners }
}

/** Flags in list shape follow their lifecycle records, including records the rules just opened. */
function syncFlags(data: LareeData, athleteId: AthleteId, state: FlagsState): Pick<LareeData, 'flags' | 'flagsState'> {
  const existing = new Map(data.flags.map((f) => [f.id, f]))
  const rows = state.flags.map((rec) => flagRow(rec, data, existing.get(rec.id)))
  const byId = new Map(rows.map((r) => [r.id, r]))
  // Rows keep their place in the list; rows the rules just opened go at the end.
  const kept = data.flags.map((f) => (f.athleteId === athleteId ? (byId.get(f.id) ?? f) : f))
  return {
    flags: [...kept, ...rows.filter((r) => !existing.has(r.id))],
    flagsState: { ...data.flagsState, [athleteId]: state },
  }
}

/** Run the rules for one athlete on one day, the way the seed did, and return the new flag data. */
function runFlags(data: LareeData, athleteId: AthleteId, day: DayOffset): Pick<LareeData, 'flags' | 'flagsState'> {
  const { firstDay, lastDay } = weekRange(weekOfDay(day))
  const planned = data.planned.filter((w) => w.athleteId === athleteId)
  const weekPlan = planned.filter((w) => w.day >= firstDay && w.day <= lastDay)
  const acts = data.activities.filter((a) => a.athleteId === athleteId)
  const weekActs = acts.filter((a) => a.day >= firstDay && a.day <= lastDay && a.day <= day)
  const ev = evaluateCompliance(weekPlan, weekActs, day)
  const input: AthleteData = {
    name: ATHLETES.find((a) => a.id === athleteId)?.name ?? athleteId,
    checkIns: data.checkIns.filter((c) => c.athleteId === athleteId && c.day <= day),
    fitness: selectFitnessSeries(data, athleteId, day).filter((p) => p.day <= day),
    planned: planned.map((w) => ({
      id: w.id,
      athleteId: w.athleteId,
      day: w.day,
      sport: w.sport,
      title: w.title,
      keySession: w.keySession,
    })),
    evaluations: ev.planned.map((e) => ({ plannedId: e.plannedId, band: e.band })),
  }
  return syncFlags(data, athleteId, stepFlags(athleteId, day, input, data.flagsState[athleteId]))
}

/** Re-match plans and activities for one athlete so activities carry their plan link and band. */
function rematch(data: LareeData, athleteId: AthleteId, today: DayOffset): Activity[] {
  const planned = data.planned.filter((w) => w.athleteId === athleteId)
  const mine = data.activities.filter((a) => a.athleteId === athleteId)
  const ev = evaluateCompliance(planned, mine, today)
  const link = new Map<string, { plannedId: string; band?: ComplianceBand }>()
  for (const e of ev.planned) {
    if (e.status === 'matched' && e.activityId !== undefined) {
      const entry: { plannedId: string; band?: ComplianceBand } = { plannedId: e.plannedId }
      if (e.band) entry.band = e.band
      link.set(e.activityId, entry)
    }
  }
  const unplanned = new Set(ev.unplannedActivityIds)
  return data.activities.map((a) => {
    if (a.athleteId !== athleteId) return a
    const { matchedWorkoutId: _m, complianceBand: _c, ...base } = a
    const l = link.get(a.id)
    if (l) return { ...base, matchedWorkoutId: l.plannedId, ...(l.band ? { complianceBand: l.band } : {}) }
    return unplanned.has(a.id) ? { ...base, complianceBand: 'unplanned' as const } : base
  })
}

/** Add rows for awards earned since the last look. Awards are never taken back. */
function awardBadges(data: LareeData, athleteId: AthleteId, today: DayOffset): Badge[] {
  const have = new Set(data.badges.map((b) => b.id))
  const fresh = earnedAwards(data, athleteId, today)
    .filter((a) => !have.has(a.id))
    .map((a): Badge => ({ id: a.id, athleteId: a.athleteId, key: a.key, earnedDay: a.earnedDay, sourceItemId: a.sourceItemId }))
  return fresh.length === 0 ? data.badges : [...data.badges, ...fresh]
}

/** Apply a batch to a working list of workouts. Returns the new list, and what undo needs. */
const sameValue = (a: unknown, b: unknown): boolean => a === b || JSON.stringify(a) === JSON.stringify(b)

function applyChanges(planned: readonly PlannedWorkout[], changes: readonly PlanChange[]) {
  let list = planned.slice()
  const before = new Map<string, PlannedWorkout>()
  const added: string[] = []
  const athletes = new Set<AthleteId>()
  for (const c of changes) {
    if (c.kind === 'add') {
      if (list.some((w) => w.id === c.workout.id)) continue
      list.push(c.workout)
      added.push(c.workout.id)
      athletes.add(c.workout.athleteId)
      continue
    }
    const w = list.find((p) => p.id === c.id)
    if (!w) continue
    // A change that leaves the session as it is (a save with no edits, a move to where it
    // already sits) is not a change: it records nothing, so it pushes no undo step.
    if (c.kind === 'update' && Object.entries(c.patch).every(([k, v]) => sameValue(w[k as keyof PlannedWorkout], v))) continue
    if (c.kind === 'move' && c.day === w.day && (c.order === undefined || c.order === w.order)) continue
    athletes.add(w.athleteId)
    if (!before.has(w.id) && !added.includes(w.id)) before.set(w.id, w)
    if (c.kind === 'delete') list = list.filter((p) => p.id !== c.id)
    else if (c.kind === 'update') list = list.map((p) => (p.id === c.id ? { ...p, ...c.patch } : p))
    else {
      const order =
        c.order ??
        list.filter((p) => p.athleteId === w.athleteId && p.day === c.day && p.id !== c.id).reduce((m, p) => Math.max(m, p.order + 1), 0)
      list = list.map((p) => (p.id === c.id ? { ...p, day: c.day, order } : p))
    }
  }
  return { list, before: [...before.values()], added, athleteIds: [...athletes] }
}

export const useLaree = create<LareeState>()(
  persist(
    (set, get) => {
      const patch = (fn: (d: LareeData) => Partial<LareeData>) => set((s) => ({ data: { ...s.data, ...fn(s.data) } }))
      /** After activities, check-ins or the plan change: re-match, re-run the flag rules, award badges. */
      const settle = (athleteId: AthleteId, evalDay: DayOffset = clockToday()) => {
        patch((d) => ({ activities: rematch(d, athleteId, Math.max(clockToday(), evalDay)) }))
        patch((d) => runFlags(d, athleteId, clockToday()))
        patch((d) => ({ badges: awardBadges(d, athleteId, clockToday()) }))
      }
      const applyBatch = (changes: readonly PlanChange[], label: string): string[] => {
        const r = applyChanges(get().data.planned, changes)
        if (r.before.length === 0 && r.added.length === 0) return []
        patch(() => ({ planned: r.list }))
        r.athleteIds.forEach((id) => settle(id))
        set((s) => ({
          undoStack: [...s.undoStack, { label, before: r.before, added: r.added, athleteIds: r.athleteIds }],
        }))
        return r.added
      }
      return {
        data: freshData(),
        anchor: runtimeStartEpochDay(),
        storageFailed: false,
        aiWithdrawalUnsaved: false,
        aiUnsavedOwners: [],
        bannerDismissed: false,
        unreadable: isSavedDataUnreadable(),
        undoStack: [],

        logActivity: (activity) => {
          patch((d) => ({ activities: [...d.activities.filter((a) => a.id !== activity.id), activity] }))
          settle(activity.athleteId, activity.day)
        },
        editPlanned: (id, change) => {
          patch((d) => ({ planned: d.planned.map((w) => (w.id === id ? { ...w, ...change } : w)) }))
          const w = get().data.planned.find((p) => p.id === id)
          if (w) settle(w.athleteId, w.day)
        },
        moveWorkout: (id, day, order) => {
          const w = get().data.planned.find((p) => p.id === id)
          if (!w) return
          applyBatch([{ kind: 'move', id, day, ...(order !== undefined ? { order } : {}) }], `Moved ${w.title}`)
        },
        applyPlanChanges: (changes, label) => applyBatch(changes, label),
        addPlannedFromTemplate: (templateId, athleteId, day, options = {}) => {
          const t = get().data.templates.find((x) => x.id === templateId)
          if (!t) return undefined
          const planned = get().data.planned
          const same = planned.filter((p) => p.athleteId === athleteId && p.day === day)
          let n = same.length + 1
          let id = `pw-${athleteId}-${day}-${n}`
          while (planned.some((p) => p.id === id)) id = `pw-${athleteId}-${day}-${++n}`
          const w: PlannedWorkout = {
            id,
            athleteId,
            day,
            order: same.reduce((m, p) => Math.max(m, p.order + 1), 0),
            sport: t.sport,
            title: t.name,
            steps: structuredClone(t.steps),
            plannedDurationS: t.estimatedDurationS,
            plannedLoad: t.estimatedLoad,
            keySession: options.keySession ?? false,
            sourceTemplateId: t.id,
          }
          if (t.estimatedDistanceM !== undefined) w.plannedDistanceM = t.estimatedDistanceM
          if (options.startMinute !== undefined) w.startMinute = options.startMinute
          if (options.coachNote) w.coachNote = options.coachNote
          applyBatch([{ kind: 'add', workout: w }], `Added ${t.name}`)
          return id
        },
        deletePlanned: (id) => {
          const w = get().data.planned.find((p) => p.id === id)
          if (w) applyBatch([{ kind: 'delete', id }], `Removed ${w.title}`)
        },
        undo: () => {
          const entry = get().undoStack[get().undoStack.length - 1]
          if (!entry) return
          set((s) => ({ undoStack: s.undoStack.slice(0, -1) }))
          patch((d) => {
            const gone = new Set(entry.added)
            const restored = new Map(entry.before.map((w) => [w.id, w]))
            const kept = d.planned.filter((w) => !gone.has(w.id)).map((w) => restored.get(w.id) ?? w)
            const present = new Set(kept.map((w) => w.id))
            return { planned: [...kept, ...entry.before.filter((w) => !present.has(w.id))] }
          })
          entry.athleteIds.forEach((id) => settle(id))
        },
        undoMove: () => get().undo(),
        saveTemplate: (template) =>
          patch((d) => ({
            templates: d.templates.some((t) => t.id === template.id)
              ? d.templates.map((t) => (t.id === template.id ? template : t))
              : [...d.templates, template],
          })),
        saveCheckIn: (checkIn) => {
          patch((d) => ({
            // One check-in per athlete per day: saving again replaces it.
            checkIns: [
              ...d.checkIns.filter((c) => !(c.athleteId === checkIn.athleteId && c.day === checkIn.day)),
              checkIn,
            ].toSorted((a, b) => a.day - b.day),
            skippedCheckIns: d.skippedCheckIns.filter((s) => !(s.athleteId === checkIn.athleteId && s.day === checkIn.day)),
          }))
          settle(checkIn.athleteId)
        },
        skipCheckIn: (athleteId, day = clockToday()) =>
          patch((d) =>
            d.checkIns.some((c) => c.athleteId === athleteId && c.day === day) ||
            d.skippedCheckIns.some((s) => s.athleteId === athleteId && s.day === day)
              ? {}
              : { skippedCheckIns: [...d.skippedCheckIns, { athleteId, day }] },
          ),
        refreshFlags: (athleteId, day = clockToday()) => {
          for (const id of athleteId ? [athleteId] : ATHLETE_IDS) patch((d) => runFlags(d, id, day))
        },
        acknowledgeFlag: (flagId, athleteId, day = clockToday()) =>
          patch((d) => syncFlags(d, athleteId, acknowledgeFlag(d.flagsState[athleteId], flagId, day))),
        resolveFlag: (flagId, athleteId, note, day = clockToday()) =>
          patch((d) => syncFlags(d, athleteId, resolveFlag(d.flagsState[athleteId], flagId, day, note))),
        addFlagNote: (flagId, athleteId, text, day = clockToday()) =>
          patch((d) => syncFlags(d, athleteId, addFlagNote(d.flagsState[athleteId], flagId, day, text))),
        undoFlagAction: (athleteId, flagId, before, after, unquiet) => {
          const next = undoFlagAction(get().data.flagsState[athleteId], flagId, before, after, unquiet)
          if (!next) return false
          // Through syncFlags, so the list rows and the lifecycle records never disagree.
          patch((d) => syncFlags(d, athleteId, next))
          return true
        },
        sendKudos: (input, day = clockToday()) => {
          patch((d) => {
            const n = d.kudos.filter((k) => k.athleteId === input.athleteId).length + 1
            const k: Kudos = { id: `kudos-${input.athleteId}-${day}-${n}`, athleteId: input.athleteId, day, seenByAthlete: false }
            if (input.activityId !== undefined) k.activityId = input.activityId
            if (input.message !== undefined && input.message.trim() !== '') k.message = input.message.trim()
            return { kudos: [...d.kudos, k] }
          })
          patch((d) => ({ badges: awardBadges(d, input.athleteId, clockToday()) }))
        },
        markKudosSeen: (athleteId, kudosIds) =>
          patch((d) => ({
            kudos: d.kudos.map((k) =>
              k.athleteId === athleteId && !k.seenByAthlete && (!kudosIds || kudosIds.includes(k.id))
                ? { ...k, seenByAthlete: true }
                : k,
            ),
          })),
        setActivityCoachNote: (activityId, note) =>
          patch((d) => {
            const text = note.trim()
            const { [activityId]: _old, ...rest } = d.activityNotes
            return { activityNotes: text ? { ...rest, [activityId]: text } : rest }
          }),
        changeThreshold: (athleteId, kind, value, effectiveFromDay, source = 'coachEdit') => {
          patch((d) => ({
            // History is kept: a new row, except that the same kind on the same day is replaced.
            thresholds: [
              ...d.thresholds.filter(
                (t) => !(t.athleteId === athleteId && t.kind === kind && t.effectiveFromDay === effectiveFromDay),
              ),
              { athleteId, kind, value, effectiveFromDay, source },
            ],
          }))
          patch((d) => ({ badges: awardBadges(d, athleteId, clockToday()) }))
        },
        addRace: (race) => {
          const taken = new Set(get().data.races.map((r) => r.id))
          let n = get().data.races.filter((r) => r.athleteId === race.athleteId).length + 1
          let id = `race-${race.athleteId}-${n}`
          while (taken.has(id)) id = `race-${race.athleteId}-${++n}`
          patch((d) => ({ races: [...d.races, { ...race, id }] }))
          return id
        },
        updateRace: (id, change) => patch((d) => ({ races: d.races.map((r) => (r.id === id ? { ...r, ...change } : r)) })),
        deleteRace: (id) => patch((d) => ({ races: d.races.filter((r) => r.id !== id) })),
        setPhases: (athleteId, phases) =>
          patch((d) => ({ phases: [...d.phases.filter((p) => p.athleteId !== athleteId), ...phases] })),
        derivePhasesFromRace: (raceId, options) => {
          const race = get().data.races.find((r) => r.id === raceId)
          if (!race) return []
          const derived = derivePhases(race, options).map((p) => ({
            ...p,
            athleteId: race.athleteId,
            id: `${race.athleteId}-${p.kind}-${p.firstWeek}`,
          }))
          if (derived.length > 0) get().setPhases(race.athleteId, derived)
          return derived
        },
        markBadgesSeen: (athleteId, badgeIds) =>
          patch((d) => {
            const ids = badgeIds ?? d.badges.filter((b) => b.athleteId === athleteId).map((b) => b.id)
            const seen = new Set(d.badgeSeen[athleteId] ?? [])
            ids.forEach((id) => seen.add(id))
            return { badgeSeen: { ...d.badgeSeen, [athleteId]: [...seen] } }
          }),
        setAiConsent: (owner, on) => {
          const viewer = useViewer.getState()
          const isOwnerViewing =
            owner === 'coach' ? viewer.role === 'coach' : viewer.role === 'athlete' && viewer.athleteId === owner
          // Agreeing is personal. Withdrawing is open to either person (docs/spec/ai.md 2.2).
          if (on && !isOwnerViewing) return false
          if (!on && !isOwnerViewing && !(viewer.role === 'coach' && owner !== 'coach')) return false
          patch((d) => ({ settings: { ...d.settings, [owner]: { ...d.settings[owner], aiConsent: on } } }))
          // The save above is synchronous, so its outcome is known here. A withdrawal that did not
          // reach the main save is written as a small note of its own, which loading applies.
          // Each owner is tracked on their own: the flag stays up until every withdrawal is saved.
          if (!isStorageFailed()) {
            // The main save holds every owner's current choice.
            unsavedWithdrawals.clear()
            noteAiWithdrawn(owner, false)
          } else if (on) {
            unsavedWithdrawals.delete(owner)
            noteAiWithdrawn(owner, false)
          } else if (noteAiWithdrawn(owner, true) === 'local') unsavedWithdrawals.delete(owner)
          // A note kept only for this browser session still counts as unsaved: closing the browser drops it.
          else unsavedWithdrawals.add(owner)
          const owners = [...unsavedWithdrawals]
          const prev = get().aiUnsavedOwners
          if (owners.length !== prev.length || owners.some((o) => !prev.includes(o)))
            set({ aiUnsavedOwners: owners, aiWithdrawalUnsaved: owners.length > 0 })
          return true
        },
        setSettings: (owner, change) =>
          patch((d) => ({ settings: { ...d.settings, [owner]: { ...d.settings[owner], ...change } } })),
        setDraft: (key, value) => patch((d) => ({ drafts: { ...d.drafts, [key]: value } })),
        clearDraft: (key) =>
          patch((d) => {
            const { [key]: _gone, ...rest } = d.drafts
            return { drafts: rest }
          }),
        setPref: (key, value) => patch((d) => ({ prefs: { ...d.prefs, [key]: value } })),
        dismissStorageBanner: () => set({ bannerDismissed: true }),
        reset: () => {
          unsavedWithdrawals.clear()
          set({ data: freshData(), anchor: runtimeStartEpochDay(), undoStack: [], unreadable: false, aiWithdrawalUnsaved: false, aiUnsavedOwners: [] })
          // Reset clears every consent choice, the withdrawal note included (docs/spec/ai.md 4).
          // Only once the fresh data is saved: if that save failed, a reload brings the old copy
          // back, and the note must still be there to keep AI off.
          if (!isStorageFailed()) clearAiWithdrawn()
          // IA 7.8: after a reset the switcher returns to the role picker state.
          useViewer.setState({ role: 'athlete', athleteId: 'amir', coachAthleteId: 'amir', chosen: false })
        },
      }
    },
    {
      name: STORE_KEY,
      version: STORE_VERSION,
      storage: createLareeStorage<Persisted>(),
      partialize: (s) => ({ data: s.data, anchor: s.anchor }),
      migrate: (persisted, version): Persisted => {
        const m = migrate(persisted, version)
        // Unusable input becomes an unusable payload, which merge reports as unreadable.
        return (m ?? { data: null, anchor: -1 }) as unknown as Persisted
      },
      merge: (persisted, current) => {
        const p = persisted as Partial<Persisted> | null | undefined
        if (!p) return current
        if (!isUsable(p.data)) return { ...current, unreadable: true }
        // Day offsets count from the Monday 16 weeks before this week. A saved copy from an
        // earlier week would sit on the wrong dates, so a new week starts from a fresh seed.
        if (p.anchor !== current.anchor) return current
        const { data, withdrawn } = withAiWithdrawals({ ...current.data, ...p.data })
        // A withdrawal the main save missed and only the session note holds is still unsaved after a
        // reload (docs/spec/ai.md 4.1). A local note lasts, so it counts as saved.
        const sessionOnly = readAiWithdrawnSessionOnly()
        const unsaved = withdrawn.filter((o) => sessionOnly.includes(o))
        if (unsaved.length === 0) return { ...current, data }
        for (const o of unsaved) unsavedWithdrawals.add(o)
        return { ...current, data, aiUnsavedOwners: [...unsavedWithdrawals], aiWithdrawalUnsaved: true }
      },
    },
  ),
)

// Mirror the storage status into the store so screens can read it as a flag.
onStorageStatus((failed) => {
  if (useLaree.getState().storageFailed !== failed) useLaree.setState({ storageFailed: failed })
})
