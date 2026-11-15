/** Turns two versions of the store into the writes that bring the database from one to the other. */
import type { LareeData } from '../../data/store.ts'
import { canWrite, SPECS } from './docs.ts'
import type { Doc, SliceSpec, SyncContext } from './docs.ts'

/** One row write. `body` null means the record was deleted: the row becomes a tombstone. */
export interface Op {
  table: string
  scope: SliceSpec['scope']
  key: string
  id: string
  day: string | null
  body: Record<string, unknown> | null
}

export const opKey = (op: Pick<Op, 'table' | 'key' | 'id'>): string => `${op.table}/${op.key}/${op.id}`

function sameValue(a: unknown, b: unknown): boolean {
  return typeof a === 'object' && typeof b === 'object' ? JSON.stringify(a) === JSON.stringify(b) : a === b
}

function index(docs: readonly Doc[]): Map<string, Doc> {
  return new Map(docs.map((d) => [`${d.key}/${d.id}`, d]))
}

/** The writes for one slice. Only documents this person may write are included. */
export function diffSlice(spec: SliceSpec, prev: LareeData, next: LareeData, ctx: SyncContext): Op[] {
  if (prev[spec.slice] === next[spec.slice]) return []
  const before = index(spec.docs(prev, ctx))
  const after = index(spec.docs(next, ctx))
  const ops: Op[] = []
  const base = { table: spec.table, scope: spec.scope }
  for (const [k, doc] of after) {
    const old = before.get(k)
    if (old?.src === doc.src) continue
    if (!canWrite(spec.writer, doc.key, ctx)) continue
    // Worked out again but the same (after a pull, say): nothing to send.
    if (old && sameValue(old.src, doc.src)) continue
    ops.push({ ...base, key: doc.key, id: doc.id, day: doc.day, body: spec.body(doc) })
  }
  for (const [k, doc] of before) {
    if (after.has(k) || !canWrite(spec.writer, doc.key, ctx)) continue
    ops.push({ ...base, key: doc.key, id: doc.id, day: doc.day, body: null })
  }
  return ops
}

export function diffData(prev: LareeData, next: LareeData, ctx: SyncContext): Op[] {
  return SPECS.flatMap((spec) => diffSlice(spec, prev, next, ctx))
}
