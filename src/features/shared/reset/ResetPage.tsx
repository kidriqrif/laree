import { useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { useLaree } from '../../../data/store.ts'
import { STORE_KEY } from '../../../data/persist.ts'
import { Button } from '../../../ui/core/index.ts'
import { ConfirmDialog } from '../../../ui/overlay/index.ts'
import styles from './ResetPage.module.css'

function canWrite(): boolean {
  try {
    const k = `${STORE_KEY}:probe`
    localStorage.setItem(k, '1')
    localStorage.removeItem(k)
    return true
  } catch {
    return false
  }
}

export default function ResetPage() {
  const reset = useLaree((s) => s.reset)
  const navigate = useNavigate()
  const [asking, setAsking] = useState(false)
  const [done, setDone] = useState(false)
  const [unsaved, setUnsaved] = useState(false)
  const doneRef = useRef<HTMLOutputElement>(null)

  const cancel = () => {
    if (window.history.length > 1) void navigate(-1)
    else void navigate('/')
  }

  const doReset = () => {
    reset()
    setUnsaved(!canWrite())
    setDone(true)
    queueMicrotask(() => doneRef.current?.focus())
  }

  if (done) {
    return (
      <main className={styles.page}>
        <output ref={doneRef} tabIndex={-1} className={styles.done}>
          <h1 className={styles.h}>Demo data reset.</h1>
          {unsaved ? (
            <p className={styles.error}>
              The reset could not be saved on this device, so the fresh demo will last only for this visit.
            </p>
          ) : null}
        </output>
        <div className={styles.actions}>
          <Link className={styles.link} to="/">
            Choose who to view as
          </Link>
        </div>
      </main>
    )
  }

  return (
    <main className={styles.page}>
      <h1 className={styles.h}>Reset demo data</h1>
      <p className={styles.lead}>This puts the demo back to how it started.</p>
      <section className={styles.block} aria-labelledby="lost-h">
        <h2 id="lost-h">What goes</h2>
        <p>
          Logs, imported files, check-ins, plan edits, workouts, races, kudos, AI consent, drafts and preferences on
          this device.
        </p>
      </section>
      <section className={styles.block} aria-labelledby="back-h">
        <h2 id="back-h">What comes back</h2>
        <p>
          The seeded demo for Amir, Danial and Irfan, with 16 weeks of history and 12 weeks of plan, dated to the
          current week.
        </p>
      </section>
      <p className={styles.small}>The data lives in this browser under the key laree:v1.</p>
      <div className={styles.actions}>
        <Button variant="danger" onPress={() => setAsking(true)}>
          Reset demo data
        </Button>
        <Button variant="quiet" onPress={cancel}>
          Cancel
        </Button>
      </div>
      <ConfirmDialog
        isOpen={asking}
        onOpenChange={setAsking}
        thing="demo data"
        confirmLabel="Reset"
        cancelLabel="Keep my changes"
        description="Everything you changed on this device goes, and the seeded demo comes back."
        onConfirm={doReset}
      />
    </main>
  )
}
