import { useState } from 'react'
import { PEOPLE } from '../../../app/people.ts'
import { currentDay } from '../../../data/selectors.ts'
import { useLaree } from '../../../data/store.ts'
import type { AthleteId } from '../../../domain/types.ts'
import { Button } from '../../../ui/core/index.ts'
import { Select as SelectField, TextField } from '../../../ui/form/index.ts'
import { Popover, PopoverTrigger, showToast } from '../../../ui/overlay/index.ts'
import styles from './KudosComposer.module.css'

export const KUDOS_MAX = 140
const NONE = 'none'

export interface KudosComposerProps {
  athleteId: AthleteId
  /** Fixes the linked activity. Without it, the coach may pick one from the last fortnight. */
  activityId?: string
  label?: string
}

/** C16. "Send kudos" with a popover: an optional activity, a short message and Send. */
export function KudosComposer({ athleteId, activityId, label = 'Send kudos' }: KudosComposerProps) {
  const name = PEOPLE.find((p) => p.id === athleteId)?.name ?? 'the athlete'
  const [open, setOpen] = useState(false)
  return (
    <PopoverTrigger isOpen={open} onOpenChange={setOpen}>
      <Button variant="secondary">{label}</Button>
      <Popover aria-label={`Send kudos to ${name}`} placement="bottom start">
        <Form athleteId={athleteId} name={name} fixed={activityId} close={() => setOpen(false)} />
      </Popover>
    </PopoverTrigger>
  )
}

function Form({ athleteId, name, fixed, close }: { athleteId: AthleteId; name: string; fixed: string | undefined; close: () => void }) {
  const activities = useLaree((s) => s.data.activities)
  const sendKudos = useLaree((s) => s.sendKudos)
  const [pick, setPick] = useState(NONE)
  const [message, setMessage] = useState('')
  const today = currentDay()
  const recent = activities
    .filter((a) => a.athleteId === athleteId && a.day <= today && a.day > today - 14)
    .toSorted((a, b) => b.day - a.day)
  const linkedId = fixed ?? (pick === NONE ? undefined : pick)
  const linked = linkedId === undefined ? undefined : activities.find((a) => a.id === linkedId)

  const send = () => {
    sendKudos({ athleteId, ...(linkedId === undefined ? {} : { activityId: linkedId }), message })
    showToast(`Kudos sent to ${name}.`)
    close()
  }

  return (
    <form
      className={styles.form}
      onSubmit={(e) => {
        e.preventDefault()
        send()
      }}
    >
      <h2 className={styles.heading}>Kudos for {name}</h2>
      {fixed === undefined ? (
        <SelectField
          label="Activity (optional)"
          value={pick}
          onChange={setPick}
          options={[{ id: NONE, label: 'The week as a whole' }, ...recent.map((a) => ({ id: a.id, label: a.title }))]}
        />
      ) : (
        <p className={styles.linked}>On {linked?.title ?? 'this activity'}</p>
      )}
      <TextField
        label="Message (optional)"
        value={message}
        onChange={setMessage}
        maxLength={KUDOS_MAX}
        hint={`${KUDOS_MAX - message.length} characters left`}
      />
      <div className={styles.actions}>
        <Button variant="quiet" onPress={close}>
          Cancel
        </Button>
        <Button variant="primary" type="submit">
          Send
        </Button>
      </div>
    </form>
  )
}
