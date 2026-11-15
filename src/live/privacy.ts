/** "Download my data" and "Delete my account" (docs/dev/backend.md "Privacy"). */
import type { Account } from './account.ts'
import { signOut, supabase } from './session.ts'
import { SPECS } from './sync/docs.ts'
import { supabaseBackend } from './sync/supabaseBackend.ts'

/** Everything Laree holds about this person, as one JSON file. A coach's athletes' rows are theirs, not included. */
export async function exportMyData(account: Account): Promise<Blob> {
  const db = supabase()
  const backend = supabaseBackend(db)
  const records: Record<string, unknown[]> = {}
  for (const spec of SPECS) {
    const rows = await backend.pull(spec.table, spec.scope, null)
    const mine = rows.filter((r) => r.key === account.uid && !r.deleted).map((r) => ({ id: r.id, day: r.day, ...r.body }))
    if (mine.length > 0) records[spec.table] = mine
  }
  const [consents, links, files] = await Promise.all([
    db.from('consents').select('purpose, granted, text_version, at').eq('user_id', account.uid).order('at'),
    db.from('coach_athletes').select('coach_id, athlete_id, status, ai_access, started_at, ended_at'),
    db.storage.from('activity-files').list(account.uid, { limit: 1000 }),
  ])
  const doc = {
    exportedAt: new Date().toISOString(),
    email: account.email,
    profile: account.profile,
    consents: consents.data ?? [],
    coachLinks: links.data ?? [],
    activityFiles: (files.data ?? []).map((f) => f.name),
    records,
  }
  return new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' })
}

export function saveBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.append(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

/** Delete the account on the server, then clear this device. Returns an error message, or null. */
export async function deleteMyAccount(): Promise<string | null> {
  const { data, error } = await supabase().functions.invoke('delete-account', { body: { confirm: 'DELETE' } })
  if (error || !(data as { ok?: boolean } | null)?.ok) return 'Your account could not be deleted. Try again, or contact the owner.'
  await signOut()
  return null
}
