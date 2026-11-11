import { lazy, Suspense } from 'react'
import type { AthleteId } from '../../../domain/types.ts'

const FlagDetailDrawer = lazy(() => import('../check-ins/FlagDetailDrawer.tsx'))

export interface FlagDrawerSlotProps {
  athleteId: AthleteId
  flagId: string
  onClose: () => void
}

/** C14 on the athlete summary: the same flag detail as the Check-ins page, loaded when it opens. */
export function FlagDrawerSlot({ athleteId, flagId, onClose }: FlagDrawerSlotProps) {
  return (
    <Suspense fallback={null}>
      <FlagDetailDrawer athleteId={athleteId} flagId={flagId} onClose={onClose} />
    </Suspense>
  )
}
