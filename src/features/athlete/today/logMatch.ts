/**
 * "Log it" hands the log sheet the session to match. The URL holds only `?sheet=log`
 * (IA 9.1); the chosen session is a draft in app state (IA 9.2), so a reload keeps it.
 */
import { useCallback } from 'react'
import { useViewer } from '../../../app/viewer.ts'
import { currentDay } from '../../../data/selectors.ts'
import { useLaree } from '../../../data/store.ts'
import type { AthleteId, DayOffset } from '../../../domain/types.ts'
import { useSheetParam } from '../../../ui/overlay/index.ts'

/** Draft key the log sheet reads for its "Which session?" default. */
export const LOG_MATCH_DRAFT = 'log:match'

export interface LogMatchDraft {
  athleteId: AthleteId
  /** The planned workout to pre-match. */
  workoutId: string
  /** The day the choice was made, so a choice left over from an earlier day can be ignored. */
  chosenOn: DayOffset
}

function isLogMatchDraft(value: unknown): value is LogMatchDraft {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  return typeof v.athleteId === 'string' && typeof v.workoutId === 'string' && typeof v.chosenOn === 'number'
}

/** The pre-matched workout id for this athlete today, if "Log it" chose one. */
export function readLogMatch(
  drafts: Readonly<Record<string, unknown>>,
  athleteId: AthleteId,
  today: DayOffset,
): string | undefined {
  const d = drafts[LOG_MATCH_DRAFT]
  return isLogMatchDraft(d) && d.athleteId === athleteId && d.chosenOn === today ? d.workoutId : undefined
}

/**
 * Opens the log sheet. With a workout id the sheet starts on that session; without one any earlier
 * choice is cleared, so the sheet falls back to its own default (today's session or "Not planned").
 */
export function useOpenLog(): (workoutId?: string) => void {
  const sheet = useSheetParam('log')
  const athleteId = useViewer((s) => s.athleteId)
  const setDraft = useLaree((s) => s.setDraft)
  const clearDraft = useLaree((s) => s.clearDraft)
  const { open } = sheet
  return useCallback(
    (workoutId?: string) => {
      if (workoutId) {
        const draft: LogMatchDraft = { athleteId, workoutId, chosenOn: currentDay() }
        setDraft(LOG_MATCH_DRAFT, draft)
      } else {
        clearDraft(LOG_MATCH_DRAFT)
      }
      open()
    },
    [athleteId, setDraft, clearDraft, open],
  )
}
