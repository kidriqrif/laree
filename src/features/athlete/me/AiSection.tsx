import { lazy, Suspense, useState } from 'react'
import { aiStateOf, athleteStatusLine, WITHDRAWAL_UNSAVED } from '../../../ai/consent.ts'
import { useLaree } from '../../../data/store.ts'
import type { AthleteId } from '../../../domain/types.ts'
import { Card } from '../../../ui/core/index.ts'
import { Switch } from '../../../ui/form/index.ts'
import { showToast } from '../../../ui/overlay/index.ts'
import styles from '../../../ai/ai.module.css'

export interface AiSectionProps {
  athleteId: AthleteId
}

const ConsentSheet = lazy(() => import('../../../ai/AiConsentSheet.tsx'))

/** The athlete side of docs/ia 7.6: the AI summaries toggle, its status and the consent sheet A9. */
export function AiSection({ athleteId }: AiSectionProps) {
  const athleteOn = useLaree((s) => s.data.settings[athleteId].aiConsent)
  const coachOn = useLaree((s) => s.data.settings.coach.aiConsent)
  // Off but not saved for good, also after a reload: the warning stays under the switch until it is saved.
  const unsaved = useLaree((s) => s.aiUnsavedOwners.includes(athleteId)) && !athleteOn
  const setAiConsent = useLaree((s) => s.setAiConsent)
  const [open, setOpen] = useState(false)
  const [error, setError] = useState('')
  const state = aiStateOf(athleteOn, coachOn)

  const change = (on: boolean) => {
    if (on) {
      setError('')
      setOpen(true)
      return
    }
    let ok = false
    try {
      ok = setAiConsent(athleteId, false)
    } catch {
      ok = false
    }
    if (!ok) setError("Couldn't save your choice. AI stays as it was.")
    else if (useLaree.getState().aiWithdrawalUnsaved) setError(WITHDRAWAL_UNSAVED)
    else showToast('AI summaries are off.')
  }

  return (
    <>
      <h2 className={styles.h} id="me-ai-h">
        AI summaries
      </h2>
      <Card>
        <div className={styles.facts}>
          <p className={styles.sub}>
            AI can write a weekly recap of your training. Coach gets a check-in summary and next-week suggestions. This
            prototype shows simulated output only, and Coach must also turn AI on before anything appears.
          </p>
          <Switch
            label="AI summaries"
            isSelected={athleteOn}
            onChange={change}
            hint={athleteStatusLine(state)}
            error={error || (unsaved ? WITHDRAWAL_UNSAVED : undefined)}
          />
        </div>
      </Card>
      {open ? (
        <Suspense fallback={null}>
          <ConsentSheet athleteId={athleteId} isOpen={open} onClose={() => setOpen(false)} coachOn={coachOn} />
        </Suspense>
      ) : null}
    </>
  )
}
