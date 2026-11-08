import styles from './StubPage.module.css'

/** Placeholder body for a screen that a later task builds. Shows the screen id and name. */
export function StubPage({ id, name }: { id: string; name: string }) {
  return (
    <section className={styles.stub} data-stub={id}>
      <p className={styles.id} data-numeric>
        {id}
      </p>
      <h1>{name}</h1>
      <p className={styles.note}>This screen is coming. Nothing is built here yet.</p>
    </section>
  )
}
