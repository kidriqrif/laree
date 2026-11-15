/** The sync backend on Supabase: upserts keyed on the owner and the record id, and paged pulls. */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Scope } from './docs.ts'
import type { Backend, PulledRow } from './engine.ts'

const PAGE = 1000
const ownerColumn = (scope: Scope): string => (scope === 'athlete' ? 'athlete_id' : 'owner_id')

/** Refused by the access rules or the table's checks: sending again cannot help. */
const FINAL_CODES = new Set(['42501', '23502', '23503', '23505', '23514', '22P02'])

interface DbRow {
  athlete_id?: string
  owner_id?: string
  id: string
  day?: string | null
  body: Record<string, unknown>
  updated_at: string
  deleted_at: string | null
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

    async pull(table, scope, since) {
      const owner = ownerColumn(scope)
      const columns = `${owner}, id, ${scope === 'athlete' ? 'day, ' : ''}body, updated_at, deleted_at`
      const out: PulledRow[] = []
      // Keyset pages: each page starts after the last row read. A row updated during the pull moves
      // to the end and is read again, instead of shifting an unread row out of reach.
      let after: { at: string; id: string } | null = null
      for (;;) {
        let q = client.from(table).select(columns).order('updated_at').order('id').limit(PAGE)
        if (after) q = q.or(`updated_at.gt."${after.at}",and(updated_at.eq."${after.at}",id.gt."${after.id}")`)
        else if (since) q = q.gt('updated_at', since)
        const { data, error } = await q
        if (error) throw new Error(error.message)
        const rows = (data ?? []) as unknown as DbRow[]
        const last = rows[rows.length - 1]
        if (last) after = { at: last.updated_at, id: last.id }
        for (const r of rows) {
          out.push({
            key: String(r[owner as 'athlete_id' | 'owner_id']),
            id: r.id,
            day: r.day ?? null,
            body: r.body,
            deleted: r.deleted_at !== null,
            updatedAt: r.updated_at,
          })
        }
        if (rows.length < PAGE) return out
      }
    },
  }
}
