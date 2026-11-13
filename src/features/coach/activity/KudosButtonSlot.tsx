import type { AthleteId } from '../../../domain/types.ts'
import { KudosComposer } from '../../shared/kudos/KudosComposer.tsx'

export interface KudosButtonSlotProps {
  athleteId: AthleteId
  activityId: string
}

/** The coach's "Send kudos" on an activity, linked to it. */
export function KudosButtonSlot({ athleteId, activityId }: KudosButtonSlotProps) {
  return <KudosComposer athleteId={athleteId} activityId={activityId} />
}
