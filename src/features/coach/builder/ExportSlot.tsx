import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import { ATHLETES, isAthleteId } from '../../../app/people.ts'
import { useViewer } from '../../../app/viewer.ts'
import { currentDay } from '../../../data/selectors.ts'
import { useLaree } from '../../../data/store.ts'
import type { WorkoutTemplate } from '../../../domain/types.ts'
import { Button } from '../../../ui/core/index.ts'
import { Dialog, showToast } from '../../../ui/overlay/index.ts'
import { thresholdsFor } from './TargetPreview.tsx'
import { downloadFile } from './download.ts'
import styles from './ExportDialogs.module.css'

export interface ExportSlotProps {
  template: WorkoutTemplate
}

type Format = 'zwo' | 'fit' | 'mrc' | 'erg'

export const FORMATS: ReadonlyArray<{ id: Format; label: string; hint: string }> = [
  { id: 'zwo', label: '.zwo', hint: 'Zwift' },
  { id: 'fit', label: '.fit', hint: 'Garmin and other watches' },
  { id: 'mrc', label: '.mrc', hint: 'Trainer apps, percentage of FTP' },
  { id: 'erg', label: '.erg', hint: 'Trainer apps, watts' },
]

export const TEXT_FORMAT_NOTE = 'Step notes are not carried in .mrc and .erg files.'

interface Verdict {
  ok: boolean
  reason?: string
}

/** The builder's Export menu: four formats; the ones that do not fit are disabled with the reason. */
export function ExportSlot({ template }: ExportSlotProps) {
  const [open, setOpen] = useState(false)
  const [params] = useSearchParams()
  const coachAthlete = useViewer((s) => s.coachAthleteId)
  const data = useLaree((s) => s.data)
  const param = params.get('athlete')
  const athleteId = isAthleteId(param) ? param : coachAthlete
  const athlete = ATHLETES.find((a) => a.id === athleteId)
  const today = currentDay()
  const token = useMemo(() => ({ open, template, athlete, data, today }), [open, template, athlete, data, today])
  const [result, setResult] = useState<{ token: object; verdicts: Record<Format, Verdict> } | null>(null)
  const verdicts = result?.token === token ? result.verdicts : null
  const [busy, setBusy] = useState<Format | null>(null)

  useEffect(() => {
    if (!open || !athlete) return
    let live = true
    void (async () => {
      const { buildInput, buildFile } = await import('./exportFiles.ts')
      const input = buildInput(template, athlete.id, athlete.name, thresholdsFor(data, athlete.id, today))
      const out = {} as Record<Format, Verdict>
      for (const f of FORMATS) {
        const r = await buildFile(f.id, input)
        out[f.id] = r.ok ? { ok: true } : { ok: false, reason: r.reason }
      }
      if (live) setResult({ token, verdicts: out })
    })()
    return () => {
      live = false
    }
  }, [token, open, template, athlete, data, today])

  if (!athlete) return null

  const pick = async (format: Format) => {
    setBusy(format)
    try {
      const { buildInput, buildFile } = await import('./exportFiles.ts')
      const input = buildInput(template, athlete.id, athlete.name, thresholdsFor(data, athlete.id, today))
      const r = await buildFile(format, input)
      if (!r.ok) {
        showToast(r.reason)
        return
      }
      downloadFile(r.file)
      showToast(`Saved ${r.file.fileName}`)
      setOpen(false)
    } finally {
      setBusy(null)
    }
  }

  return (
    <>
      <Button variant="secondary" onPress={() => setOpen(true)}>
        Export
      </Button>
      <Dialog isOpen={open} onOpenChange={setOpen} title={`Export for ${athlete.name}`} data-testid="export-dialog">
        <div className={styles.body}>
          {verdicts === null ? (
            <output className={styles.note}>Checking which formats fit...</output>
          ) : (
            <ul className={styles.list} aria-label="Export formats">
              {FORMATS.map((f) => {
                const v = verdicts[f.id]
                return (
                  <li key={f.id} className={styles.row}>
                    <span>
                      <span className={styles.name}>{f.label}</span>
                      <span className={styles.reason} id={`export-${f.id}-info`}>
                        {v.ok ? f.hint : v.reason}
                      </span>
                    </span>
                    <Button
                      variant="secondary"
                      isDisabled={!v.ok || busy !== null}
                      isPending={busy === f.id}
                      aria-label={`Download ${f.label}`}
                      aria-describedby={`export-${f.id}-info`}
                      onPress={() => void pick(f.id)}
                    >
                      Download
                    </Button>
                  </li>
                )
              })}
            </ul>
          )}
          <p className={styles.note}>{TEXT_FORMAT_NOTE}</p>
        </div>
      </Dialog>
    </>
  )
}
