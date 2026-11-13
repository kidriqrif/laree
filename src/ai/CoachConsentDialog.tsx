import { useState } from 'react'
import { ATHLETES } from '../app/people.ts'
import { useLaree } from '../data/store.ts'
import type { AthleteId } from '../domain/types.ts'
import { Button } from '../ui/core/index.ts'
import { Dialog } from '../ui/overlay/index.ts'
import { aiStateFor, coachRowLabel, WITHDRAWAL_UNSAVED } from './consent.ts'
import { ConsentCopy } from './ConsentCopy.tsx'
import styles from './ai.module.css'

export interface CoachConsentDialogProps {
  athleteId: AthleteId
  isOpen: boolean
  onClose: () => void
}

/** C20. "Turn on AI features?" The coach layer covers the team; it never turns an athlete on. */
export default function CoachConsentDialog({ athleteId, isOpen, onClose }: CoachConsentDialogProps) {
  const settings = useLaree((s) => s.data.settings)
  const setAiConsent = useLaree((s) => s.setAiConsent)
  const [error, setError] = useState('')
  const coachOn = settings.coach.aiConsent
  // Off in memory but not saved anywhere: the only useful action is to try saving the withdrawal again.
  const unsaved = useLaree((s) => s.aiUnsavedOwners.includes('coach')) && !coachOn

  const save = (on: boolean) => {
    let ok = false
    try {
      ok = setAiConsent('coach', on)
    } catch {
      ok = false
    }
    if (ok && !on && useLaree.getState().aiUnsavedOwners.includes('coach')) {
      // Off in memory only: stay open and say so, instead of closing as if it were saved.
      setError(WITHDRAWAL_UNSAVED)
    } else if (ok) {
      setError('')
      onClose()
    } else {
      setError("Couldn't save your choice, so the setting is unchanged. Try again.")
    }
  }

  return (
    <Dialog
      isOpen={isOpen}
      onOpenChange={(o) => {
        if (!o) {
          setError('')
          onClose()
        }
      }}
      title={unsaved ? 'AI is off, but not saved' : coachOn ? 'Turn off AI features?' : 'Turn on AI features?'}
      data-testid="ai-consent-dialog"
      footer={
        <div className={styles.actions}>
          <Button onPress={onClose}>{unsaved ? 'Close' : coachOn ? 'Cancel' : 'Not now'}</Button>
          {unsaved ? (
            <Button variant="primary" onPress={() => save(false)}>
              Try saving again
            </Button>
          ) : (
            <Button variant={coachOn ? 'secondary' : 'primary'} onPress={() => save(!coachOn)}>
              {coachOn ? 'Turn off' : 'Turn on'}
            </Button>
          )}
        </div>
      }
    >
      <ConsentCopy audience="coach" />
      <ul className={styles.rows} aria-label="Athlete consent">
        {ATHLETES.map((a) => {
          const state = aiStateFor(settings, a.id)
          return (
            <li key={a.id} className={styles.row} data-current={a.id === athleteId ? 'true' : undefined}>
              <span>{a.name}</span>
              <span>
                {settings[a.id].aiConsent ? 'Athlete has agreed' : 'Athlete has not agreed'}
                {' · '}
                {coachRowLabel(state)}
              </span>
            </li>
          )
        })}
      </ul>
      {error || unsaved ? (
        <p role="alert" className={styles.error}>
          {error || WITHDRAWAL_UNSAVED}
        </p>
      ) : null}
    </Dialog>
  )
}
