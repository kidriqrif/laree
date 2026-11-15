import { useEffect, useState } from 'react'
import type { AiCheckInOutput, AiRecapOutput } from '../../../ai/index.ts'
import { isLive } from '../../../app/mode.ts'
import styles from './AiPanels.module.css'

/** The shared body of the recap and check-in panels: label, model, text and the numbers used. */
export function AiTextPanel({ title, output: draft }: { title: string; output: AiRecapOutput | AiCheckInOutput }) {
  // Live: the rule-based text shows at once, then the AI wording replaces it when it arrives.
  const [polished, setPolished] = useState<{ from: typeof draft; to: typeof draft } | null>(null)
  useEffect(() => {
    // A literal, so the demo build leaves the live AI code out.
    if (!__LIVE__ || draft.status !== 'ok') return
    let gone = false
    void import('../../../live/aiText.ts')
      .then((m) => m.polish(draft))
      .then((to) => {
        if (!gone && to) setPolished({ from: draft, to })
      })
      .catch(() => undefined)
    return () => {
      gone = true
    }
  }, [draft])
  const output = polished?.from === draft ? polished.to : isLive ? { ...draft, label: 'Rule-based summary', model: '' } : draft
  return (
    <section className={styles.panel} aria-label={title} data-testid="ai-panel">
      <div className={styles.head}>
        <h3 className={styles.title}>{title}</h3>
        <p className={styles.meta}>
          {output.label}
          {output.model ? (
            <>
              {' · '}
              <span className={styles.model}>{output.model}</span>
            </>
          ) : null}
        </p>
      </div>
      {output.status === 'ok' ? (
        <>
          <p className={styles.headline}>{output.headline}</p>
          <ul className={styles.lines}>
            {output.lines.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
          {output.cites.length > 0 ? <p className={styles.cites}>Numbers used: {output.cites.join(', ')}</p> : null}
        </>
      ) : (
        <p className={styles.muted}>{output.message}</p>
      )}
    </section>
  )
}
