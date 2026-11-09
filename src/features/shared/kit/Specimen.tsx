import type { ReactNode } from 'react'
import styles from './KitPage.module.css'

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

export function Group({
  title,
  importPath,
  intro,
  children,
}: {
  title: string
  importPath: string
  intro?: ReactNode
  children: ReactNode
}) {
  const id = `kit-${slug(title)}`
  return (
    <section className={styles.group} id={id} data-group={title} aria-labelledby={`${id}-h`}>
      <header className={styles.groupHead}>
        <h2 id={`${id}-h`}>{title}</h2>
        <p>
          <code className={styles.path}>{importPath}</code>
        </p>
        {intro ? <p className={styles.intro}>{intro}</p> : null}
      </header>
      {children}
    </section>
  )
}

/**
 * One component or chart, shown with its states. `covers` names the exports from the folder index that
 * this specimen draws; the test checks that every export of every index is named by some specimen.
 */
export function Specimen({
  name,
  covers,
  from,
  note,
  wide,
  importLine,
  children,
}: {
  name: string
  covers: readonly string[]
  from: string
  importLine?: string
  note?: ReactNode
  wide?: boolean
  children: ReactNode
}) {
  const id = `kit-spec-${slug(name)}`
  return (
    <article className={styles.specimen} id={id} data-spec={name} data-covers={covers.join(' ')} aria-labelledby={`${id}-h`}>
      <h3 id={`${id}-h`}>{name}</h3>
      <p className={styles.import}>
        <code>{importLine ?? `import { ${covers.join(', ')} } from '${from}'`}</code>
      </p>
      {note ? <p className={styles.note}>{note}</p> : null}
      <div className={wide ? styles.statesWide : styles.states}>{children}</div>
    </article>
  )
}

/** One state of a specimen, captioned. */
export function State({ label, children, wide }: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <figure className={wide ? styles.stateWide : styles.state} data-state={label}>
      <figcaption>{label}</figcaption>
      <div className={styles.stage}>{children}</div>
    </figure>
  )
}

/** Names that have no picture of their own (hooks, helpers, constants), listed so nothing is left out. */
export function Helpers({ from, items }: { from: string; items: ReadonlyArray<readonly [name: string, what: ReactNode]> }) {
  return (
    <article
      className={styles.specimen}
      id={`kit-spec-helpers-${slug(from)}`}
      data-spec="Helpers and hooks"
      data-covers={items.map(([n]) => n).join(' ')}
    >
      <h3>Helpers and hooks</h3>
      <p className={styles.import}>
        <code>{`from '${from}'`}</code>
      </p>
      <dl className={styles.helpers}>
        {items.map(([n, what]) => (
          <div key={n}>
            <dt>
              <code>{n}</code>
            </dt>
            <dd>{what}</dd>
          </div>
        ))}
      </dl>
    </article>
  )
}
