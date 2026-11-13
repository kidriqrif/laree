import { useState } from 'react'
import { useParams } from 'react-router'
import { selectActivityCoachNote } from '../../../data/selectors.ts'
import { useLaree } from '../../../data/store.ts'
import { Button, Card } from '../../../ui/core/index.ts'
import { TextField } from '../../../ui/form/index.ts'
import { useCoachReadOnly } from '../../../app/useCoachReadOnly.ts'
import { ActivityDetail } from '../../shared/activity/ActivityDetail.tsx'
import { KudosButtonSlot } from './KudosButtonSlot.tsx'
import styles from './ActivityPage.module.css'

function NoteField({ activityId }: { activityId: string }) {
  const saved = useLaree((s) => selectActivityCoachNote(s.data, activityId)) ?? ''
  const setNote = useLaree((s) => s.setActivityCoachNote)
  const [draft, setDraft] = useState(saved)
  const dirty = draft.trim() !== saved.trim()
  return (
    <Card as="section" aria-label="Your note on this activity" className={styles.note}>
      <h2 className={styles.h2}>Your note</h2>
      <form
        className={styles.noteRow}
        onSubmit={(e) => {
          e.preventDefault()
          setNote(activityId, draft.trim())
        }}
      >
        <TextField
          className={styles.noteField}
          label="Note for the athlete"
          hint="They see this as Coach's comment. Leave it blank to remove it."
          value={draft}
          onChange={setDraft}
        />
        <Button type="submit" variant="secondary" isDisabled={!dirty}>
          Save note
        </Button>
      </form>
    </Card>
  )
}

/** C17. The shared activity view for the coach, with Send kudos and a coach note. */
export default function ActivityPage() {
  const { activityId = '' } = useParams()
  const activity = useLaree((s) => s.data.activities.find((a) => a.id === activityId))
  const savedNote = useLaree((s) => selectActivityCoachNote(s.data, activityId)) ?? ''
  const readOnly = useCoachReadOnly()
  return (
    <div className={styles.page}>
      <ActivityDetail activityId={activityId} viewer="coach" />
      {activity && !readOnly ? (
        <div className={styles.actions}>
          <KudosButtonSlot athleteId={activity.athleteId} activityId={activity.id} />
          <NoteField key={`${activity.id}:${savedNote}`} activityId={activity.id} />
        </div>
      ) : null}
    </div>
  )
}
