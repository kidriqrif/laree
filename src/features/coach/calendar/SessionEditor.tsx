import { useState } from 'react'
import { Link } from 'react-router'
import { fmtDay, fmtDuration } from '../../../charts/index.ts'
import { useLaree } from '../../../data/store.ts'
import { Button } from '../../../ui/core/index.ts'
import { DurationField, Select, Switch, TextField } from '../../../ui/form/index.ts'
import { ConfirmDialog, Drawer, showUndoToast } from '../../../ui/overlay/index.ts'
import type { Sport } from '../../../domain/types.ts'
import styles from './CalendarPage.module.css'
import { SPORT_OPTIONS, buildPatch, isDirty, latestUndo, sportLabel, undoIfLatest, valuesOf, validate } from './sessionModel.ts'
import type { EditorValues } from './sessionModel.ts'

export interface SessionEditorProps {
  workoutId: string
  /** Under 1024 px: the same details, no edit controls. */
  readOnly: boolean
  onClose: () => void
}

/** The session editor drawer (C4). Loaded on demand. */
export default function SessionEditor({ workoutId, readOnly, onClose }: SessionEditorProps) {
  const workout = useLaree((s) => s.data.planned.find((p) => p.id === workoutId))
  const activity = useLaree((s) => s.data.activities.find((a) => a.matchedWorkoutId === workoutId))
  const [values, setValues] = useState<EditorValues | null>(() => (workout ? valuesOf(workout) : null))
  const [tried, setTried] = useState(false)
  const [asking, setAsking] = useState(false)

  if (!workout || !values) return null
  const original = valuesOf(workout)
  const dirty = isDirty(original, values)
  const errors = validate(values)
  const set = (patch: Partial<EditorValues>) => setValues((v) => (v ? { ...v, ...patch } : v))

  const requestClose = () => {
    if (!readOnly && dirty) setAsking(true)
    else onClose()
  }

  const save = () => {
    setTried(true)
    if (errors.title || errors.duration) return
    const title = values.title.trim()
    useLaree.getState().applyPlanChanges([{ kind: 'update', id: workout.id, patch: buildPatch(workout, values) }], `Edited ${title}`)
    const step = latestUndo()
    showUndoToast(`Saved ${title}.`, () => undoIfLatest(step))
    onClose()
  }

  const remove = () => {
    useLaree.getState().deletePlanned(workout.id)
    const step = latestUndo()
    showUndoToast(`Removed ${workout.title}.`, () => undoIfLatest(step))
    onClose()
  }

  return (
    <>
      <Drawer
        isOpen
        onOpenChange={(open) => {
          if (!open) requestClose()
        }}
        title={workout.title}
        data-testid="session-editor"
        footer={
          readOnly ? (
            <Button variant="secondary" onPress={onClose}>
              Close
            </Button>
          ) : (
            <>
              <Button variant="quiet" onPress={remove}>
                Delete session
              </Button>
              <Button variant="quiet" onPress={requestClose}>
                Cancel
              </Button>
              <Button variant="primary" onPress={save}>
                Save session
              </Button>
            </>
          )
        }
      >
        {readOnly ? (
          <dl className={styles.details}>
            <dt>Sport</dt>
            <dd>{sportLabel(workout.sport)}</dd>
            <dt>Day</dt>
            <dd>{fmtDay(workout.day)}</dd>
            <dt>Duration</dt>
            <dd>{fmtDuration(workout.plannedDurationS)}</dd>
            <dt>Load</dt>
            <dd>{Math.round(workout.plannedLoad)}</dd>
            <dt>Steps</dt>
            <dd>{original.stepsSummary || 'Free session'}</dd>
            <dt>Coach's note</dt>
            <dd>{workout.coachNote ?? 'None'}</dd>
          </dl>
        ) : (
          <div className={styles.form}>
            <TextField
              label="Title"
              value={values.title}
              onChange={(title) => set({ title })}
              error={tried ? errors.title : undefined}
            />
            <Select
              label="Sport"
              options={SPORT_OPTIONS.map((o) => ({ id: o.id, label: o.label }))}
              value={values.sport}
              onChange={(id) => set({ sport: id as Sport })}
            />
            <DurationField
              label="Duration"
              hint="For example 45:00 or 1:15:00"
              value={values.durationS}
              onChange={(seconds) => set({ durationS: seconds ?? 0 })}
              error={tried ? errors.duration : undefined}
            />
            <TextField
              label="Steps summary"
              hint="Changing this replaces the steps with one steady step. Use the Library to build detailed steps."
              value={values.stepsSummary}
              onChange={(stepsSummary) => set({ stepsSummary })}
            />
            <TextField
              label="Coach's note"
              hint="The athlete sees this."
              value={values.note}
              onChange={(note) => set({ note })}
            />
            <Switch label="Key session" isSelected={values.keySession} onChange={(keySession) => set({ keySession })} />
            <p className={styles.formMeta}>
              Load {Math.round(workout.plannedLoad)}, on {fmtDay(workout.day)}.
            </p>
          </div>
        )}
        {activity ? (
          <p className={styles.formMeta}>
            Done: {activity.title}, {fmtDuration(activity.summary.durationS)}.{' '}
            <Link to={`/coach/activity/${activity.id}`}>Open the activity</Link>
          </p>
        ) : null}
      </Drawer>
      <ConfirmDialog
        isOpen={asking}
        onOpenChange={setAsking}
        thing="changes"
        confirmLabel="Discard"
        cancelLabel="Keep editing"
        description="You have unsaved changes to this session."
        onConfirm={onClose}
      />
    </>
  )
}
