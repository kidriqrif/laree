import { useMemo } from 'react'

export type RegisterName = 'athlete' | 'coach'

function detect(): RegisterName {
  if (typeof document === 'undefined') return 'athlete'
  const from = document.activeElement?.closest('[data-register]') ?? document.querySelector('[data-register]')
  return from?.getAttribute('data-register') === 'coach' ? 'coach' : 'athlete'
}

/**
 * Overlays render in a portal, outside the shell that carries data-register.
 * This reads the register of the shell the overlay opened from, once per open.
 */
export function useRegister(isOpen: boolean, override?: RegisterName): RegisterName {
  // eslint-disable-next-line react-hooks/exhaustive-deps -- recompute only when the overlay opens
  const detected = useMemo(detect, [isOpen])
  return override ?? detected
}
