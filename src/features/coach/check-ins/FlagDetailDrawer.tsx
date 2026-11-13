import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { ATHLETES } from '../../../app/people.ts'
import { useCoachReadOnly } from '../../../app/useCoachReadOnly.ts'
import { fmtDay, Sparkline } from '../../../charts/index.ts'
import { currentDay, selectFitnessSeries, selectFlagRecords } from '../../../data/selectors.ts'
import { useLaree } from '../../../data/store.ts'
import { usualLabel } from '../../../domain/baselines.ts'
import { flagValuesLine, NOTE_MAX_CHARS, RULES } from '../../../domain/flags.ts'
import type { AthleteId, DayOffset } from '../../../domain/types.ts'
import { Button, buttonClass } from '../../../ui/core/index.ts'
import { TextField } from '../../../ui/form/index.ts'
import { Drawer, showUndoToast } from '../../../ui/overlay/index.ts'
import { flagActionUndo, RULE_SERIES, SEVERITY_LABEL, STATUS_TEXT } from './model.ts'
import styles from './CheckIns.module.css'

export interface FlagDetailDrawerProps {
  athleteId: AthleteId
  flagId: string
  onClose: () => void
  /** Opens the day's check-in detail; omitted where there is no such drawer. */
  onOpenCheckIn?: (athleteId: AthleteId, day: DayOffset) => void
  /** Opens straight into the resolve or note form. */
  initialMode?: 'view' | 'resolve' | 'note'
}

type Mode = 'view' | 'resolve' | 'note'

