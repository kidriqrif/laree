import { useSyncExternalStore } from 'react'

/**
 * Coach screens are read-only on a narrow touch screen (IA 4.4). Width alone is not enough: a
 * desktop zoomed to 200% is narrow too, and its mouse and keyboard can still plan and edit.
 * CoachShell.module.css shows the read-only note on the same condition.
 */
export const COACH_READ_ONLY_QUERY = '(max-width: 1023px) and (pointer: coarse)'

function subscribe(onChange: () => void): () => void {
  const m = typeof window === 'undefined' ? undefined : window.matchMedia?.(COACH_READ_ONLY_QUERY)
  m?.addEventListener('change', onChange)
  return () => m?.removeEventListener('change', onChange)
}

const snapshot = (): boolean => (typeof window === 'undefined' ? false : (window.matchMedia?.(COACH_READ_ONLY_QUERY).matches ?? false))

/**
 * True when the screen is narrower than 1024 px and the main pointer is a finger. A coach screen
 * then hides drag and drop, the builder's editing, the phase slider and every form, and shows the
 * same data as a read-only stack. It follows the window as it is resized.
 */
export function useCoachReadOnly(): boolean {
  return useSyncExternalStore(subscribe, snapshot, () => false)
}
