import { useState } from 'react'
import { ATHLETES } from '../app/people.ts'
import { useLaree } from '../data/store.ts'
import type { AthleteId } from '../domain/types.ts'
import { Button } from '../ui/core/index.ts'
import { Dialog } from '../ui/overlay/index.ts'
import { aiStateFor, coachRowLabel } from './consent.ts'
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

  const save = (on: boolean) => {
    let ok = false
    try {
      ok = setAiConsent('coach', on)
    } catch {
      ok = false
    }
    if (ok) {
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
      title={coachOn ? 'Turn off AI features?' : 'Turn on AI features?'}
      data-testid="ai-consent-dialog"
      footer={
        <div className={styles.actions}>
          <Button onPress={onClose}>{coachOn ? 'Cancel' : 'Not now'}</Button>
          <Button variant={coachOn ? 'secondary' : 'primary'} onPress={() => save(!coachOn)}>
            {coachOn ? 'Turn off' : 'Turn on'}
          </Button>
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
      {error ? (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      ) : null}
    </Dialog>
  )
}
