// Delete my account (docs/dev/backend.md "Privacy"). Removes the caller's activity files, then the
// auth user; every row that belongs to them goes with it (foreign keys cascade from profiles).
// An athlete's data stays theirs: a coach deleting their account removes only the coach's rows.
import { asCaller, asService, cors, reply } from '../_shared/http.ts'

const BUCKET = 'activity-files'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return reply(405, { ok: false, reason: 'method' })

  const { data: who } = await asCaller(req).auth.getUser()
  if (!who.user) return reply(401, { ok: false, reason: 'signed-out' })
  const body = (await req.json().catch(() => null)) as { confirm?: unknown } | null
  if (body?.confirm !== 'DELETE') return reply(400, { ok: false, reason: 'not-confirmed' })

  const service = asService()
  const uid = who.user.id
  // Files first: once the user is gone nothing points at their folder.
  for (;;) {
    const { data: files, error } = await service.storage.from(BUCKET).list(uid, { limit: 1000 })
    if (error) return reply(500, { ok: false, reason: 'files' })
    if (!files || files.length === 0) break
    const { error: removeError } = await service.storage.from(BUCKET).remove(files.map((f) => `${uid}/${f.name}`))
    if (removeError) return reply(500, { ok: false, reason: 'files' })
  }
  const { error } = await service.auth.admin.deleteUser(uid)
  if (error) return reply(500, { ok: false, reason: 'account' })
  return reply(200, { ok: true })
})
