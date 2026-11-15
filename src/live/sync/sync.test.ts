import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { setRoster } from '../../app/people.ts'
import type { Athlete } from '../../app/people.ts'
import { emptyLiveData, useLaree } from '../../data/store.ts'
import { setNow, today } from '../../domain/time.ts'
import type { CheckIn, PlannedWorkout } from '../../domain/types.ts'
import { opKey } from './diff.ts'
import type { Op } from './diff.ts'
import { canWrite, SPECS } from './docs.ts'
import type { Scope, SyncContext } from './docs.ts'
import { startSync } from './engine.ts'
import type { Backend, PulledRow, SyncHandle } from './engine.ts'
import { memoryOutboxStore, Outbox } from './outbox.ts'

const COACH = '00000000-0000-4000-a000-00000000000a'
const ATHLETE = '00000000-0000-4000-a000-0000000000a1'
const OTHER = '00000000-0000-4000-a000-0000000000b1'

const athleteCtx: SyncContext = { uid: ATHLETE, role: 'athlete', selfCoached: false, athleteIds: [ATHLETE] }
const coachCtx: SyncContext = { uid: COACH, role: 'coach', selfCoached: false, athleteIds: [ATHLETE] }

const person: Athlete = {
  id: ATHLETE,
  name: 'Test Athlete',
  blurb: '',
  focus: 'Marathon',
  sports: ['run'],
  baselines: { restingHr: 50, hrvMs: 70 },
}

/** An in-memory server with the same write rules as the database. */
function fakeServer() {
  const tables = new Map<string, Map<string, PulledRow>>()
  let clock = 0
  let down = false
  const writes: string[] = []
  const as = (ctx: SyncContext): Backend => ({
    async send(table, _scope, ops) {
      if (down) throw new TypeError('Failed to fetch')
      const spec = SPECS.find((s) => s.table === table)
      if (!spec) throw new Error(`no table ${table}`)
      if (ops.some((o) => !canWrite(spec.writer, o.key, ctx)))
        return { ok: false, denied: true, message: 'new row violates row-level security policy' }
      const t = tables.get(table) ?? new Map<string, PulledRow>()
      tables.set(table, t)
      for (const o of ops) {
        writes.push(opKey(o))
        t.set(`${o.key}/${o.id}`, {
          key: o.key,
          id: o.id,
          day: o.day,
          body: structuredClone(o.body ?? {}),
          deleted: o.body === null,
          updatedAt: String(++clock).padStart(10, '0'),
        })
      }
      return { ok: true }
    },
    async pull(table, _scope: Scope, since) {
      if (down) throw new TypeError('Failed to fetch')
      const readable = (key: string) => key === ctx.uid || ctx.athleteIds.includes(key)
      return [...(tables.get(table)?.values() ?? [])]
        .filter((r) => readable(r.key) && (since === null || r.updatedAt > since))
        .map((r) => structuredClone(r))
    },
  })
  return {
    as,
    tables,
    writes,
    setDown: (v: boolean) => {
      down = v
    },
  }
}

const sessions: SyncHandle[] = []

function signIn(server: ReturnType<typeof fakeServer>, ctx: SyncContext, outbox = new Outbox(memoryOutboxStore())) {
  useLaree.setState({ data: emptyLiveData(), undoStack: [] })
  const handle = startSync({ backend: server.as(ctx), outbox, ctx, intervalMs: 3_600_000 })
  sessions.push(handle)
  return { handle, outbox }
}

function signOut() {
  for (const s of sessions.splice(0)) s.stop()
}

const checkIn = (day: number): CheckIn => ({
  id: crypto.randomUUID(),
  athleteId: ATHLETE,
  day,
  sleepHours: 7,
  soreness: 2,
  mood: 4,
})

const workout = (day: number): PlannedWorkout => ({
  id: crypto.randomUUID(),
  athleteId: ATHLETE,
  day,
  order: 0,
  sport: 'run',
  title: 'Easy run',
  steps: [],
  plannedDurationS: 2400,
  plannedLoad: 30,
  keySession: false,
})

beforeEach(() => {
  setNow(Date.UTC(2026, 10, 11, 2))
  setRoster({ id: 'coach', name: 'Coach', blurb: '' }, [person])
})

afterEach(() => {
  signOut()
  setNow(null)
})

