import { useMemo, useState } from 'react'
import { buildSuggestFacts, fmtDuration, planVersionOf, simulateSuggestion, toPlanChanges } from '../../../ai/index.ts'
import { ATHLETES } from '../../../app/people.ts'
import { currentDay } from '../../../data/selectors.ts'
import { useLaree } from '../../../data/store.ts'
import type { AthleteId } from '../../../domain/types.ts'
import { Button } from '../../../ui/core/index.ts'
import { Drawer, showUndoToast } from '../../../ui/overlay/index.ts'
import { undoIfLatest, undoStepOf } from './sessionModel.ts'
import styles from './SuggestDrawer.module.css'

type Decision = 'accept' | 'reject'

/** C5. The change set for next week, one change per row, accepted or rejected one by one. */
export default function SuggestDrawer({ athleteId, onClose }: { athleteId: AthleteId; onClose: () => void }) {
  const data = useLaree((s) => s.data)
  const name = ATHLETES.find((a) => a.id === athleteId)?.name ?? athleteId
  // The change set is made once on open: accepting rows must not re-roll it.
  const [snapshot] = useState(() => data)
  const output = useMemo(() => simulateSuggestion(buildSuggestFacts(snapshot, athleteId, currentDay())), [snapshot, athleteId])
  const [decisions, setDecisions] = useState<Record<string, Decision>>({})
  const [error, setError] = useState<string | null>(null)

  const accepted = output.status === 'ok' ? output.changes.filter((c) => decisions[c.id] === 'accept') : []

  const apply = () => {
    if (output.status !== 'ok') return
    const fresh = buildSuggestFacts(useLaree.getState().data, athleteId, currentDay())
    if (planVersionOf(fresh.nextWeek) !== output.planVersion) {
      setError('The plan changed since this was made. Close this and ask again.')
      return
    }
    const store = useLaree.getState()
    const step = undoStepOf(() => store.applyPlanChanges(toPlanChanges(accepted, store.data.templates, store.data.planned), 'Suggested changes'))
    if (!step) {
      // Nothing changed: say so instead of closing quietly with no toast.
      setError('Nothing was applied. Close this and ask again.')
      return
    }
    onClose()
    // Count what was applied, which can be fewer than what was accepted.
    const n = step.before.length + step.added.length
    // The toast undoes its own step only: a later move or edit is never undone from here.
    showUndoToast(`${n} ${n === 1 ? 'change' : 'changes'} applied to ${name}'s week.`, () => undoIfLatest(step))
  }

  const set = (id: string, d: Decision) => setDecisions((p) => ({ ...p, [id]: d }))

  return (
    <Drawer isOpen onOpenChange={(o) => !o && onClose()} title={`Suggest next week for ${name}`}>
      <div className={styles.body} data-testid="suggest-drawer">
        <p className={styles.meta}>
          {output.label} · <span className={styles.model}>{output.model}</span>
        </p>
        {output.status === 'declined' ? (
          <p>{output.message}</p>
        ) : output.changes.length === 0 ? (
          <>
            <p>{output.reason}</p>
            <p className={styles.meta}>No changes suggested for next week.</p>
            <div className={styles.actions}>
              <Button variant="secondary" onPress={onClose}>
                Close
              </Button>
            </div>
          </>
        ) : (
          <>
            <p>{output.reason}</p>
            <p className={styles.meta} data-numeric>
              Week: {fmtDuration(output.week.durationBeforeS)} to {fmtDuration(output.week.durationAfterS)}, Load{' '}
              {Math.round(output.week.loadBefore)} to {Math.round(output.week.loadAfter)} if all are accepted.
            </p>
            <ul className={styles.list}>
              {output.changes.map((c) => {
                const d = decisions[c.id]
                return (
                  <li key={c.id} className={styles.row} data-decision={d ?? 'pending'}>
                    <div>
                      <p className={styles.summary}>{c.summary}</p>
                      <p className={styles.meta} data-numeric>
                        Load {Math.round(c.loadBefore)} to {Math.round(c.loadAfter)}
                      </p>
                    </div>
                    <div className={styles.choice}>
                      <Button variant={d === 'accept' ? 'primary' : 'secondary'} aria-pressed={d === 'accept'} onPress={() => set(c.id, 'accept')}>
                        Accept
                      </Button>
                      <Button variant={d === 'reject' ? 'primary' : 'secondary'} aria-pressed={d === 'reject'} onPress={() => set(c.id, 'reject')}>
                        Reject
                      </Button>
                    </div>
                  </li>
                )
              })}
            </ul>
            {error ? (
              <p className={styles.error} role="alert">
                {error}
              </p>
            ) : null}
            <div className={styles.actions}>
              <Button variant="secondary" onPress={onClose}>
                Close
              </Button>
              <Button variant="primary" isDisabled={accepted.length === 0} onPress={apply}>
                {`Apply ${accepted.length} ${accepted.length === 1 ? 'change' : 'changes'}`}
              </Button>
            </div>
          </>
        )}
      </div>
    </Drawer>
  )
}
