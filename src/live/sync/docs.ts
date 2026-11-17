/**
 * How each part of the store maps to a database table. Pure: no network, no store access.
 *
 * Each record becomes a document: the owning person (`key`, an athlete or owner id), the record's
 * id, its calendar date (for queries) and a body. Day offsets stay day offsets in the body: the
 * live app fixes day 0 for good (app/liveEpoch.ts), so they never move. `src` is the value in the
 * store; the store never mutates, so a new `src` reference means the record changed.
 */
import type { LareeData } from '../../data/store.ts'
import { TEMPLATES } from '../../data/seed/templates.ts'
import type { FlagsState } from '../../domain/flags.ts'
import { dayToIso, weekRange } from '../../domain/time.ts'
import type { Settings, WorkoutTemplate } from '../../domain/types.ts'

export type Writer = 'athlete' | 'planner' | 'both' | 'owner'
export type Scope = 'athlete' | 'owner'

export interface Doc {
  key: string
  id: string
  day: string | null
  src: unknown
}

/** A row as the database returns it, with the owner column already read into `key`. */
export interface Row {
  key: string
  id: string
  day: string | null
  body: Record<string, unknown>
  deleted: boolean
}

/** Who is signed in, and whose rows they may write. */
export interface SyncContext {
  uid: string
  role: 'coach' | 'athlete'
  /** An athlete with no active coach plans for themself. */
  selfCoached: boolean
  /** Athletes this person reads: their roster as a coach, or themself. */
  athleteIds: readonly string[]
}

export interface SliceSpec {
  slice: keyof LareeData
  table: string
  scope: Scope
  writer: Writer
  docs(data: LareeData, ctx: SyncContext): Doc[]
  body(doc: Doc): Record<string, unknown>
  /** The slice built from every row the person can read. */
  build(rows: readonly Row[], ctx: SyncContext): Partial<LareeData>
  /** For a table that adds to another slice: applied after every build, to the built data. */
  merge?(data: LareeData, rows: readonly Row[]): Partial<LareeData>
}

const iso = (day: number): string => dayToIso(day)
const weekIso = (week: number): string => dayToIso(weekRange(week).firstDay)
const asObject = (v: unknown): Record<string, unknown> => v as Record<string, unknown>
const live = (rows: readonly Row[]): Row[] => rows.filter((r) => !r.deleted)

/** A store array whose items carry their own athlete and id. */
function list<T extends { athleteId: string }>(
  slice: keyof LareeData,
  table: string,
  writer: Writer,
  idOf: (x: T) => string,
  dayOf: (x: T) => string | null,
): SliceSpec {
  return {
    slice,
    table,
    scope: 'athlete',
    writer,
    docs: (data) => (data[slice] as unknown as T[]).map((x) => ({ key: x.athleteId, id: idOf(x), day: dayOf(x), src: x })),
    body: (doc) => asObject(doc.src),
    // The row's owner is the record's athlete, whatever the body says: the access rules check the row.
    build: (rows) => ({ [slice]: live(rows).map((r) => ({ ...r.body, athleteId: r.key }) as unknown as T) }) as Partial<LareeData>,
  }
}

type WithId = { id: string; athleteId: string }
const byId = (x: WithId): string => x.id

