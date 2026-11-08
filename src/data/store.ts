/**
 * The prototype's database: one zustand store, saved on the device under `laree:v1`.
 * Only stored items live here. Derived numbers (Fitness, Fatigue, Form, Ramp, compliance, the
 * streak, the lap) come from selectors.ts and are never stored.
 */
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { useViewer } from '../app/viewer.ts'
import { acknowledgeFlag, addFlagNote, resolveFlag } from '../domain/flags.ts'
import type { FlagsState } from '../domain/flags.ts'
import type { BadgeSeen, WeekExcuse } from '../domain/gamification.ts'
import { evaluateCompliance } from '../domain/metrics/compliance.ts'
import { runtimeStartEpochDay, today as clockToday } from '../domain/time.ts'
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
import { createLareeStorage, isSavedDataUnreadable, onStorageStatus, STORE_KEY } from './persist.ts'
import { generateSeed } from './seed/index.ts'
import type { SeedCheckIn } from './seed/index.ts'

/** Everything that is saved. */
export interface LareeData {
  thresholds: Threshold[]
  races: Race[]
  phases: Phase[]
  templates: WorkoutTemplate[]
  planned: PlannedWorkout[]
  activities: Activity[]
  checkIns: SeedCheckIn[]
  flags: Flag[]
  flagsState: Record<AthleteId, FlagsState>
  kudos: Kudos[]
  badges: Badge[]
  badgeSeen: BadgeSeen
  excuses: WeekExcuse[]
  /** Preferences and AI consent, per person. Each person's `aiConsent` is one consent layer. */
  settings: Record<PersonId, Settings>
  /** Unsaved sheet and builder drafts, by key. */
  drafts: Record<string, unknown>
  /** Small preferences: calendar range, analytics range, roster sort. */
  prefs: Record<string, string | number | boolean>
}

export interface UndoEntry {
  label: string
  /** Puts the workout back where it was. */
  restore: Pick<PlannedWorkout, 'id' | 'day' | 'order' | 'startMinute'>
}

interface Persisted {
  data: LareeData
  anchor: number
}

export interface LareeState extends Persisted {
  /** Not saved: browser storage is unavailable or full. */
  storageFailed: boolean
  /** Not saved: the banner was dismissed for this visit. */
  bannerDismissed: boolean
  /** Not saved: saved text was found but could not be used. */
  unreadable: boolean
  /** Not saved: undo covers this visit only. */
  undoStack: UndoEntry[]

