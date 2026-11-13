import { useState } from 'react'
import { useLaree } from '../../../data/store.ts'
import type { AthleteId, DayOffset } from '../../../domain/types.ts'
import { Button } from '../../../ui/core/index.ts'
import { showToast } from '../../../ui/overlay/index.ts'
import { downloadFile } from '../builder/download.ts'

export interface CalendarExportProps {
  athleteId: AthleteId
  weekStartDay: DayOffset
  selectedWorkoutId?: string | undefined
}

/** Calendar header buttons: the selected session or the whole week as an .ics file. */
export function CalendarExport({ athleteId, weekStartDay, selectedWorkoutId }: CalendarExportProps) {
  const [busy, setBusy] = useState<'session' | 'week' | null>(null)

  const run = async (kind: 'session' | 'week') => {
    setBusy(kind)
    try {
      const mod = await import('./icsFiles.ts')
      const data = useLaree.getState().data
      const file =
        kind === 'week'
          ? mod.weekFile(data, athleteId, weekStartDay)
          : selectedWorkoutId
            ? mod.sessionFile(data, selectedWorkoutId)
            : undefined
      if (!file) {
        showToast('That session is no longer in the plan.')
        return
      }
      downloadFile(file)
      showToast(`Saved ${file.fileName}`)
    } finally {
      setBusy(null)
    }
  }

  return (
    <>
      <Button
        variant="secondary"
        isDisabled={!selectedWorkoutId || busy !== null}
        isPending={busy === 'session'}
        aria-describedby={selectedWorkoutId ? undefined : 'cal-export-hint'}
        onPress={() => void run('session')}
      >
        Export session (.ics)
      </Button>
      {selectedWorkoutId ? null : (
        <span id="cal-export-hint" hidden>
          Open a session to export it on its own.
        </span>
      )}
      <Button variant="secondary" isDisabled={busy !== null} isPending={busy === 'week'} onPress={() => void run('week')}>
        Export week (.ics)
      </Button>
    </>
  )
}
