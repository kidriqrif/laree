import { useSyncExternalStore } from 'react'

/** Coach screens are read-only under 1024 px (IA 4.4). */
export const COACH_READ_ONLY_QUERY = '(max-width: 1023px)'

function subscribe(onChange: () => void): () => void {
  const m = typeof window === 'undefined' ? undefined : window.matchMedia?.(COACH_READ_ONLY_QUERY)
  m?.addEventListener('change', onChange)
  return () => m?.removeEventListener('change', onChange)
}

const snapshot = (): boolean => (typeof window === 'undefined' ? false : (window.matchMedia?.(COACH_READ_ONLY_QUERY).matches ?? false))

/**
 * True when the screen is narrower than 1024 px. A coach screen then hides drag and drop, the
 * builder's editing, the phase slider and every form, and shows the same data as a read-only stack.
 * It follows the window as it is resized.
 */
export function useCoachReadOnly(): boolean {
  return useSyncExternalStore(subscribe, snapshot, () => false)
}
