import { useMemo } from 'react'
import { buildCheckInFacts, simulateCheckIn } from '../../../ai/index.ts'
import { aiActiveFor } from '../../../data/selectors.ts'
import { useLaree } from '../../../data/store.ts'
import type { AthleteId, DayOffset } from '../../../domain/types.ts'
import { AiTextPanel } from './AiTextPanel.tsx'

export interface CheckInSummaryPanelProps {
  athleteId: AthleteId
  day: DayOffset
}

/** The simulated check-in summary as of that day. Renders nothing unless both consents are on. */
export function CheckInSummaryPanel({ athleteId, day }: CheckInSummaryPanelProps) {
  const data = useLaree((s) => s.data)
  const active = aiActiveFor(data.settings, athleteId)
  const output = useMemo(
    () => (active ? simulateCheckIn(buildCheckInFacts(data, athleteId, day)) : null),
    [active, data, athleteId, day],
  )
  if (!output) return null
  return <AiTextPanel title="Check-in summary" output={output} />
}
