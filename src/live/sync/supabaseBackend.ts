/** The sync backend on Supabase: upserts keyed on the owner and the record id, and paged pulls. */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Scope } from './docs.ts'
import type { Backend, PulledRow } from './engine.ts'

const PAGE = 1000
const ownerColumn = (scope: Scope): string => (scope === 'athlete' ? 'athlete_id' : 'owner_id')

/** Refused by the access rules or the table's checks: sending again cannot help. */
const FINAL_CODES = new Set(['42501', '23502', '23503', '23514', '22P02'])

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
      for (let from = 0; ; from += PAGE) {
        let q = client.from(table).select(columns).order('updated_at').order('id').range(from, from + PAGE - 1)
        if (since) q = q.gt('updated_at', since)
        const { data, error } = await q
        if (error) throw new Error(error.message)
        const rows = (data ?? []) as unknown as DbRow[]
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
