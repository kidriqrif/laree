import { MODEL_PLAN, MODEL_SUMMARY } from './types.ts'
import styles from './ai.module.css'

/** What AI would do, what it reads and never reads, shared by sheet A9 and dialog C20. */
export function ConsentCopy({ audience }: { audience: 'athlete' | 'coach' }) {
  return (
    <dl className={styles.facts}>
      <div>
        <dt>What AI would do</dt>
        <dd>
          <ul className={styles.list}>
            <li>
              {audience === 'athlete'
                ? 'A weekly recap of your past weeks, written to you. Coach reads the same text.'
                : 'A weekly recap of past weeks, written to the athlete. You read the same text.'}
            </li>
            <li>A check-in summary for Coach.</li>
            <li>Suggestions for next week, for Coach to accept or reject one by one.</li>
          </ul>
        </dd>
      </div>
      <div>
        <dt>What it reads</dt>
        <dd>
          Summaries Laree already shows: planned sessions, activity totals, Fitness, Fatigue, Form and Ramp, check-in
          scores, thresholds, races and open flags where a feature needs them. One athlete at a time.
        </dd>
      </div>
      <div>
        <dt>What it never reads</dt>
        <dd>
          GPS tracks, second-by-second data, original files, free-text notes, names, body weight, real dates or anything
          about another athlete. It never opens, changes or resolves a flag, and it gives no medical advice.
        </dd>
      </div>
      <div>
        <dt>Models</dt>
        <dd>
          The full app would use <span className={styles.model}>{MODEL_SUMMARY}</span> for summaries and{' '}
          <span className={styles.model}>{MODEL_PLAN}</span> for plan proposals, processed by Anthropic outside
          Malaysia. Results are kept for 90 days.
        </dd>
      </div>
      <div>
        <dt>This prototype</dt>
        <dd>It shows simulated output only, written from templates on this device. Nothing leaves it.</dd>
      </div>
      <div>
        <dt>Both of you must agree</dt>
        <dd>
          {audience === 'athlete'
            ? 'AI runs only when Coach has also turned it on. Coach cannot turn it on for you.'
            : 'AI runs for an athlete only when that athlete has also turned it on. You cannot turn it on for them. Suggestions never change the plan without your acceptance.'}
        </dd>
      </div>
      <div>
        <dt>Turning it off</dt>
        <dd>
          {audience === 'athlete'
            ? 'One tap, any time. Every AI panel about you disappears at once.'
            : 'One tap, any time. Every AI panel disappears at once.'}
        </dd>
      </div>
    </dl>
  )
}
