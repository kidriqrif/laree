/** "Download my data" and "Delete my account" (docs/dev/backend.md "Privacy"). */
import type { Account } from './account.ts'
import { aiConsentRecorded } from './aiConsent.ts'
import { clearPolishedCache } from './aiText.ts'
import { dropWaitingFiles, sendWaitingFiles, waitingFileNames } from './files.ts'
import { useAccount } from './account.ts'
import { AI_LEFT, discardUnsent, signOut, supabase } from './session.ts'
import { SPECS } from './sync/docs.ts'
import { supabaseBackend } from './sync/supabaseBackend.ts'

const BUCKET = 'activity-files'
const PAGE = 1000

/** Every activity file name in this person's folder, page by page. */
async function fileNames(uid: string): Promise<string[]> {
  const names: string[] = []
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await supabase().storage.from(BUCKET).list(uid, { limit: PAGE, offset })
    if (error) throw new Error(error.message)
    names.push(...(data ?? []).map((f) => f.name))
    if ((data ?? []).length < PAGE) return names
  }
}

export const CONSENT_NOT_RECORDED = 'Your latest AI choice has not reached the server yet. Check your connection and try again.'

/**
 * Everything Laree holds about this person, as one JSON file. A coach's athletes' rows are theirs,
 * not included. Any failed read fails the export, so a file is never incomplete without saying so.
 *
 * Two things travel apart from the sync queue, so "nothing waiting to sync" does not cover them:
 * the AI answer in the consent history, and original activity files. The export waits for the
 * first, and names the files that are still only on this device.
 */
export async function exportMyData(account: Account): Promise<Blob> {
  if (!(await aiConsentRecorded(account.uid))) throw new Error(CONSENT_NOT_RECORDED)
  await sendWaitingFiles(account.uid)
  // Rejects when the device's file queue cannot be read: the file must not say nothing is waiting.
  const waiting = await waitingFileNames(account.uid)
  const db = supabase()
  const backend = supabaseBackend(db)
  const records: Record<string, unknown[]> = {}
  for (const spec of SPECS) {
    const rows = await backend.pull(spec.table, spec.scope, null)
    const mine = rows.filter((r) => r.key === account.uid && !r.deleted).map((r) => ({ id: r.id, day: r.day, ...r.body }))
    if (mine.length > 0) records[spec.table] = [...(records[spec.table] ?? []), ...mine]
  }
  const [consents, links, files] = await Promise.all([
    db.from('consents').select('purpose, granted, text_version, at').eq('user_id', account.uid).order('at'),
    db.from('coach_athletes').select('coach_id, athlete_id, status, ai_access, started_at, ended_at'),
    fileNames(account.uid),
  ])
  for (const r of [consents, links]) if (r.error) throw new Error(r.error.message)
  const doc = {
    exportedAt: new Date().toISOString(),
    email: account.email,
    profile: account.profile,
    consents: consents.data ?? [],
    coachLinks: links.data ?? [],
    activityFiles: files,
    // Kept on this device and not uploaded yet: offline, or the upload did not succeed.
    activityFilesNotUploaded: waiting,
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

const DATA_LEFT = "Some unsent data could not be removed from this device: clear this site's data in your browser settings."

/**
 * Delete the account on the server, then clear this device: the AI wording, the unsent queue and
 * the waiting files of this account. Returns an error message, or null. A failed deletion keeps
 * everything as it was. If something could not be removed from the device, the person is told.
 */
export async function deleteMyAccount(): Promise<string | null> {
  const { data: who } = await supabase().auth.getSession()
  const uid = who.session?.user.id
  const { data, error } = await supabase().functions.invoke('delete-account', { body: { confirm: 'DELETE' } })
  if (error || !(data as { ok?: boolean } | null)?.ok) return 'Your account could not be deleted. Try again, or contact the owner.'
  let left = !(await clearPolishedCache())
  if (uid) {
    // The sync stops first: a send on its way must not save the queue again after it is removed.
    await discardUnsent(uid).catch(() => {
      left = true
    })
    if (!(await dropWaitingFiles(uid))) left = true
  }
  const signOutError = await signOut()
  // Sign-out clears the AI wording once more and says so when that failed: keep the warning.
  if (useAccount.getState().notice === AI_LEFT) left = true
  if (signOutError)
    return `Your account was deleted, but this device could not sign out. Reload the page.${left ? ` ${DATA_LEFT}` : ''} (${signOutError})`
  // This screen closes with the sign-out, so the sign-in screen carries the message.
  useAccount.setState({
    notice: left ? `Your account is deleted. ${DATA_LEFT}` : 'Your account and your data are deleted.',
  })
  return null
}
