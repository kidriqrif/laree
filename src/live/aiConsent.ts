/**
 * An athlete's AI switch is also a consent (docs/spec/ai.md). The server checks the consents table,
 * so each change of the switch is written there as a new row. Idempotent: a row is added only
 * when the latest answer differs, so a reload or a pull never adds one.
 */
import { useLaree } from '../data/store.ts'
import { CONSENT_VERSION } from './account.ts'
import { supabase } from './session.ts'

async function record(uid: string, granted: boolean): Promise<void> {
  const db = supabase()
  const { data } = await db
    .from('consents')
    .select('granted')
    .eq('user_id', uid)
    .eq('purpose', 'ai')
    .order('at', { ascending: false })
    .order('id', { ascending: false })
    .limit(1)
  const latest = (data?.[0] as { granted?: boolean } | undefined)?.granted ?? false
  if (latest !== granted) await db.from('consents').insert({ purpose: 'ai', granted, text_version: CONSENT_VERSION })
}

/** Follow the signed-in athlete's AI switch. Returns a stop function. */
export function followAiConsent(uid: string): () => void {
  let last = useLaree.getState().data.settings[uid]?.aiConsent === true
  void record(uid, last).catch(() => undefined)
  return useLaree.subscribe((s) => {
    const now = s.data.settings[uid]?.aiConsent === true
    if (now === last) return
    last = now
    void record(uid, now).catch(() => undefined)
  })
}
