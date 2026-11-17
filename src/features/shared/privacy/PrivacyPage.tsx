import { isLive } from '../../../app/mode.ts'
import styles from './PrivacyPage.module.css'

/**
 * How Laree uses personal data, in plain words (Malaysia's PDPA notice). English only for now;
 * the Malay version and a lawyer's review are owner follow-ups (docs/dev/runbook.md).
 */
export default function PrivacyPage() {
  if (!isLive) {
    return (
      <article className={styles.page}>
        <h1>Privacy</h1>
        <p>
          This is the Laree demo. Every person and number in it is made up. What you change stays in this browser
          only: nothing is sent anywhere, and there is no account.
        </p>
      </article>
    )
  }
  return (
    <article className={styles.page}>
      <h1>How Laree uses your data</h1>
      <p className={styles.updated}>Version 2026-11</p>

      <h2>What Laree keeps</h2>
      <ul>
        <li>Your email address, the name you choose, your sports and your heart-rate baselines.</li>
        <li>
          Your training: planned sessions, logged activities and the files you import, check-ins (sleep, soreness,
          mood, resting heart rate, HRV) and notes.
        </li>
        <li>Your consents, with the date of each answer.</li>
        <li>A short record of who changed what and when, without the content, kept for one year.</li>
      </ul>

      <h2>Why</h2>
      <p>
        To plan and record your training, and to share it with your coach if you accept a coach. Nothing is sold or
        used for advertising.
      </p>

      <h2>Who sees it</h2>
      <p>
        You, and the coach you accept, while you are their athlete. When the link ends, they lose access at once.
        Nobody else: database rules check every request.
      </p>

      <h2>Where it is stored</h2>
      <p>
        On Supabase servers in Singapore. When your device is set to a Malaysian time zone, Laree asks you to agree to this when you start, as Malaysian law requires. The app itself is served
        by Vercel.
      </p>

      <h2>AI</h2>
      <p>
        Off unless you turn it on. When on, Laree sends only the short summary it has already written, never your
        name, notes, files or raw check-ins, to an AI provider (such as OpenRouter, Groq or Google) to reword it.
        These providers may be in other countries, and OpenRouter passes a request on to the company that runs the model. Free models may keep what they are sent. Turning AI off stops this
        at once.
      </p>

      <h2>Your rights</h2>
      <ul>
        <li>Download everything Laree holds about you, from Me (or Settings for coaches), under Account.</li>
        <li>Delete your account and all your data from the same place. This cannot be undone.</li>
        <li>Withdraw any consent at any time. Without the health-data consent, Laree cannot keep your training.</li>
      </ul>

      <h2>How long</h2>
      <p>
        Until you delete your account. AI requests are logged for 90 days (which provider and model, never the
        text), and error reports for 30 days.
      </p>
    </article>
  )
}