export const SPECS: readonly SliceSpec[] = [
  // The plan side: the active coach writes, or a self-coached athlete.
  list<WithId & { day: number }>('planned', 'planned_workouts', 'planner', byId, (x) => iso(x.day)),
  list<WithId & { day: number }>('races', 'races', 'planner', byId, (x) => iso(x.day)),
  list<WithId & { firstWeek: number }>('phases', 'phases', 'planner', byId, (x) => weekIso(x.firstWeek)),
  list<{ athleteId: string; kind: string; effectiveFromDay: number }>(
    'thresholds',
    'thresholds',
    'planner',
    (x) => `${x.kind}@${x.effectiveFromDay}`,
    (x) => iso(x.effectiveFromDay),
  ),
  list<{ athleteId: string; week: number }>('excuses', 'excuses', 'planner', (x) => `week-${x.week}`, (x) => weekIso(x.week)),
  {
    slice: 'activityNotes',
    table: 'activity_notes',
    scope: 'athlete',
    writer: 'planner',
    docs: (data) => {
      const owner = new Map(data.activities.map((a) => [a.id, a.athleteId]))
      return Object.entries(data.activityNotes).flatMap(([id, note]) => {
        const key = owner.get(id)
        return key ? [{ key, id, day: null, src: note }] : []
      })
    },
    body: (doc) => ({ note: doc.src }),
    build: (rows) => ({ activityNotes: Object.fromEntries(live(rows).map((r) => [r.id, String(r.body['note'] ?? '')])) }),
  },
  {
    slice: 'flagsState',
    table: 'flag_states',
    scope: 'athlete',
    writer: 'planner',
    docs: (data) => Object.entries(data.flagsState).map(([key, state]) => ({ key, id: 'state', day: null, src: state })),
    body: (doc) => asObject(doc.src),
    build: (rows) => ({
      flagsState: Object.fromEntries(live(rows).map((r) => [r.key, r.body as unknown as FlagsState])),
    }),
  },
  // The athlete's own record.
  list<WithId & { day: number }>('activities', 'activities', 'athlete', byId, (x) => iso(x.day)),
  list<WithId & { day: number }>('checkIns', 'check_ins', 'athlete', byId, (x) => iso(x.day)),
  list<{ athleteId: string; day: number }>('skippedCheckIns', 'check_in_skips', 'athlete', (x) => `skip-${x.day}`, (x) => iso(x.day)),
  list<WithId & { earnedDay: number }>('badges', 'badges', 'athlete', byId, (x) => iso(x.earnedDay)),
  {
    slice: 'badgeSeen',
    table: 'badge_seen',
    scope: 'athlete',
    writer: 'athlete',
    docs: (data) => Object.entries(data.badgeSeen).map(([key, ids]) => ({ key, id: 'seen', day: null, src: ids })),
    body: (doc) => ({ ids: doc.src }),
    build: (rows) => ({
      badgeSeen: Object.fromEntries(live(rows).map((r) => [r.key, Array.isArray(r.body['ids']) ? (r.body['ids'] as string[]) : []])),
    }),
  },
  // Kudos are the coach's words. The athlete marks them seen in a record of their own.
  list<WithId & { day: number }>('kudos', 'kudos', 'planner', byId, (x) => iso(x.day)),
  {
    slice: 'kudos',
    table: 'kudos_seen',
    scope: 'athlete',
    writer: 'athlete',
    docs: (data) => {
      const seen = new Map<string, string[]>()
      for (const k of data.kudos) if (k.seenByAthlete) seen.set(k.athleteId, [...(seen.get(k.athleteId) ?? []), k.id])
      return [...seen].map(([key, ids]) => ({ key, id: 'seen', day: null, src: ids }))
    },
    body: (doc) => ({ ids: doc.src }),
    build: () => ({}),
    merge: (data, rows) => {
      // Matched by athlete and id together: two athletes may each hold a record with the same id.
      const seen = new Set(
        live(rows).flatMap((r) => (Array.isArray(r.body['ids']) ? (r.body['ids'] as string[]).map((id) => `${r.key}/${id}`) : [])),
      )
      const newlySeen = (k: { id: string; athleteId: string; seenByAthlete: boolean }) =>
        !k.seenByAthlete && seen.has(`${k.athleteId}/${k.id}`)
      if (!data.kudos.some(newlySeen)) return {}
      return { kudos: data.kudos.map((k) => (newlySeen(k) ? { ...k, seenByAthlete: true } : k)) }
    },
  },
  // A person's own library. The built-in templates are not stored; a row overrides or hides one.
  {
    slice: 'templates',
    table: 'workout_templates',
    scope: 'owner',
    writer: 'owner',
    docs: (data, ctx) => {
      const builtIn = new Map(TEMPLATES.map((t) => [t.id, t]))
      const docs: Doc[] = data.templates
        .filter((t) => builtIn.get(t.id) !== t)
        .map((t) => ({ key: ctx.uid, id: t.id, day: null, src: t }))
      // A built-in template that is gone was deleted: say so with an empty marker row.
      const present = new Set(data.templates.map((t) => t.id))
      for (const t of TEMPLATES) if (!present.has(t.id)) docs.push({ key: ctx.uid, id: t.id, day: null, src: HIDDEN })
      return docs
    },
    body: (doc) => (doc.src === HIDDEN ? { hidden: true } : asObject(doc.src)),
    build: (rows) => {
      const mine = new Map(live(rows).map((r) => [r.id, r.body]))
      const out: WorkoutTemplate[] = []
      for (const t of TEMPLATES) {
        const row = mine.get(t.id)
        if (row?.['hidden'] === true) continue
        out.push(row ? (row as unknown as WorkoutTemplate) : t)
        mine.delete(t.id)
      }
      for (const row of mine.values()) if (row['hidden'] !== true) out.push(row as unknown as WorkoutTemplate)
      return { templates: out }
    },
  },
  // Settings: "coach" is the planner's own coach-side settings, an athlete id their athlete side.
  {
    slice: 'settings',
    table: 'settings',
    scope: 'owner',
    writer: 'owner',
    docs: (data, ctx) =>
      Object.entries(data.settings).flatMap(([owner, s]): Doc[] => {
        if (owner !== 'coach') return [{ key: owner, id: 'athlete', day: null, src: s }]
        // Only a planner has coach-side settings of their own.
        return ctx.role === 'coach' || ctx.selfCoached ? [{ key: ctx.uid, id: 'coach', day: null, src: s }] : []
      }),
    body: (doc) => {
      const { owner: _owner, ...rest } = doc.src as Settings
      return rest
    },
    build: (rows, ctx) => {
      const settings: Record<string, Settings> = {}
      for (const r of live(rows)) {
        const owner = r.id === 'coach' && r.key === ctx.uid ? 'coach' : r.key
        if (r.id === 'coach' && r.key !== ctx.uid) continue
        settings[owner] = { ...(r.body as unknown as Omit<Settings, 'owner'>), owner } as Settings
      }
      return { settings }
    },
  },
]

/** Marks a built-in template the person deleted. */
const HIDDEN: unique symbol = Symbol('hidden template')

/** May this person write this document? The database checks the same rule; this keeps the outbox clean. */
export function canWrite(writer: Writer, key: string, ctx: SyncContext): boolean {
  const own = key === ctx.uid
  const planner = (ctx.role === 'coach' && ctx.athleteIds.includes(key) && !own) || (own && ctx.selfCoached)
  switch (writer) {
    case 'athlete':
      return own && ctx.role === 'athlete'
    case 'planner':
      return planner
    case 'both':
      return planner || (own && ctx.role === 'athlete')
    case 'owner':
      return own
  }
}
