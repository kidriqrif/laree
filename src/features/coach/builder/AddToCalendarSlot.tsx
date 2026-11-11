import { useMemo, useState } from 'react'
import { ATHLETES, isAthleteId } from '../../../app/people.ts'
import type { AthleteId } from '../../../app/people.ts'
import { useViewer } from '../../../app/viewer.ts'
import { currentDay } from '../../../data/selectors.ts'
import { useLaree } from '../../../data/store.ts'
import { dateToDay, dayToIso } from '../../../domain/time.ts'
import type { PlannedWorkout, WorkoutTemplate } from '../../../domain/types.ts'
import { Button } from '../../../ui/core/index.ts'
import { SegmentedControl, TextField } from '../../../ui/form/index.ts'
import { Dialog, showUndoToast } from '../../../ui/overlay/index.ts'
import { undoIfLatest } from '../calendar/sessionModel.ts'
import styles from './ExportDialogs.module.css'

export interface AddToCalendarSlotProps {
  template: WorkoutTemplate
}

/** A planned session built from a template, with an id no other session uses. */
export function sessionFromTemplate(
  template: WorkoutTemplate,
  planned: readonly PlannedWorkout[],
  athleteId: AthleteId,
  day: number,
): PlannedWorkout {
  const same = planned.filter((p) => p.athleteId === athleteId && p.day === day)
  let n = same.length + 1
  let id = `pw-${athleteId}-${day}-${n}`
  while (planned.some((p) => p.id === id)) id = `pw-${athleteId}-${day}-${++n}`
  const w: PlannedWorkout = {
    id,
    athleteId,
    day,
    order: same.reduce((m, p) => Math.max(m, p.order + 1), 0),
    sport: template.sport,
    title: template.name.trim() === '' ? 'Workout' : template.name,
    steps: structuredClone(template.steps),
    plannedDurationS: template.estimatedDurationS,
    plannedLoad: template.estimatedLoad,
    keySession: false,
  }
  if (template.estimatedDistanceM !== undefined) w.plannedDistanceM = template.estimatedDistanceM
  if (template.id && template.id !== 'new') w.sourceTemplateId = template.id
  return w
}

/** C11: pick an athlete and a day, then copy the workout into that athlete's plan. */
export function AddToCalendarSlot({ template }: AddToCalendarSlotProps) {
  const today = currentDay()
  const coachAthlete = useViewer((s) => s.coachAthleteId)
  const planned = useLaree((s) => s.data.planned)
  const applyPlanChanges = useLaree((s) => s.applyPlanChanges)
  const [open, setOpen] = useState(false)
  const [athleteId, setAthleteId] = useState<AthleteId>(coachAthlete)
  const [date, setDate] = useState(() => dayToIso(today))
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(date)
  const day = valid ? dateToDay(date) : Number.NaN
  const past = valid && day < today
  const invalid = !valid
  const existing = useMemo(
    () => (valid ? planned.filter((p) => p.athleteId === athleteId && p.day === day) : []),
    [planned, athleteId, day, valid],
  )
  const name = ATHLETES.find((a) => a.id === athleteId)?.name ?? ''

  const add = () => {
    if (invalid || past) return
    const w = sessionFromTemplate(template, planned, athleteId, day)
    applyPlanChanges([{ kind: 'add', workout: w }], `Added ${w.title}`)
    const depth = useLaree.getState().undoStack.length
    setOpen(false)
    showUndoToast(`Added ${w.title} to ${name}'s plan on ${date}.`, () => undoIfLatest(depth))
  }

  return (
    <>
      <Button
        variant="secondary"
        onPress={() => {
          setAthleteId(coachAthlete)
          setOpen(true)
        }}
      >
        Add to calendar
      </Button>
      <Dialog
        isOpen={open}
        onOpenChange={setOpen}
        title="Add to calendar"
        data-testid="add-to-calendar"
        footer={
          <div className={styles.footer}>
            <Button variant="quiet" onPress={() => setOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" isDisabled={invalid || past} onPress={add}>
              Add
            </Button>
          </div>
        }
      >
        <div className={styles.body}>
          <SegmentedControl
            aria-label="Athlete"
            value={athleteId}
            onChange={(id) => {
              if (isAthleteId(id)) setAthleteId(id)
            }}
            options={ATHLETES.map((a) => ({ id: a.id, label: a.name }))}
          />
          <TextField
            label="Day"
            type="date"
            value={date}
            onChange={setDate}
            error={past ? 'Pick today or a later day.' : invalid ? 'Pick a day.' : undefined}
            hint="Weeks start on Monday."
          />
          {existing.length === 0 ? (
            <p className={styles.note}>Nothing planned on this day.</p>
          ) : (
            <ul className={styles.existing} aria-label="Already planned">
              {existing.map((p) => (
                <li key={p.id}>{p.title}</li>
              ))}
            </ul>
          )}
        </div>
      </Dialog>
    </>
  )
}
