import { useState } from 'react'
import { useInRouterContext } from 'react-router'
import { useViewer } from '../../../app/viewer.ts'
import { currentDay } from '../../../data/selectors.ts'
import { useLaree } from '../../../data/store.ts'
import { ATHLETES } from '../../../data/seed/people.ts'
import { Button } from '../../../ui/core/index.ts'
import { NumberField, Rating, TextField } from '../../../ui/form/index.ts'
import { Sheet, showToast, useSheetParam } from '../../../ui/overlay/index.ts'
import type { CheckIn, DayOffset } from '../../../domain/types.ts'
import { baselineNote, MOOD_NAMES, SORENESS_NAMES } from './checkinText.ts'
import styles from './CheckIn.module.css'

/** Today's check-in can be changed until midnight Malaysia time, which is when the day offset rolls on. */
export function canEditCheckIn(day: DayOffset): boolean {
  return day === currentDay()
}

/** Opens at ?sheet=check-in. Renders nothing outside a router. */
export function CheckInSheet() {
  return useInRouterContext() ? <CheckInSheetInner /> : null
}

function CheckInSheetInner() {
  const sheet = useSheetParam('check-in')
  if (!sheet.isOpen) return null
  return <OpenSheet onClose={sheet.close} onOpenChange={sheet.onOpenChange} />
}

function simulatedWatch(mean: number, day: DayOffset, salt: number, spread: number): number {
  // A small steady wobble, so the same day always shows the same reading.
  const wobble = ((day * 7 + salt * 13) % 5) - 2
  return Math.round(mean + wobble * spread)
}

function OpenSheet({ onClose, onOpenChange }: { onClose: () => void; onOpenChange: (open: boolean) => void }) {
  const athleteId = useViewer((s) => s.athleteId)
  const checkIns = useLaree((s) => s.data.checkIns)
  const saveCheckIn = useLaree((s) => s.saveCheckIn)
  const skipCheckIn = useLaree((s) => s.skipCheckIn)
  // The day is fixed when the sheet opens, so a sheet left open past midnight cannot rewrite the new day.
  const [day] = useState<DayOffset>(() => currentDay())
  const athlete = ATHLETES.find((a) => a.id === athleteId)
  const mine = checkIns.filter((c) => c.athleteId === athleteId)
  const existing = mine.find((c) => c.day === day)
  const yesterday = mine.find((c) => c.day === day - 1)
  const stored = athlete?.baselines ?? { restingHr: 48, hrvMs: 72 }

  const [sleep, setSleep] = useState<number>(existing?.sleepHours ?? yesterday?.sleepHours ?? 7)
  const [soreness, setSoreness] = useState<number>(existing?.soreness ?? yesterday?.soreness ?? 2)
  const [mood, setMood] = useState<number>(existing?.mood ?? yesterday?.mood ?? 3)
  const [hr, setHr] = useState<number>(existing?.restingHr ?? simulatedWatch(stored.restingHr, day, 1, 1))
  const [hrv, setHrv] = useState<number>(existing?.hrvMs ?? simulatedWatch(stored.hrvMs, day, 2, 2))
  const [edited, setEdited] = useState(false)
  const [note, setNote] = useState(existing?.note ?? '')
  const [closed, setClosed] = useState(false)

  const history = mine.filter((c) => c.day !== day)
  const hrNote = baselineNote('restingHr', Number.isFinite(hr) ? hr : undefined, history, day, stored)
  const hrvNote = baselineNote('hrvMs', Number.isFinite(hrv) ? hrv : undefined, history, day, stored)

  const submit = () => {
    if (!canEditCheckIn(day)) {
      setClosed(true)
      return
    }
    const next: CheckIn = {
      id: existing?.id ?? `${athleteId}-c-${day}`,
      athleteId,
      day,
      sleepHours: Number.isFinite(sleep) ? sleep : 7,
      soreness,
      mood,
    }
    if (Number.isFinite(hr)) next.restingHr = Math.round(hr)
    if (Number.isFinite(hrv)) next.hrvMs = Math.round(hrv)
    const trimmed = note.trim()
    if (trimmed) next.note = trimmed
    // Keep an ill-or-injured state already recorded for the day.
    const unwell = (existing as { unwell?: unknown } | undefined)?.unwell
    saveCheckIn(unwell ? ({ ...next, unwell } as CheckIn) : next)
    showToast('Shared with Coach')
    onClose()
  }

  const notToday = () => {
    skipCheckIn(athleteId, day)
    onClose()
  }

  const footer = closed ? (
    <Button variant="primary" onPress={onClose}>
      Close
    </Button>
  ) : (
    <div className={styles.footer}>
      {existing ? <span /> : <Button onPress={notToday}>Not today</Button>}
      <Button variant="primary" onPress={submit}>
        {existing ? 'Update' : 'Submit'}
      </Button>
    </div>
  )

  return (
    <Sheet isOpen onOpenChange={onOpenChange} title="How am I this morning?" footer={footer} data-testid="check-in-sheet">
      {closed ? (
        <p className={styles.closed}>Today's check-in has closed. It can be changed until midnight, Malaysia time.</p>
      ) : (
        <div className={styles.form}>
          <NumberField
            label="Sleep last night"
            unit="h"
            value={sleep}
            onChange={setSleep}
            minValue={0}
            maxValue={16}
            step={0.25}
            formatOptions={{ maximumFractionDigits: 2 }}
          />
          <Rating label="Soreness" value={soreness} onChange={setSoreness} valueNames={SORENESS_NAMES} showEnds />
          <Rating label="Mood" value={mood} onChange={setMood} valueNames={MOOD_NAMES} showEnds />
          <div>
            <div className={styles.pair}>
              <NumberField
                label="Resting heart rate"
                unit="bpm"
                value={hr}
                onChange={(v) => {
                  setHr(v)
                  setEdited(true)
                }}
                minValue={30}
                maxValue={120}
                formatOptions={{ maximumFractionDigits: 0 }}
              />
              <NumberField
                label="HRV"
                unit="ms"
                value={hrv}
                onChange={(v) => {
                  setHrv(v)
                  setEdited(true)
                }}
                minValue={10}
                maxValue={250}
                formatOptions={{ maximumFractionDigits: 0 }}
              />
            </div>
            <p className={styles.source}>
              {edited ? 'Started from your watch (simulated). You changed it.' : 'From your watch (simulated).'}
            </p>
            {hrNote ? <p className={styles.usual}>{hrNote}</p> : null}
            {hrvNote ? <p className={styles.usual}>{hrvNote}</p> : null}
          </div>
          <TextField label="Note (optional)" value={note} onChange={setNote} maxLength={200} />
        </div>
      )}
    </Sheet>
  )
}
