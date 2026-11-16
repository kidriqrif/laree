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
import { QUEUE_UNREADABLE, startSync, useSyncStatus } from './engine.ts'
import type { Backend, PulledRow, SyncHandle } from './engine.ts'
import { memoryOutboxStore, Outbox } from './outbox.ts'
import type { OutboxStore } from './outbox.ts'
import { afterFilter, overlapStart, OVERLAP_MS, readPages, supabaseBackend } from './supabaseBackend.ts'
import type { DbRow, PageEnd } from './supabaseBackend.ts'

const COACH = '00000000-0000-4000-a000-00000000000a'
const ATHLETE = '00000000-0000-4000-a000-0000000000a1'
const OTHER = '00000000-0000-4000-a000-0000000000b1'

const athleteCtx: SyncContext = { uid: ATHLETE, role: 'athlete', selfCoached: false, athleteIds: [ATHLETE] }
const coachCtx: SyncContext = { uid: COACH, role: 'coach', selfCoached: false, athleteIds: [ATHLETE] }
const coachOfTwoCtx: SyncContext = { uid: COACH, role: 'coach', selfCoached: false, athleteIds: [ATHLETE, OTHER] }

const person: Athlete = {
  id: ATHLETE,
  name: 'Test Athlete',
  blurb: '',
  focus: 'Marathon',
  sports: ['run'],
  baselines: { restingHr: 50, hrvMs: 70 },
}

const T0 = Date.UTC(2026, 10, 11, 2)
const stamp = (ms: number): string => new Date(ms).toISOString()

/**
 * An in-memory server with the same write rules as the database, and the same reading rule as the
 * real backend: an incremental pull starts a fixed window before its cursor. Each write is stamped
 * one second after the one before; a test can move the clock and restamp a row.
 */
