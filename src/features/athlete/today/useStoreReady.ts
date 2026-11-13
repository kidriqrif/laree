import { useEffect, useState, useSyncExternalStore } from 'react'
import { useLaree } from '../../../data/store.ts'

/** IA 8.4: nothing shows for waits under 300 ms. */
export const QUIET_WAIT_MS = 300

export type StoreReadiness = 'ready' | 'waiting' | 'slow'

function subscribe(onChange: () => void): () => void {
  const offStart = useLaree.persist.onHydrate(onChange)
  const offEnd = useLaree.persist.onFinishHydration(onChange)
  return () => {
    offStart()
    offEnd()
  }
}

const hydrated = (): boolean => useLaree.persist.hasHydrated()

/**
 * Whether the saved data has been read. Device storage is read at once, so this is nearly always
 * `ready`; `slow` means the wait has passed 300 ms and a placeholder may show.
 */
export function useStoreReady(): StoreReadiness {
  const ready = useSyncExternalStore(subscribe, hydrated, () => true)
  const [slow, setSlow] = useState(false)
  useEffect(() => {
    if (ready) return
    const t = setTimeout(() => setSlow(true), QUIET_WAIT_MS)
    return () => clearTimeout(t)
  }, [ready])
  if (ready) return 'ready'
  return slow ? 'slow' : 'waiting'
}
