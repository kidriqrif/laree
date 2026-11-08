import { useId, useState } from 'react'
import { useLaree } from '../data/store.ts'
import styles from './StorageBanner.module.css'

/** S8. Shown under the switcher when the browser will not keep changes. */
export function StorageBanner() {
  const failed = useLaree((s) => s.storageFailed)
  const dismissed = useLaree((s) => s.bannerDismissed)
  const dismiss = useLaree((s) => s.dismissStorageBanner)
  const [open, setOpen] = useState(false)
  const whyId = useId()

  if (!failed || dismissed) return null
  return (
    <output className={styles.banner} data-screen="S8">
      <div className={styles.body}>
        <p className={styles.msg}>This browser isn’t saving changes. They last until you close the tab.</p>
        {open ? (
          <p id={whyId} className={styles.why}>
            Browsers stop saving in private windows, when site data is blocked, or when storage is full. Laree keeps
            working in memory, so nothing you do now will be lost until you close the tab. To keep changes, open Laree
            in a normal window or free up space.
          </p>
        ) : null}
      </div>
      <div className={styles.actions}>
        <button type="button" className={styles.btn} aria-expanded={open} aria-controls={open ? whyId : undefined} onClick={() => setOpen(!open)}>
          Why?
        </button>
        <button type="button" className={styles.btn} aria-label="Dismiss storage warning" onClick={dismiss}>
          Dismiss
        </button>
      </div>
    </output>
  )
}
