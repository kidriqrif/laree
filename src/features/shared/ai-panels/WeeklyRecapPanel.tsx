import { useMemo } from 'react'
import { buildRecapFacts, simulateRecap } from '../../../ai/index.ts'
import { aiActiveFor, currentDay } from '../../../data/selectors.ts'
import { useLaree } from '../../../data/store.ts'
import type { AthleteId, DayOffset } from '../../../domain/types.ts'
import { weekOfDay } from '../../../domain/time.ts'
import { AiTextPanel } from './AiTextPanel.tsx'

export interface WeeklyRecapPanelProps {
  athleteId: AthleteId
  weekStartDay: DayOffset
}

/** The simulated weekly recap. Renders nothing unless the athlete and Coach both consent. */
export function WeeklyRecapPanel({ athleteId, weekStartDay }: WeeklyRecapPanelProps) {
  const data = useLaree((s) => s.data)
  const active = aiActiveFor(data.settings, athleteId)
  const output = useMemo(
    () => (active ? simulateRecap(buildRecapFacts(data, athleteId, weekOfDay(weekStartDay), currentDay())) : null),
    [active, data, athleteId, weekStartDay],
  )
  if (!output) return null
  return <AiTextPanel title="Weekly recap" output={output} />
}
