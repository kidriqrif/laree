import { lazy, Suspense } from 'react'
import type { AthleteId } from '../../../domain/types.ts'

export interface AiConsentDialogProps {
  athleteId: AthleteId
  isOpen: boolean
  onClose: () => void
}

const Impl = lazy(() => import('../../../ai/CoachConsentDialog.tsx'))

/** C20, the coach side of consent for one athlete. Loads only when it opens. */
export function AiConsentDialog(props: AiConsentDialogProps) {
  if (!props.isOpen) return null
  return (
    <Suspense fallback={null}>
      <Impl {...props} />
    </Suspense>
  )
}
