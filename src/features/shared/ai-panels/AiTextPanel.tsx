import type { AiCheckInOutput, AiRecapOutput } from '../../../ai/index.ts'
import styles from './AiPanels.module.css'

/** The shared body of the recap and check-in panels: label, model, text and the numbers used. */
export function AiTextPanel({ title, output }: { title: string; output: AiRecapOutput | AiCheckInOutput }) {
  return (
    <section className={styles.panel} aria-label={title} data-testid="ai-panel">
      <div className={styles.head}>
        <h3 className={styles.title}>{title}</h3>
        <p className={styles.meta}>
          {output.label} · <span className={styles.model}>{output.model}</span>
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
