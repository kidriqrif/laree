import { forwardRef, useId, useState } from 'react'
import type { ReactNode } from 'react'
import { Button } from '../core/Button.tsx'
import { DropZone as AriaDropZone } from 'react-aria-components/DropZone'
import { FileTrigger } from 'react-aria-components/FileTrigger'
import { cx, describedBy, PlainFooter } from './Field.tsx'
import type { FieldProps } from './Field.tsx'
import styles from './DropZone.module.css'

export interface DropZoneProps extends Omit<FieldProps, 'label'> {
  /** Names the zone for screen readers, e.g. "Activity file". */
  label: string
  /** Visible instruction. Defaults to "Drop a file here". */
  title?: ReactNode
  /** MIME types or extensions the picker offers. Detection by content is the importer's job. */
  accept?: ReadonlyArray<string>
  allowsMultiple?: boolean
  /** Called with the chosen files, from a drop or from the file picker. */
  onFiles: (files: File[]) => void
  isDisabled?: boolean
}

/** Drag-and-drop target with a keyboard-reachable "Choose file" button. It only reports the files. */
export const DropZone = forwardRef<HTMLDivElement, DropZoneProps>(function DropZone(
  { label, title, hint, error, className, accept, allowsMultiple = false, onFiles, isDisabled },
  ref,
) {
  const uid = useId()
  const hintId = `${uid}-h`
  const errorId = `${uid}-e`
  const [names, setNames] = useState<string[]>([])

  const report = (files: File[]) => {
    if (files.length === 0) return
    const picked = allowsMultiple ? files : files.slice(0, 1)
    setNames(picked.map((f) => f.name))
    onFiles(picked)
  }

  return (
    <div className={cx(className)}>
      <AriaDropZone
        ref={ref}
        aria-label={label}
        aria-describedby={describedBy(hintId, errorId, { hint, error })}
        isDisabled={isDisabled}
        className={styles.zone}
        onDrop={async (e) => {
          const items = e.items.filter((i) => i.kind === 'file')
          const files = await Promise.all(items.map((i) => (i.kind === 'file' ? i.getFile() : Promise.resolve(null))))
          report(files.filter((f): f is File => f !== null))
        }}
      >
        <span className={styles.title}>{title ?? (allowsMultiple ? 'Drop files here' : 'Drop a file here')}</span>
        <FileTrigger
          acceptedFileTypes={accept}
          allowsMultiple={allowsMultiple}
          onSelect={(list) => report(list ? Array.from(list) : [])}
        >
          <Button variant="secondary" isDisabled={isDisabled}>
            {allowsMultiple ? 'Choose files' : 'Choose file'}
          </Button>
        </FileTrigger>
        {names.length ? (
          <ul className={styles.files} aria-live="polite">
            {names.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        ) : null}
      </AriaDropZone>
      <PlainFooter hintId={hintId} errorId={errorId} hint={hint} error={error} />
    </div>
  )
})