/** C14. Opening an open flag acknowledges it; resolving needs a note. */
export default function FlagDetailDrawer({ athleteId, flagId, onClose, onOpenCheckIn, initialMode = 'view' }: FlagDetailDrawerProps) {
  const readOnly = useCoachReadOnly()
  const data = useLaree((s) => s.data)
  const acknowledgeFlag = useLaree((s) => s.acknowledgeFlag)
  const resolveFlag = useLaree((s) => s.resolveFlag)
  const addFlagNote = useLaree((s) => s.addFlagNote)
  const today = currentDay()
  const [mode, setMode] = useState<Mode>(readOnly ? 'view' : initialMode)
  const [text, setText] = useState('')
  const [tried, setTried] = useState(false)

  const all = selectFlagRecords(data, athleteId, undefined)
  const flag = all.find((f) => f.id === flagId)
  const name = ATHLETES.find((a) => a.id === athleteId)?.name ?? athleteId

  // Opening an open flag marks it as seen. The guard keeps a re-render from doing it twice.
  const acked = useRef<string | null>(null)
  useEffect(() => {
    if (readOnly || !flag || flag.status !== 'open' || acked.current === flag.id) return
    acked.current = flag.id
    const undo = flagActionUndo(athleteId, flag.id, () => acknowledgeFlag(flag.id, athleteId, today))
    if (undo) showUndoToast('Flag acknowledged', undo)
  }, [flag, athleteId, acknowledgeFlag, today, readOnly])

  if (!flag) return null
  const meta = RULES[flag.ruleId]
  const series = RULE_SERIES[flag.ruleId]
  const fitness = selectFitnessSeries(data, athleteId, today)
  const first = today - 13
  let values: (number | null)[] = []
  if (series) {
    if (series.key === 'fitness' || series.key === 'form') {
      values = Array.from({ length: 14 }, (_, i) => fitness.find((p) => p.day === first + i)?.[series.key as 'fitness' | 'form'] ?? null)
    } else {
      const key = series.key
      values = Array.from({ length: 14 }, (_, i) => {
        const c = data.checkIns.find((x) => x.athleteId === athleteId && x.day === first + i)
        return c ? (c[key] ?? null) : null
      })
    }
  }
  const mean = Number(flag.valuesLatest.mean)
  const sd = Number(flag.valuesLatest.sd)
  const usual =
    flag.ruleId === 'hrv-low' || flag.ruleId === 'rhr-high'
      ? Number.isFinite(mean)
        ? usualLabel(flag.ruleId === 'hrv-low' ? 'hrvMs' : 'restingHr', { mean, sd: Number.isFinite(sd) ? sd : null })
        : null
      : null
  const recent = data.checkIns
    .filter((c) => c.athleteId === athleteId && c.day <= today)
    .toSorted((a, b) => b.day - a.day)
    .slice(0, 3)
  const unwell = recent.find((c) => c.unwell)?.unwell
  const others = all.filter((f) => f.id !== flag.id && f.status !== 'resolved')
  const fired = all.filter((f) => f.ruleId === flag.ruleId && f.openedDay >= today - 28).length
  const pending = flag.status === 'open' && !readOnly

  const finish = () => {
    setMode('view')
    setText('')
    setTried(false)
  }
  const submit = () => {
    setTried(true)
    const t = text.trim()
    if (!t) return
    if (mode === 'resolve') {
      const undo = flagActionUndo(athleteId, flag.id, () => resolveFlag(flag.id, athleteId, t, today))
      if (undo) showUndoToast('Flag resolved', undo)
    } else {
      addFlagNote(flag.id, athleteId, t, today)
    }
    finish()
  }

  return (
    <Drawer isOpen onOpenChange={(o) => !o && onClose()} title={meta.title} className={styles.drawer} data-testid="flag-detail">
      <div className={styles.detail}>
        <p className={styles.metaLine}>
          <span className={styles.sev} data-severity={flag.severity}>
            {SEVERITY_LABEL[flag.severity]}
          </span>
          <span>{name}</span>
          <span data-testid="flag-status">{STATUS_TEXT[flag.status]}</span>
        </p>

        <section aria-labelledby="fd-rule">
          <h3 id="fd-rule">The rule</h3>
          <p>{meta.ruleText}</p>
          <p className={styles.values} data-numeric>
            {flagValuesLine(flag, 'latest', today, fmtDay)}
          </p>
          <p className={styles.muted}>
            Opened {fmtDay(flag.openedDay)}: {flagValuesLine(flag, 'open', today, fmtDay)}
          </p>
          {usual ? <p className={styles.muted}>Baseline used by this rule: {usual}.</p> : null}
          {series ? (
            <div className={styles.chart}>
              <Sparkline
                values={values}
                label={`${series.label}, last 14 days`}
                height={40}
                // Sleep is logged to a tenth of an hour; the rest are whole numbers.
                formatValue={(n) => `${series.key === 'sleepHours' ? n.toFixed(1) : Math.round(n)}${series.unit ? ` ${series.unit}` : ''}`}
              />
            </div>
          ) : null}
        </section>

        <section aria-labelledby="fd-why">
          <h3 id="fd-why">Why it was raised</h3>
          <p>{flag.explanation}</p>
          <p>
            <strong>What to do:</strong> {meta.suggestedAction}
          </p>
        </section>

        <section aria-labelledby="fd-ctx">
          <h3 id="fd-ctx">Context</h3>
          {recent.length === 0 ? (
            <p className={styles.muted}>No check-ins yet.</p>
          ) : (
            <ul className={styles.plain}>
              {recent.map((c) => (
                <li key={c.id}>
                  {onOpenCheckIn ? (
                    <button type="button" className={styles.link} onClick={() => onOpenCheckIn(athleteId, c.day)}>
                      {fmtDay(c.day)}
                    </button>
                  ) : (
                    <span>{fmtDay(c.day)}</span>
                  )}
                  <span data-numeric>
                    {' '}
                    sleep {c.sleepHours.toFixed(1)} h, soreness {c.soreness}, mood {c.mood}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {unwell ? (
            <p>
              {name} marked themselves {unwell.kind === 'ill' ? 'ill' : 'injured'}: {unwell.note}
            </p>
          ) : null}
          {others.length > 0 ? (
            <p className={styles.muted}>Also open for {name}: {others.map((f) => RULES[f.ruleId].title).join(', ')}.</p>
          ) : null}
          <p className={styles.muted}>
            This rule fired {fired} {fired === 1 ? 'time' : 'times'} in the last 28 days.
          </p>
        </section>

        {flag.notes.length > 0 ? (
          <section aria-labelledby="fd-notes">
            <h3 id="fd-notes">Notes (only you see these)</h3>
            <ul className={styles.plain}>
              {flag.notes.map((n, i) => (
                <li key={i}>
                  <span className={styles.muted}>{fmtDay(n.day)}</span> {n.text}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {readOnly ? (
          <div className={styles.actions}>
            <Link to={`/coach/calendar/${athleteId}`} className={buttonClass('quiet')}>
              Open calendar
            </Link>
          </div>
        ) : mode === 'view' ? (
          <div className={styles.actions}>
            {pending ? (
              <Button
                onPress={() => {
                  const undo = flagActionUndo(athleteId, flag.id, () => acknowledgeFlag(flag.id, athleteId, today))
                  if (undo) showUndoToast('Flag acknowledged', undo)
                }}
              >
                Acknowledge
              </Button>
            ) : null}
            {flag.status !== 'resolved' ? (
              <Button variant="primary" onPress={() => setMode('resolve')}>
                Resolve
              </Button>
            ) : null}
            <Button variant="quiet" onPress={() => setMode('note')}>
              Add note
            </Button>
            <Link to={`/coach/calendar/${athleteId}`} className={buttonClass('quiet')}>
              Open calendar
            </Link>
          </div>
        ) : (
          <form
            className={styles.noteForm}
            onSubmit={(e) => {
              e.preventDefault()
              submit()
            }}
          >
            <TextField
              label={mode === 'resolve' ? 'Resolution note (required)' : 'Note'}
              value={text}
              onChange={setText}
              maxLength={NOTE_MAX_CHARS}
              {...(tried && !text.trim()
                ? { error: mode === 'resolve' ? 'Add a note to say how this was dealt with.' : 'Write a note first.' }
                : { hint: `Up to ${NOTE_MAX_CHARS} characters. Only you see it.` })}
            />
            <div className={styles.actions}>
              <Button type="submit" variant="primary">
                {mode === 'resolve' ? 'Resolve flag' : 'Save note'}
              </Button>
              <Button variant="quiet" onPress={finish}>
                Cancel
              </Button>
            </div>
          </form>
        )}
      </div>
    </Drawer>
  )
}
