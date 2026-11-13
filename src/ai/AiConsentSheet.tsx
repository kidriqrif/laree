import { useState } from 'react'
import { useLaree } from '../data/store.ts'
import type { AthleteId } from '../domain/types.ts'
import { Button } from '../ui/core/index.ts'
import { Sheet } from '../ui/overlay/index.ts'
import { ConsentCopy } from './ConsentCopy.tsx'
import styles from './ai.module.css'

export interface AiConsentSheetProps {
  athleteId: AthleteId
  isOpen: boolean
  onClose: () => void
  coachOn: boolean
}

/** A9. "Turn on AI summaries?" over Me. */
export default function AiConsentSheet({ athleteId, isOpen, onClose, coachOn }: AiConsentSheetProps) {
  const setAiConsent = useLaree((s) => s.setAiConsent)
  const [error, setError] = useState('')

  const turnOn = () => {
    let ok = false
    try {
      ok = setAiConsent(athleteId, true)
    } catch {
      ok = false
    }
    if (ok) {
      setError('')
      onClose()
    } else {
      setError("Couldn't save your choice, so AI stays off. Try again.")
    }
  }

  return (
    <Sheet
      isOpen={isOpen}
      onOpenChange={(o) => {
        if (!o) {
          setError('')
          onClose()
        }
      }}
      title="Turn on AI summaries?"
      data-testid="ai-consent-sheet"
      footer={
        <div className={styles.actions}>
          <Button onPress={onClose}>Not now</Button>
          <Button variant="primary" onPress={turnOn}>
            Turn on
          </Button>
        </div>
      }
    >
      {coachOn ? (
        <p className={styles.statusLine}>Coach has turned AI on. Turning it on here starts it for you.</p>
      ) : null}
      <ConsentCopy audience="athlete" />
      {error ? (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      ) : null}
    </Sheet>
  )
}