  logActivity: (activity: Activity) => void
  editPlanned: (id: string, patch: Partial<Omit<PlannedWorkout, 'id' | 'athleteId'>>) => void
  moveWorkout: (id: string, day: DayOffset, order?: number) => void
  undoMove: () => void
  saveTemplate: (template: WorkoutTemplate) => void
  saveCheckIn: (checkIn: CheckIn) => void
  acknowledgeFlag: (flagId: string, athleteId: AthleteId, day?: DayOffset) => void
  resolveFlag: (flagId: string, athleteId: AthleteId, note?: string, day?: DayOffset) => void
  addFlagNote: (flagId: string, athleteId: AthleteId, text: string, day?: DayOffset) => void
  sendKudos: (input: { athleteId: AthleteId; activityId?: string; message?: string }, day?: DayOffset) => void
  changeThreshold: (
    athleteId: AthleteId,
    kind: ThresholdKind,
    value: number,
    effectiveFromDay: DayOffset,
    source?: Extract<ThresholdSource, 'test' | 'coachEdit'>,
  ) => void
  /** Turn one consent layer on or off: a person's own `aiConsent`. */
  setAiConsent: (owner: PersonId, on: boolean) => void
  setSettings: (owner: PersonId, patch: Partial<Omit<Settings, 'owner'>>) => void
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
  return { ...copy, settings: defaultSettingsMap(), drafts: {}, prefs: {} }
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

/** Flags in list shape follow their lifecycle records. */
function syncFlags(data: LareeData, athleteId: AthleteId, state: FlagsState): Pick<LareeData, 'flags' | 'flagsState'> {
  const byId = new Map(state.flags.map((f) => [f.id, f]))
  const flags = data.flags.map((f) => {
    const rec = byId.get(f.id)
    if (!rec || f.athleteId !== athleteId) return f
    const next: Flag = { ...f, state: rec.status, values: rec.valuesLatest, explanation: rec.explanation }
    const note = rec.notes[rec.notes.length - 1]?.text
    if (note && rec.status !== 'open') next.resolutionNote = note
    return next
  })
  return { flags, flagsState: { ...data.flagsState, [athleteId]: state } }
}

/** Re-run matching for one athlete so activities carry their plan link and band. */
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

export const useLaree = create<LareeState>()(
  persist(
    (set, get) => {
      const patch = (fn: (d: LareeData) => Partial<LareeData>) => set((s) => ({ data: { ...s.data, ...fn(s.data) } }))
      const rematchFor = (athleteId: AthleteId, day: DayOffset) =>
        patch((d) => ({ activities: rematch(d, athleteId, Math.max(clockToday(), day)) }))
      return {
        data: freshData(),
        anchor: runtimeStartEpochDay(),
        storageFailed: false,
        bannerDismissed: false,
        unreadable: isSavedDataUnreadable(),
        undoStack: [],

        logActivity: (activity) => {
          patch((d) => ({ activities: [...d.activities.filter((a) => a.id !== activity.id), activity] }))
          rematchFor(activity.athleteId, activity.day)
        },
        editPlanned: (id, change) => {
          patch((d) => ({ planned: d.planned.map((w) => (w.id === id ? { ...w, ...change } : w)) }))
          const w = get().data.planned.find((p) => p.id === id)
          if (w) rematchFor(w.athleteId, w.day)
        },
        moveWorkout: (id, day, order) => {
          const w = get().data.planned.find((p) => p.id === id)
          if (!w) return
          const restore: UndoEntry['restore'] = { id, day: w.day, order: w.order }
          if (w.startMinute !== undefined) restore.startMinute = w.startMinute
          const sameDay = get().data.planned.filter((p) => p.athleteId === w.athleteId && p.day === day && p.id !== id)
          const nextOrder = order ?? sameDay.reduce((m, p) => Math.max(m, p.order + 1), 0)
          patch((d) => ({ planned: d.planned.map((p) => (p.id === id ? { ...p, day, order: nextOrder } : p)) }))
          rematchFor(w.athleteId, day)
          set((s) => ({ undoStack: [...s.undoStack, { label: `Moved ${w.title}`, restore }] }))
        },
        undoMove: () => {
          const entry = get().undoStack[get().undoStack.length - 1]
          if (!entry) return
          const { id, ...back } = entry.restore
          const w = get().data.planned.find((p) => p.id === id)
          set((s) => ({ undoStack: s.undoStack.slice(0, -1) }))
          if (!w) return
          patch((d) => ({
            planned: d.planned.map((p) => {
              if (p.id !== id) return p
              const { startMinute: _s, ...rest } = p
              return {
                ...rest,
                day: back.day,
                order: back.order,
                ...(back.startMinute !== undefined ? { startMinute: back.startMinute } : {}),
              }
            }),
          }))
          rematchFor(w.athleteId, back.day)
        },
        saveTemplate: (template) =>
          patch((d) => ({
            templates: d.templates.some((t) => t.id === template.id)
              ? d.templates.map((t) => (t.id === template.id ? template : t))
              : [...d.templates, template],
          })),
        saveCheckIn: (checkIn) =>
          patch((d) => ({
            // One check-in per athlete per day: saving again replaces it.
            checkIns: [
              ...d.checkIns.filter((c) => !(c.athleteId === checkIn.athleteId && c.day === checkIn.day)),
              checkIn,
            ].toSorted((a, b) => a.day - b.day),
          })),
        acknowledgeFlag: (flagId, athleteId, day = clockToday()) =>
          patch((d) => syncFlags(d, athleteId, acknowledgeFlag(d.flagsState[athleteId], flagId, day))),
        resolveFlag: (flagId, athleteId, note, day = clockToday()) =>
          patch((d) => syncFlags(d, athleteId, resolveFlag(d.flagsState[athleteId], flagId, day, note))),
        addFlagNote: (flagId, athleteId, text, day = clockToday()) =>
          patch((d) => syncFlags(d, athleteId, addFlagNote(d.flagsState[athleteId], flagId, day, text))),
        sendKudos: (input, day = clockToday()) =>
          patch((d) => {
            const n = d.kudos.filter((k) => k.athleteId === input.athleteId).length + 1
            const k: Kudos = { id: `kudos-${input.athleteId}-${day}-${n}`, athleteId: input.athleteId, day, seenByAthlete: false }
            if (input.activityId !== undefined) k.activityId = input.activityId
            if (input.message !== undefined && input.message.trim() !== '') k.message = input.message.trim()
            return { kudos: [...d.kudos, k] }
          }),
        changeThreshold: (athleteId, kind, value, effectiveFromDay, source = 'coachEdit') =>
          patch((d) => ({
            // History is kept: a new row, except that the same kind on the same day is replaced.
            thresholds: [
              ...d.thresholds.filter(
                (t) => !(t.athleteId === athleteId && t.kind === kind && t.effectiveFromDay === effectiveFromDay),
              ),
              { athleteId, kind, value, effectiveFromDay, source },
            ],
          })),
        setAiConsent: (owner, on) =>
          patch((d) => ({ settings: { ...d.settings, [owner]: { ...d.settings[owner], aiConsent: on } } })),
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
          set({ data: freshData(), anchor: runtimeStartEpochDay(), undoStack: [], unreadable: false })
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
        return { ...current, data: { ...current.data, ...p.data } }
      },
    },
  ),
)

// Mirror the storage status into the store so screens can read it as a flag.
onStorageStatus((failed) => {
  if (useLaree.getState().storageFailed !== failed) useLaree.setState({ storageFailed: failed })
})
