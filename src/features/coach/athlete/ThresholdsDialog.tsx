import { useState } from 'react'
import { Button } from '../../../ui/core/index.ts'
import { Dialog } from '../../../ui/overlay/index.ts'
import { NumberField, PaceField, SegmentedControl } from '../../../ui/form/index.ts'
import { currentDay, thresholdOn } from '../../../data/selectors.ts'
import { useLaree } from '../../../data/store.ts'
import type { AthleteId } from '../../../domain/types.ts'
import { fmtDay } from '../../../charts/index.ts'
import { formatThreshold, KIND_LABEL, RANGE } from './thresholds.ts'
import type { EditableKind } from './thresholds.ts'
import styles from './ThresholdsDialog.module.css'

export interface ThresholdsDialogProps {
  athleteId: AthleteId
  isOpen: boolean
  onClose: () => void
}

type Draft = Record<EditableKind, number | null>

const KINDS: readonly EditableKind[] = ['ftp', 'thresholdPace', 'css', 'lthr']
// Pace fields work in seconds; thresholds are stored as speed.
const paceSecs = (speed: number | null) => (speed ? Math.round(1000 / speed) : null)
const cssSecs = (speed: number | null) => (speed ? Math.round(100 / speed) : null)
const inRange = (kind: EditableKind, v: number): boolean => v >= RANGE[kind][0] && v <= RANGE[kind][1]

/** C19. Each changed value adds a history row dated today; the old value stays in history. */
export default function ThresholdsDialog({ athleteId, isOpen, onClose }: ThresholdsDialogProps) {
  const data = useLaree((s) => s.data)
  const changeThreshold = useLaree((s) => s.changeThreshold)
  const day = currentDay()
  const current = (k: EditableKind) => thresholdOn(data, athleteId, k, day)
  const [draft, setDraft] = useState<Draft>(() => ({
    ftp: current('ftp') ?? null,
    thresholdPace: current('thresholdPace') ?? null,
    css: current('css') ?? null,
    lthr: current('lthr') ?? null,
  }))
  const [source, setSource] = useState<'test' | 'coachEdit'>('coachEdit')
  const [tried, setTried] = useState(false)

  const set = (kind: EditableKind, v: number | null) => setDraft((d) => ({ ...d, [kind]: v }))
  const error = (kind: EditableKind): string | undefined => {
    const v = draft[kind]
    if (!tried || v === null) return undefined
    return inRange(kind, v) ? undefined : 'Outside the usual range for this threshold.'
  }
  const changed = KINDS.filter((k) => {
    const v = draft[k]
    return v !== null && v !== current(k)
  })
  const invalid = changed.some((k) => !inRange(k, draft[k] as number))

  const save = () => {
    setTried(true)
    if (invalid || changed.length === 0) return
    for (const k of changed) changeThreshold(athleteId, k, draft[k] as number, day, source)
    onClose()
  }

  return (
    <Dialog
      isOpen={isOpen}
      onOpenChange={(o) => !o && onClose()}
      title="Edit thresholds"
      footer={
        <>
          <Button variant="quiet" onPress={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onPress={save}>
            Save
          </Button>
        </>
      }
    >
      <div className={styles.form}>
        <p className={styles.note}>A change applies from today, {fmtDay(day)}. The old value stays in the history.</p>
        <NumberField
          label="FTP"
          unit="W"
          value={draft.ftp ?? Number.NaN}
          onChange={(v) => set('ftp', Number.isNaN(v) ? null : v)}
          minValue={0}
          hint={`Now ${formatThreshold('ftp', current('ftp'))}`}
          error={error('ftp')}
        />
        <PaceField
          label="Threshold pace"
          per="km"
          value={paceSecs(draft.thresholdPace)}
          onChange={(s) => set('thresholdPace', s ? 1000 / s : null)}
          hint={`Now ${formatThreshold('thresholdPace', current('thresholdPace'))}`}
          error={error('thresholdPace')}
        />
        <PaceField
          label="CSS"
          per="100m"
          value={cssSecs(draft.css)}
          onChange={(s) => set('css', s ? 100 / s : null)}
          hint={`Now ${formatThreshold('css', current('css'))}`}
          error={error('css')}
        />
        <NumberField
          label="LTHR"
          unit="bpm"
          value={draft.lthr ?? Number.NaN}
          onChange={(v) => set('lthr', Number.isNaN(v) ? null : v)}
          minValue={0}
          hint={`Now ${formatThreshold('lthr', current('lthr'))}`}
          error={error('lthr')}
        />
        <SegmentedControl
          label="Source"
          options={[
            { id: 'coachEdit', label: 'Coach estimate' },
            { id: 'test', label: 'Test' },
          ]}
          value={source}
          onChange={(id) => setSource(id === 'test' ? 'test' : 'coachEdit')}
        />
        {tried && changed.length === 0 ? (
          <output className={styles.note}>
            Nothing has changed. Edit a value to save it.
          </output>
        ) : null}
        {changed.length > 0 ? (
          <p className={styles.note}>Changing {changed.map((k) => KIND_LABEL[k]).join(', ')}.</p>
        ) : null}
      </div>
    </Dialog>
  )
}
