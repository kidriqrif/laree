/** The sync backend on Supabase: upserts keyed on the owner and the record id, and keyset-paged pulls. */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Scope } from './docs.ts'
import type { Backend, PulledRow } from './engine.ts'

const PAGE = 1000
/**
 * `updated_at` is the time a write's transaction began, not when it committed. A write that began
 * before the newest row we hold can commit after we read it. So every incremental pull re-reads a
 * short window before its cursor; the engine skips the rows it already has. The window is well
 * above the API's statement timeout, the longest a write can stay open.
 */
const OVERLAP_MS = 30_000

export const ownerColumn = (scope: Scope): 'athlete_id' | 'owner_id' => (scope === 'athlete' ? 'athlete_id' : 'owner_id')

/** Refused by the access rules or the table's checks: sending again cannot help. */
const FINAL_CODES = new Set(['42501', '23502', '23503', '23505', '23514', '22P02'])

export interface DbRow {
  athlete_id?: string
  owner_id?: string
  id: string
  day?: string | null
  body: Record<string, unknown>
  updated_at: string
  deleted_at: string | null
}

/** Where a page ended: the full sort key, so two rows never share a position. */
export interface PageEnd {
  at: string
  key: string
  id: string
}

const quoted = (value: string): string => `"${value.replace(/[\\"]/g, '\\$&')}"`

/** The PostgREST filter for "rows after this one", in (updated_at, owner, id) order. */
export function afterFilter(owner: string, end: PageEnd): string {
  const at = quoted(end.at)
  const key = quoted(end.key)
  return [
    `updated_at.gt.${at}`,
    `and(updated_at.eq.${at},${owner}.gt.${key})`,
    `and(updated_at.eq.${at},${owner}.eq.${key},id.gt.${quoted(end.id)})`,
  ].join(',')
}

/** The start of an incremental pull: the cursor less the overlap window. */
export function overlapStart(since: string): string {
  const t = Date.parse(since)
  return Number.isNaN(t) ? since : new Date(t - OVERLAP_MS).toISOString()
}

/**
 * Read pages until one comes back short. Each page starts after the last row of the one before,
 * by the full sort key, so a row updated during the pull moves to the end and is read again
 * instead of shifting an unread row out of reach. `cancelled` is asked before every page.
 */
export async function readPages(
  owner: 'athlete_id' | 'owner_id',
  fetchPage: (after: PageEnd | null, limit: number) => Promise<DbRow[]>,
  cancelled: () => boolean = () => false,
  pageSize = PAGE,
): Promise<PulledRow[]> {
  const out: PulledRow[] = []
  let after: PageEnd | null = null
  for (;;) {
    if (cancelled()) throw new Error('Sync stopped')
    const rows = await fetchPage(after, pageSize)
    for (const r of rows) {
      out.push({
        key: String(r[owner]),
        id: r.id,
        day: r.day ?? null,
        body: r.body,
        deleted: r.deleted_at !== null,
        updatedAt: r.updated_at,
      })
    }
    const last = rows[rows.length - 1]
    if (!last || rows.length < pageSize) return out
    after = { at: last.updated_at, key: String(last[owner]), id: last.id }
  }
}

export function supabaseBackend(client: SupabaseClient): Backend {
  return {
    async send(table, scope, ops) {
      const owner = ownerColumn(scope)
      const now = new Date().toISOString()
      const rows = ops.map((o) => ({
        [owner]: o.key,
        id: o.id,
        ...(scope === 'athlete' ? { day: o.day } : {}),
        body: o.body ?? {},
        deleted_at: o.body === null ? now : null,
      }))
      const { error } = await client.from(table).upsert(rows, { onConflict: `${owner},id` })
      if (!error) return { ok: true }
      return { ok: false, denied: FINAL_CODES.has(error.code), message: error.message }
    },

    pull(table, scope, since, cancelled) {
      const owner = ownerColumn(scope)
      const columns = `${owner}, id, ${scope === 'athlete' ? 'day, ' : ''}body, updated_at, deleted_at`
      const from = since ? overlapStart(since) : null
      return readPages(
        owner,
        async (after, limit) => {
          let q = client.from(table).select(columns).order('updated_at').order(owner).order('id').limit(limit)
          if (after) q = q.or(afterFilter(owner, after))
          else if (from) q = q.gt('updated_at', from)
          const { data, error } = await q
          if (error) throw new Error(error.message)
          return (data ?? []) as unknown as DbRow[]
        },
        cancelled,
      )
    },
  }
}
