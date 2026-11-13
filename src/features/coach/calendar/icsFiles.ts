/** Loaded on demand by the calendar export, so the .ics writer stays out of the page bundle. */
import type { LareeData } from '../../../data/store.ts'
import { now } from '../../../domain/time.ts'
import type { AthleteId, DayOffset } from '../../../domain/types.ts'
import { sessionIcs, weekIcs } from '../../../io/export/ics.ts'
import type { ExportFile } from '../../../io/export/common.ts'
import { ATHLETES } from '../../../app/people.ts'
import { thresholdsFor } from '../builder/TargetPreview.tsx'

function athleteOf(id: AthleteId) {
  return { id, name: ATHLETES.find((a) => a.id === id)?.name ?? id }
}

/** Absolute link to the athlete's workout page, built from the address the app is served at. */
function workoutLink(id: string): string | undefined {
  try {
    return `${location.origin}${location.pathname}#/athlete/workout/${encodeURIComponent(id)}`
  } catch {
    return undefined
  }
}

export function weekFile(data: LareeData, athleteId: AthleteId, weekStart: DayOffset): ExportFile {
  return weekIcs({
    athlete: athleteOf(athleteId),
    weekStart,
    sessions: data.planned.filter((p) => p.athleteId === athleteId),
    races: data.races.filter((r) => r.athleteId === athleteId),
    thresholdsOn: (day) => thresholdsFor(data, athleteId, day),
    linkOf: (s) => workoutLink(s.id),
    now: now(),
  })
}

export function sessionFile(data: LareeData, workoutId: string): ExportFile | undefined {
  const session = data.planned.find((p) => p.id === workoutId)
  if (!session) return undefined
  return sessionIcs({
    athlete: athleteOf(session.athleteId),
    session,
    thresholds: thresholdsFor(data, session.athleteId, session.day),
    ...(workoutLink(session.id) ? { link: workoutLink(session.id) as string } : {}),
    now: now(),
  })
}
