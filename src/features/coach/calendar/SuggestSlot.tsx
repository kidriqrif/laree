import { lazy, Suspense, useState } from 'react'
import { useCoachReadOnly } from '../../../app/useCoachReadOnly.ts'
import { aiActiveFor, currentDay } from '../../../data/selectors.ts'
import { useLaree } from '../../../data/store.ts'
import { weekRange, weekOfDay } from '../../../domain/time.ts'
import type { AthleteId, DayOffset } from '../../../domain/types.ts'
import { Button } from '../../../ui/core/index.ts'

const SuggestDrawer = lazy(() => import('./SuggestDrawer.tsx'))

export interface SuggestSlotProps {
  athleteId: AthleteId
  weekStartDay: DayOffset
}

/**
 * C5 entry: "Suggest next week". Nothing renders without active consent, on narrow screens, or when
 * the calendar is not showing the week before the one being planned (the suggestion is always for
 * the week after today's).
 */
export function SuggestSlot({ athleteId, weekStartDay }: SuggestSlotProps) {
  const active = useLaree((s) => aiActiveFor(s.data.settings, athleteId))
  const readOnly = useCoachReadOnly()
  const [open, setOpen] = useState(false)
  if (!active || readOnly) return null
  if (weekRange(weekOfDay(currentDay()) + 1).firstDay !== weekStartDay) return null
  return (
    <>
      <Button variant="secondary" onPress={() => setOpen(true)}>
        Suggest next week
      </Button>
      {open ? (
        <Suspense fallback={null}>
          <SuggestDrawer athleteId={athleteId} onClose={() => setOpen(false)} />
        </Suspense>
      ) : null}
    </>
  )
}
