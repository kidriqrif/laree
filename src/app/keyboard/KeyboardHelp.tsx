import { useEffect } from 'react'
import { Link } from 'react-router'
import { Dialog } from '../../ui/overlay/index.ts'
import { useHotkeysContext, type HotkeyEntry } from './HotkeyProvider.tsx'
import { describeKeys } from './keys.ts'
import styles from './Keyboard.module.css'

export interface KeyboardHelpProps {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
}

/** C22: the keys that work on this screen, page keys first, then global ones. */
export function KeyboardHelp({ isOpen, onOpenChange }: KeyboardHelpProps) {
  const { entries, singleKeysEnabled } = useHotkeysContext()
  const page = entries.filter((e) => e.scope === 'page')
  const global = entries.filter((e) => e.scope === 'global')

  // The dialog owns the keyboard while it is open, so ? closes it from here.
  useEffect(() => {
    if (!isOpen) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== '?' || e.ctrlKey || e.metaKey || e.altKey) return
      e.preventDefault()
      onOpenChange(false)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [isOpen, onOpenChange])

  return (
    <Dialog
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      title="Keyboard help"
      register="coach"
      data-testid="keyboard-help"
    >
      <div className={styles.help}>
        {singleKeysEnabled ? null : (
          <p className={styles.notice} role="note">
            Single-key shortcuts are off. Only Ctrl shortcuts work.{' '}
            <Link to="/coach/settings" onClick={() => onOpenChange(false)}>
              Open Settings
            </Link>
          </p>
        )}
        <KeyTable title="On this screen" rows={page} emptyText="This screen has no keys of its own." />
        <KeyTable title="Everywhere" rows={global} />
        <p className={styles.footnote}>
          Press Esc or ? to close.{' '}
          {singleKeysEnabled ? (
            <Link to="/coach/settings" onClick={() => onOpenChange(false)}>
              Settings
            </Link>
          ) : null}
        </p>
      </div>
    </Dialog>
  )
}

function KeyTable({ title, rows, emptyText }: { title: string; rows: readonly HotkeyEntry[]; emptyText?: string }) {
  if (rows.length === 0 && !emptyText) return null
  return (
    <section className={styles.section} aria-label={title}>
      <h3 className={styles.sectionTitle}>{title}</h3>
      {rows.length === 0 ? (
        <p className={styles.empty}>{emptyText}</p>
      ) : (
        <table className={styles.table}>
          <thead className={styles.srOnly}>
            <tr>
              <th scope="col">Keys</th>
              <th scope="col">Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className={styles.keys}>
                  <kbd>{describeKeys(r.keys)}</kbd>
                </td>
                <td>{r.description}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}