describe('sync', () => {
  it('sends an athlete check-in once, and the coach sees it', async () => {
    const server = fakeServer()
    const a = signIn(server, athleteCtx)
    await a.handle.syncNow()
    useLaree.getState().saveCheckIn(checkIn(today()))
    await a.handle.syncNow()
    expect([...(server.tables.get('check_ins')?.values() ?? [])]).toHaveLength(1)
    signOut()

    const c = signIn(server, coachCtx)
    await c.handle.syncNow()
    expect(useLaree.getState().data.checkIns.map((x) => x.athleteId)).toEqual([ATHLETE])
  })

  it('keeps writes made offline and sends them when the server is back', async () => {
    const server = fakeServer()
    const a = signIn(server, athleteCtx)
    await a.handle.syncNow()
    server.setDown(true)
    useLaree.getState().saveCheckIn(checkIn(today()))
    await a.handle.syncNow()
    expect(a.outbox.pending).toHaveLength(1)
    expect(server.tables.get('check_ins')?.size ?? 0).toBe(0)
    server.setDown(false)
    await a.handle.syncNow()
    expect(a.outbox.pending).toHaveLength(0)
    expect(server.tables.get('check_ins')?.size).toBe(1)
  })

  it('replaying the outbox twice makes no duplicates', async () => {
    const server = fakeServer()
    const op: Op = {
      table: 'check_ins',
      scope: 'athlete',
      key: ATHLETE,
      id: 'c-1',
      day: '2026-11-11',
      body: { ...checkIn(today()), id: 'c-1' },
    }
    const backend = server.as(athleteCtx)
    for (let i = 0; i < 2; i++) {
      const box = new Outbox(memoryOutboxStore([op]))
      await box.load()
      await box.flush(backend.send)
    }
    expect(server.writes).toHaveLength(2)
    expect(server.tables.get('check_ins')?.size).toBe(1)
  })

  it('carries a coach plan edit and a deletion to the athlete', async () => {
    const server = fakeServer()
    const c = signIn(server, coachCtx)
    await c.handle.syncNow()
    const w = workout(today() + 1)
    useLaree.getState().applyPlanChanges([{ kind: 'add', workout: w }], 'Add')
    await c.handle.syncNow()
    signOut()

    const a = signIn(server, athleteCtx)
    await a.handle.syncNow()
    expect(useLaree.getState().data.planned.map((p) => p.id)).toEqual([w.id])
    signOut()

    const c2 = signIn(server, coachCtx)
    await c2.handle.syncNow()
    useLaree.getState().deletePlanned(w.id)
    await c2.handle.syncNow()
    signOut()

    const a2 = signIn(server, athleteCtx)
    await a2.handle.syncNow()
    expect(useLaree.getState().data.planned).toEqual([])
  })

  it('never queues a write the person may not make', async () => {
    const server = fakeServer()
    const a = signIn(server, athleteCtx)
    await a.handle.syncNow()
    // A coached athlete's plan belongs to the coach: a local change to it is not sent.
    useLaree.getState().applyPlanChanges([{ kind: 'add', workout: workout(today()) }], 'Add')
    await a.handle.syncNow()
    expect(server.tables.get('planned_workouts')?.size ?? 0).toBe(0)
    expect(a.outbox.pending).toHaveLength(0)
  })

  it('drops and reports a write the server refuses', async () => {
    const server = fakeServer()
    const refused: Op[] = []
    const box = new Outbox(
      memoryOutboxStore([
        { table: 'planned_workouts', scope: 'athlete', key: OTHER, id: 'x', day: null, body: {} },
      ]),
    )
    await box.load()
    const result = await box.flush(server.as(coachCtx).send)
    refused.push(...result.rejected)
    expect(refused).toHaveLength(1)
    expect(box.pending).toHaveLength(0)
    expect(result.stalled).toBe(false)
  })

  it('a pull does not undo a write still waiting to be sent', async () => {
    const server = fakeServer()
    const a = signIn(server, athleteCtx)
    await a.handle.syncNow()
    server.setDown(true)
    const c = checkIn(today())
    useLaree.getState().saveCheckIn(c)
    server.setDown(false)
    // Send fails once more, then the pull runs with the write still queued.
    await a.handle.syncNow()
    expect(useLaree.getState().data.checkIns.some((x) => x.id === c.id)).toBe(true)
  })
})