function fakeServer() {
  const tables = new Map<string, Map<string, PulledRow>>()
  const clock = { ms: T0 }
  let down = false
  const writes: string[] = []
  const hooks: { beforePull?: (table: string) => void; beforeSend?: (table: string) => void } = {}
  const as = (ctx: SyncContext): Backend => ({
    async now() {
      if (down) throw new TypeError('Failed to fetch')
      return stamp(clock.ms)
    },
    async send(table, _scope, ops) {
      if (down) throw new TypeError('Failed to fetch')
      hooks.beforeSend?.(table)
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
          updatedAt: stamp((clock.ms += 1000)),
        })
      }
      return { ok: true }
    },
    async pull(table, _scope: Scope, since) {
      if (down) throw new TypeError('Failed to fetch')
      hooks.beforePull?.(table)
      const readable = (key: string) => key === ctx.uid || ctx.athleteIds.includes(key)
      return [...(tables.get(table)?.values() ?? [])]
        .filter((r) => readable(r.key) && (since === null || r.updatedAt > overlapStart(since)))
        .map((r) => structuredClone(r))
    },
  })
  return {
    as,
    tables,
    writes,
    hooks,
    clock,
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

const checkIn = (day: number, athleteId = ATHLETE): CheckIn => ({
  id: crypto.randomUUID(),
  athleteId,
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

  it('a pull that rebuilds a table keeps a write made while it runs', async () => {
    const server = fakeServer()
    const a = signIn(server, athleteCtx)
    await a.handle.syncNow()
    // Another device adds a check-in, so this pull rebuilds the check-ins from the server's rows.
    const fromServer = checkIn(today() - 1)
    await server.as(athleteCtx).send('check_ins', 'athlete', [
      { table: 'check_ins', scope: 'athlete', key: ATHLETE, id: fromServer.id, day: null, body: { ...fromServer } },
    ])
    const c = checkIn(today())
    // The check-in is saved while the pull is reading: it is queued, not yet sent.
    server.hooks.beforePull = (table) => {
      if (table === 'activities') useLaree.getState().saveCheckIn(c)
    }
    await a.handle.syncNow()
    server.hooks.beforePull = undefined
    expect(a.outbox.has('check_ins', ATHLETE, c.id)).toBe(true)
    expect(useLaree.getState().data.checkIns.map((x) => x.id).sort()).toEqual([c.id, fromServer.id].sort())
  })

  it('sends the good writes of a batch that holds one refused write', async () => {
    const server = fakeServer()
    const ok: Op = { table: 'planned_workouts', scope: 'athlete', key: ATHLETE, id: 'p-ok', day: null, body: { id: 'p-ok' } }
    const bad: Op = { table: 'planned_workouts', scope: 'athlete', key: OTHER, id: 'p-bad', day: null, body: { id: 'p-bad' } }
    const box = new Outbox(memoryOutboxStore([bad, ok]))
    await box.load()
    const result = await box.flush(server.as(coachCtx).send)
    expect(result.rejected.map((o) => o.id)).toEqual(['p-bad'])
    expect(result.sent).toBe(1)
    expect(server.tables.get('planned_workouts')?.has(`${ATHLETE}/p-ok`)).toBe(true)
  })

  it('undoes a refused write on the next pull', async () => {
    const server = fakeServer()
    // The server refuses every write from this athlete, as after an access change.
    const refusing = { ...server.as(athleteCtx), send: async () => ({ ok: false as const, denied: true, message: 'refused' }) }
    useLaree.setState({ data: emptyLiveData() })
    const box = new Outbox(memoryOutboxStore())
    const handle = startSync({ backend: refusing, outbox: box, ctx: athleteCtx, intervalMs: 3_600_000 })
    sessions.push(handle)
    await handle.syncNow()
    useLaree.getState().saveCheckIn(checkIn(today()))
    await handle.syncNow()
    expect(useLaree.getState().data.checkIns).toEqual([])
  })

  it('carries kudos seen from the athlete to the coach without the athlete writing kudos', async () => {
    const server = fakeServer()
    const c = signIn(server, coachCtx)
    await c.handle.syncNow()
    useLaree.getState().sendKudos({ athleteId: ATHLETE, message: 'Great week' })
    await c.handle.syncNow()
    signOut()

    const a = signIn(server, athleteCtx)
    await a.handle.syncNow()
    const k = useLaree.getState().data.kudos[0]!
    useLaree.getState().markKudosSeen(ATHLETE)
    await a.handle.syncNow()
    expect(server.tables.get('kudos')?.get(`${ATHLETE}/${k.id}`)?.body['seenByAthlete']).toBe(false)
    expect(server.tables.get('kudos_seen')?.get(`${ATHLETE}/seen`)?.body['ids']).toEqual([k.id])
    signOut()

    const c2 = signIn(server, coachCtx)
    await c2.handle.syncNow()
    expect(useLaree.getState().data.kudos[0]?.seenByAthlete).toBe(true)
  })

  it('files a record under the row owner, whatever its body says', async () => {
    const server = fakeServer()
    await server.as(athleteCtx).send('check_ins', 'athlete', [
      { table: 'check_ins', scope: 'athlete', key: ATHLETE, id: 'x', day: null, body: { ...checkIn(today()), id: 'x', athleteId: OTHER } },
    ])
    const c = signIn(server, coachCtx)
    await c.handle.syncNow()
    expect(useLaree.getState().data.checkIns.map((x) => x.athleteId)).toEqual([ATHLETE])
  })

  it('marks kudos seen only for the athlete who saw them, when two athletes share a kudos id', async () => {
    setRoster({ id: 'coach', name: 'Coach', blurb: '' }, [person, { ...person, id: OTHER, name: 'Other Athlete' }])
    const server = fakeServer()
    const kudos = (athleteId: string): Op => ({
      table: 'kudos',
      scope: 'athlete',
      key: athleteId,
      id: 'k-1',
      day: null,
      body: { id: 'k-1', athleteId, day: today(), message: 'Well done', seenByAthlete: false },
    })
    await server.as(coachOfTwoCtx).send('kudos', 'athlete', [kudos(ATHLETE), kudos(OTHER)])
    await server.as(athleteCtx).send('kudos_seen', 'athlete', [
      { table: 'kudos_seen', scope: 'athlete', key: ATHLETE, id: 'seen', day: null, body: { ids: ['k-1'] } },
    ])
    const c = signIn(server, coachOfTwoCtx)
    await c.handle.syncNow()
    const seen = Object.fromEntries(useLaree.getState().data.kudos.map((k) => [k.athleteId, k.seenByAthlete]))
    expect(seen).toEqual({ [ATHLETE]: true, [OTHER]: false })
  })
})

/** An outbox store whose first read waits until the test lets it finish. */
function slowStore(saved: Op[]) {
  let release: () => void = () => undefined
  const gate = new Promise<void>((resolve) => (release = resolve))
  const saves: Op[][] = []
  const store: OutboxStore = {
    load: async () => {
      await gate
      return [...saved]
    },
    save: async (ops) => {
      saves.push([...ops])
    },
  }
  return { store, saves, release }
}

describe('the saved queue', () => {
  it('keeps both the saved writes and an edit made before they were read', async () => {
    const server = fakeServer()
    const savedCheckIn = checkIn(today() - 1)
    const saved: Op = { table: 'check_ins', scope: 'athlete', key: ATHLETE, id: savedCheckIn.id, day: null, body: { ...savedCheckIn } }
    const slow = slowStore([saved])
    const a = signIn(server, athleteCtx, new Outbox(slow.store))
    const edit = checkIn(today())
    useLaree.getState().saveCheckIn(edit)
    // Nothing is saved or sent before the saved queue is read: a partial queue must not replace it.
    await Promise.resolve()
    expect(slow.saves).toEqual([])
    expect(server.writes).toEqual([])
    slow.release()
    await a.handle.syncNow()
    // The first save holds the merged queue: the saved write first, then the edit.
    expect(slow.saves[0]?.[0]?.id).toBe(saved.id)
    expect(slow.saves[0]?.map((o) => o.id)).toContain(edit.id)
    expect([...(server.tables.get('check_ins')?.keys() ?? [])].sort()).toEqual([`${ATHLETE}/${saved.id}`, `${ATHLETE}/${edit.id}`].sort())
    expect(useLaree.getState().data.checkIns.map((x) => x.id).sort()).toEqual([saved.id, edit.id].sort())
  })

  it('does not sync while the saved queue cannot be read, and tries again', async () => {
    const server = fakeServer()
    let pulls = 0
    server.hooks.beforePull = () => void pulls++
    let broken = true
    const inner = memoryOutboxStore()
    const store: OutboxStore = {
      load: async () => {
        if (broken) throw new Error('blocked')
        return inner.load()
      },
      save: inner.save,
    }
    const a = signIn(server, athleteCtx, new Outbox(store))
    await a.handle.syncNow()
    expect(pulls).toBe(0)
    expect(useSyncStatus.getState()).toMatchObject({ unsaved: true, problem: QUEUE_UNREADABLE })
    broken = false
    await a.handle.syncNow()
    expect(pulls).toBeGreaterThan(0)
    expect(useSyncStatus.getState()).toMatchObject({ unsaved: false, problem: null })
  })

  it('says so when a write could not be kept on the device', async () => {
    const server = fakeServer()
    server.setDown(true)
    let full = false
    const inner = memoryOutboxStore()
    const store: OutboxStore = {
      load: inner.load,
      save: async (ops) => {
        if (full && ops.length > 0) throw new Error('quota')
        return inner.save(ops)
      },
    }
    const a = signIn(server, athleteCtx, new Outbox(store))
    await a.handle.syncNow()
    full = true
    useLaree.getState().saveCheckIn(checkIn(today()))
    await a.handle.syncNow()
    expect(useSyncStatus.getState()).toMatchObject({ unsaved: true, pending: 1 })
    full = false
    server.setDown(false)
    await a.handle.syncNow()
    expect(useSyncStatus.getState().unsaved).toBe(false)
    expect(server.tables.get('check_ins')?.size).toBe(1)
  })
})

describe('a rebuild that fails', () => {
  it('rebuilds the same tables on the next pull', async () => {
    const server = fakeServer()
    const a = signIn(server, athleteCtx)
    await a.handle.syncNow()
    // Another device adds a check-in, and a damaged row makes this rebuild fail.
    const c = checkIn(today())
    await server.as(athleteCtx).send('check_ins', 'athlete', [
      { table: 'check_ins', scope: 'athlete', key: ATHLETE, id: c.id, day: null, body: { ...c } },
    ])
    const damaged: Op = { table: 'kudos_seen', scope: 'athlete', key: ATHLETE, id: 'seen', day: null, body: {} }
    await server.as(athleteCtx).send('kudos_seen', 'athlete', [damaged])
    server.tables.get('kudos_seen')!.get(`${ATHLETE}/seen`)!.body = null as never
    await a.handle.syncNow()
    expect(useLaree.getState().data.checkIns).toEqual([])
    expect(useSyncStatus.getState().problem).not.toBeNull()
    // The row is repaired. The check-in did not change again, but it is still due.
    await server.as(athleteCtx).send('kudos_seen', 'athlete', [damaged])
    await a.handle.syncNow()
    expect(useLaree.getState().data.checkIns.map((x) => x.id)).toEqual([c.id])
    expect(useSyncStatus.getState().problem).toBeNull()
  })
})

describe('stopping', () => {
  it('sends nothing more once the sync is stopped', async () => {
    const server = fakeServer()
    const c = signIn(server, coachCtx)
    await c.handle.syncNow()
    server.setDown(true)
    useLaree.getState().applyPlanChanges([{ kind: 'add', workout: workout(today() + 1) }], 'Add')
    useLaree.getState().sendKudos({ athleteId: ATHLETE, message: 'Great week' })
    await c.handle.syncNow()
    expect(new Set(c.outbox.pending.map((o) => o.table)).size).toBeGreaterThan(1)
    server.setDown(false)
    // Signing out lands while the first table is being sent.
    const sentTables: string[] = []
    server.hooks.beforeSend = (table) => {
      sentTables.push(table)
      c.handle.stop()
    }
    await c.handle.syncNow()
    expect(sentTables).toHaveLength(1)
    expect(c.outbox.pending.length).toBeGreaterThan(0)
    expect(c.outbox.pending.every((o) => o.table !== sentTables[0])).toBe(true)
  })

  it('a sync stopped during a pull reads no further table and leaves the store alone', async () => {
    const server = fakeServer()
    const a = signIn(server, athleteCtx)
    await a.handle.syncNow()
    const c = checkIn(today() - 1)
    await server.as(athleteCtx).send('check_ins', 'athlete', [
      { table: 'check_ins', scope: 'athlete', key: ATHLETE, id: c.id, day: null, body: { ...c } },
    ])
    const pulled: string[] = []
    server.hooks.beforePull = (table) => {
      pulled.push(table)
      a.handle.stop()
    }
    await a.handle.syncNow()
    expect(pulled).toHaveLength(1)
    expect(useLaree.getState().data.checkIns).toEqual([])
  })
})

describe('paged pulls', () => {
  const row = (at: string, owner: string, id: string): DbRow => ({ athlete_id: owner, id, day: null, body: {}, updated_at: at, deleted_at: null })
  const position = (r: DbRow): [string, string, string] => [r.updated_at, String(r.athlete_id), r.id]
  const isAfter = (r: DbRow, end: PageEnd): boolean => {
    const [at, key, id] = position(r)
    return at > end.at || (at === end.at && (key > end.key || (key === end.key && id > end.id)))
  }
  const serve = (rows: DbRow[]) => {
    const sorted = [...rows].sort((a, b) => (position(a) < position(b) ? -1 : 1))
    const calls: (PageEnd | null)[] = []
    const fetchPage = async (after: PageEnd | null, limit: number) => {
      calls.push(after)
      return sorted.filter((r) => !after || isAfter(r, after)).slice(0, limit)
    }
    return { fetchPage, calls }
  }

  it('reads two rows with the same time and id on either side of a page boundary', async () => {
    const t = '2026-11-11T02:00:00.000000+00:00'
    // One batch stamps every row with the same time, and two athletes may use the same id.
    const rows = [row(t, ATHLETE, 'seen'), row(t, OTHER, 'seen'), row(t, OTHER, 'state')]
    const { fetchPage, calls } = serve(rows)
    const out = await readPages('athlete_id', fetchPage, () => false, 1)
    expect(out.map((r) => `${r.key}/${r.id}`)).toEqual([`${ATHLETE}/seen`, `${OTHER}/seen`, `${OTHER}/state`])
    expect(calls[1]).toEqual({ at: t, key: ATHLETE, id: 'seen' })
  })

  it('stops between pages when the sync is stopped', async () => {
    const t = '2026-11-11T02:00:00+00:00'
    const { fetchPage, calls } = serve([row(t, ATHLETE, 'a'), row(t, ATHLETE, 'b'), row(t, ATHLETE, 'c')])
    let stopped = false
    const page = async (after: PageEnd | null, limit: number) => {
      const rows = await fetchPage(after, limit)
      stopped = true
      return rows
    }
    await expect(readPages('athlete_id', page, () => stopped, 1)).rejects.toThrow('Sync stopped')
    expect(calls).toHaveLength(1)
  })

  it('quotes the cursor values in the filter', () => {
    const filter = afterFilter('athlete_id', { at: '2026-11-11T02:00:00+00:00', key: ATHLETE, id: 'a,b"c\\d)' })
    expect(filter).toBe(
      [
        'updated_at.gt."2026-11-11T02:00:00+00:00"',
        `and(updated_at.eq."2026-11-11T02:00:00+00:00",athlete_id.gt."${ATHLETE}")`,
        `and(updated_at.eq."2026-11-11T02:00:00+00:00",athlete_id.eq."${ATHLETE}",id.gt."a,b\\"c\\\\d)")`,
      ].join(','),
    )
  })

  it('starts an incremental pull a little before its cursor', () => {
    // A write that began before the newest row can commit after it was read.
    expect(overlapStart('2026-11-11T02:00:30.000Z')).toBe('2026-11-11T02:00:00.000Z')
  })
})

describe('a late commit', () => {
  const row = (c: CheckIn): Op => ({ table: 'check_ins', scope: 'athlete', key: ATHLETE, id: c.id, day: null, body: { ...c } })
  const ids = () => useLaree.getState().data.checkIns.map((x) => x.id).sort()

  it('is picked up when it is stamped inside the window before the cursor', async () => {
    const server = fakeServer()
    const a = signIn(server, athleteCtx)
    await a.handle.syncNow()
    const late = checkIn(today())
    await server.as(athleteCtx).send('check_ins', 'athlete', [row(late)])
    await a.handle.syncNow()
    // A write that began 10 seconds before the last pull becomes visible only now.
    const early = checkIn(today() - 1)
    await server.as(athleteCtx).send('check_ins', 'athlete', [row(early)])
    server.tables.get('check_ins')!.get(`${ATHLETE}/${early.id}`)!.updatedAt = stamp(server.clock.ms - 10_000)
    await a.handle.syncNow()
    expect(ids()).toEqual([early.id, late.id].sort())
  })

  it('is picked up after a long paged pull that read much newer rows', async () => {
    const server = fakeServer()
    const a = signIn(server, athleteCtx)
    await a.handle.syncNow()
    const scanStart = server.clock.ms
    // Write A began just before this pull and commits while the pull is reading its later pages.
    // The same pull also reads C, written 40 seconds in: longer than the overlap window.
    const lateA = checkIn(today() - 2)
    const c = checkIn(today())
    server.hooks.beforePull = (table) => {
      if (table !== 'check_ins') return
      server.hooks.beforePull = undefined
      server.clock.ms = scanStart + 40_000
      server.tables.set('check_ins', new Map([[`${ATHLETE}/${c.id}`, { key: ATHLETE, id: c.id, day: null, body: { ...c }, deleted: false, updatedAt: stamp(scanStart + 40_000) }]]))
    }
    await a.handle.syncNow()
    expect(ids()).toEqual([c.id])
    server.tables.get('check_ins')!.set(`${ATHLETE}/${lateA.id}`, {
      key: ATHLETE, id: lateA.id, day: null, body: { ...lateA }, deleted: false, updatedAt: stamp(scanStart - 1000),
    })
    // The cursor is the time that pull began, not C's stamp, so the next pull still reaches A.
    await a.handle.syncNow()
    expect(ids()).toEqual([c.id, lateA.id].sort())
  })

  it('does not read again what lies before the window', async () => {
    const server = fakeServer()
    const a = signIn(server, athleteCtx)
    await a.handle.syncNow()
    const old = checkIn(today() - 3)
    await server.as(athleteCtx).send('check_ins', 'athlete', [row(old)])
    // Stamped well before the window: an incremental pull must not return it. This pins the lower
    // bound; such a row is read on the next visit, which reads everything.
    server.tables.get('check_ins')!.get(`${ATHLETE}/${old.id}`)!.updatedAt = stamp(server.clock.ms - OVERLAP_MS - 5000)
    await a.handle.syncNow()
    expect(ids()).toEqual([])
    signOut()
    const again = signIn(server, athleteCtx)
    await again.handle.syncNow()
    expect(ids()).toEqual([old.id])
  })

  it('leaves the store untouched when a pull brings only rows it already has', async () => {
    const server = fakeServer()
    const a = signIn(server, athleteCtx)
    await a.handle.syncNow()
    await server.as(athleteCtx).send('check_ins', 'athlete', [row(checkIn(today()))])
    for (let i = 0; i < 4; i++) await a.handle.syncNow()
    const settled = useLaree.getState().data
    await a.handle.syncNow()
    expect(useLaree.getState().data).toBe(settled)
  })
})

/** What the backend uses of a Supabase query: a promise of the answer that also takes filters. */
type Query = Promise<{ data: DbRow[]; error: null }> & {
  select(): Query
  order(column: string): Query
  limit(n: number): Query
  gt(column: string, value: string): Query
  or(filter: string): Query
}

describe('the Supabase backend', () => {
  /** A query builder that records what was asked and answers with the given rows. */
  function stubClient(rows: DbRow[], serverNow = '2026-11-11T02:00:40.123456+00:00') {
    const calls: { table: string; filters: string[] }[] = []
    const client = {
      rpc: async (name: string) => (name === 'server_now' ? { data: serverNow, error: null } : { data: null, error: { message: 'no such function' } }),
      from(table: string) {
        const call = { table, filters: [] as string[] }
        calls.push(call)
        // Like the real builder: a promise of the answer that also takes further filters.
        const q: Query = Object.assign(
          Promise.resolve({ data: rows, error: null }),
          {
            select: () => q,
            order: (column: string) => (call.filters.push(`order:${column}`), q),
            limit: (n: number) => (call.filters.push(`limit:${n}`), q),
            gt: (column: string, value: string) => (call.filters.push(`gt:${column}:${value}`), q),
            or: (filter: string) => (call.filters.push(`or:${filter}`), q),
          },
        )
        return q
      },
    }
    return { client: client as never, calls }
  }

  it('asks for rows from the overlap window before the cursor, in key order', async () => {
    const { client, calls } = stubClient([])
    await supabaseBackend(client).pull('check_ins', 'athlete', '2026-11-11T02:00:30.000Z')
    expect(calls[0]?.filters).toEqual(['order:updated_at', 'order:athlete_id', 'order:id', 'limit:1000', 'gt:updated_at:2026-11-11T02:00:00.000Z'])
  })

  it('reads everything on a full pull', async () => {
    const { client, calls } = stubClient([])
    await supabaseBackend(client).pull('workout_templates', 'owner', null)
    expect(calls[0]?.filters).toEqual(['order:updated_at', 'order:owner_id', 'order:id', 'limit:1000'])
  })

  it("gives the server's time", async () => {
    const { client } = stubClient([])
    expect(await supabaseBackend(client).now()).toBe('2026-11-11T02:00:40.123456+00:00')
  })
})

describe('forgetting the queue', () => {
  const op: Op = { table: 'check_ins', scope: 'athlete', key: ATHLETE, id: 'c-1', day: null, body: { id: 'c-1' } }

  it('removes the saved queue and saves nothing afterwards, also when a send was on its way', async () => {
    const store = memoryOutboxStore([op])
    const box = new Outbox(store)
    await box.load()
    let release: () => void = () => undefined
    const sending = box.flush(() => new Promise((resolve) => (release = () => resolve({ ok: false, denied: false, message: 'offline' }))))
    const gone = box.destroy()
    release()
    await Promise.all([sending, gone])
    expect(store.saved).toEqual([])
    await box.add([op])
    expect(store.saved).toEqual([])
  })

  it('says so when the saved queue could not be removed', async () => {
    const inner = memoryOutboxStore([op])
    const box = new Outbox({ load: inner.load, save: async () => Promise.reject(new Error('blocked')) })
    await box.load()
    await expect(box.destroy()).rejects.toThrow('blocked')
  })

  it('reports a save as done only when it covers the newest write', async () => {
    const finish: (() => void)[] = []
    const states: boolean[] = []
    const box = new Outbox({ load: async () => [], save: () => new Promise<void>((resolve) => finish.push(resolve)) })
    box.onSaveState = (saved) => states.push(saved)
    const loaded = box.load()
    await Promise.resolve()
    await Promise.resolve()
    finish.shift()?.()
    await loaded
    states.length = 0
    const first = box.add([op])
    const second = box.add([{ ...op, id: 'c-2' }])
    await Promise.resolve()
    finish.shift()?.()
    await first
    // The first save worked, but the second write is not on the device yet.
    expect(states).toEqual([])
    await Promise.resolve()
    finish.shift()?.()
    await second
    expect(states).toEqual([true])
  })
})
