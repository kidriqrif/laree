/* oxlint-disable jsx-a11y/no-noninteractive-element-interactions -- Alt+Arrow moves a step from anywhere inside its row */
import { useEffect, useRef } from 'react'
import type { DragEvent, KeyboardEvent } from 'react'
import type { LoadThresholds } from '../../../domain/metrics/load.ts'
import type { PlainStep, RepeatStep, Sport, Step, StepTargetKind } from '../../../domain/types.ts'
import { Button, IconButton } from '../../../ui/core/index.ts'
import { IconChevronDown, IconChevronUp, IconDragHandle, IconPlus, IconTrash } from '../../../ui/icons/index.ts'
import { DurationField, NumberField, Select, TextField } from '../../../ui/form/index.ts'
import { durationLabel, distanceLabel, stepSentence } from '../../athlete/workout/targets.ts'
import {
  defaultTarget,
  KIND_NAMES,
  moveItem,
  newPlainStep,
  newRepeat,
  nextStepId,
  PLAIN_KINDS,
  TARGET_KINDS,
} from './draft.ts'
import type { DraftErrors, PlainKind } from './draft.ts'
import styles from './BuilderPage.module.css'

export interface StepListProps {
  steps: Step[]
  sport: Sport
  errors: DraftErrors
  /** `key` lets the page merge a run of edits to one field into one undo step. */
  onChange: (steps: Step[], key?: string) => void
}

const KIND_OPTIONS = PLAIN_KINDS.map((k) => ({ id: k, label: KIND_NAMES[k] }))
const TARGET_OPTIONS = TARGET_KINDS.map((t) => ({ id: t.id, label: t.label }))

/** Replaces one step (top level, or inside a repeat block) by id. */
function replaceStep(steps: Step[], id: string, fn: (s: PlainStep) => PlainStep): Step[] {
  return steps.map((s) => {
    if (s.kind === 'repeat') return { ...s, steps: s.steps.map((c) => (c.id === id ? fn(c) : c)) }
    return s.id === id ? fn(s) : s
  })
}

/** A step id inside a block that no sibling uses. */
function childId(block: RepeatStep): string {
  let n = block.steps.length
  while (block.steps.some((c) => c.id === `${block.id}n${n}`)) n += 1
  return `${block.id}n${n}`
}

function setSize(s: PlainStep, sport: Sport, value: number | null): PlainStep {
  const next = { ...s }
  const v = value ?? 0
  if (sport === 'swim') {
    next.distanceM = v
    delete next.durationS
  } else {
    next.durationS = v
    delete next.distanceM
  }
  return next
}

interface PlainRowProps {
  step: PlainStep
  index: number
  total: number
  sport: Sport
  error: string | undefined
  onEdit: (fn: (s: PlainStep) => PlainStep, key?: string) => void
  onMove: (to: number) => void
  onRemove: () => void
  drag?: {
    onDragStart: (e: DragEvent) => void
  }
}

function PlainRow({ step, index, total, sport, error, onEdit, onMove, onRemove, drag }: PlainRowProps) {
  const label = `Step ${index + 1}, ${KIND_NAMES[step.kind]}`
  const target = step.target
  const isRpe = target?.kind === 'rpe'
  const useDistance = sport === 'swim' || (step.distanceM !== undefined && step.durationS === undefined)
  const k = (field: string) => `${step.id}:${field}`
  return (
    <div
      // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role
      role="group"
      aria-label={label} className={styles.group}>
      <div className={styles.stepHead}>
        {drag ? (
          <span className={styles.handle} draggable onDragStart={drag.onDragStart} aria-hidden="true">
            <IconDragHandle />
          </span>
        ) : null}
        <Select
          className={styles.stepKind}
          label="Kind"
          options={KIND_OPTIONS}
          value={step.kind}
          onChange={(id) =>
            onEdit((s) => {
              const kind = id as PlainKind
              const next: PlainStep = { ...s, kind }
              if (s.target) next.target = defaultTarget(kind, s.target.kind)
              return next
            })
          }
        />
        <span className={styles.spacer} />
        <IconButton aria-label={`Move ${label} up`} isDisabled={index === 0} onPress={() => onMove(index - 1)}>
          <IconChevronUp />
        </IconButton>
        <IconButton aria-label={`Move ${label} down`} isDisabled={index === total - 1} onPress={() => onMove(index + 1)}>
          <IconChevronDown />
        </IconButton>
        <IconButton aria-label={`Remove ${label}`} onPress={onRemove}>
          <IconTrash />
        </IconButton>
      </div>
      <div className={styles.fields}>
        {useDistance ? (
          <NumberField
            label="Distance"
            unit="m"
            minValue={0}
            maxValue={100000}
            step={25}
            value={step.distanceM ?? 0}
            onChange={(v) => onEdit((s) => setSize(s, 'swim', Number.isNaN(v) ? 0 : v), k('distance'))}
          />
        ) : (
          <DurationField
            label="Duration"
            value={step.durationS ?? 0}
            min={0}
            max={12 * 3600}
            onChange={(v) => onEdit((s) => setSize(s, sport, v), k('duration'))}
          />
        )}
        <Select
          label="Target type"
          options={TARGET_OPTIONS}
          value={target?.kind ?? 'rpe'}
          onChange={(id) =>
            onEdit((s) => ({ ...s, target: defaultTarget(s.kind as PlainKind, id as StepTargetKind) }))
          }
        />
        <NumberField
          label="Target low"
          unit={isRpe ? 'RPE' : '%'}
          minValue={isRpe ? 1 : 1}
          maxValue={isRpe ? 10 : 250}
          value={target?.low ?? 0}
          onChange={(v) =>
            onEdit((s) => (s.target ? { ...s, target: { ...s.target, low: Number.isNaN(v) ? 0 : v } } : s), k('low'))
          }
        />
        <NumberField
          label="Target high"
          unit={isRpe ? 'RPE' : '%'}
          minValue={isRpe ? 1 : 1}
          maxValue={isRpe ? 10 : 250}
          value={target?.high ?? 0}
          onChange={(v) =>
            onEdit((s) => (s.target ? { ...s, target: { ...s.target, high: Number.isNaN(v) ? 0 : v } } : s), k('high'))
          }
        />
        <TextField
          label="Note"
          value={step.note ?? ''}
          onChange={(v) =>
            onEdit((s) => {
              const next = { ...s }
              if (v) next.note = v
              else delete next.note
              return next
            }, k('note'))
          }
        />
      </div>
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  )
}

export function StepList({ steps, sport, errors, onChange }: StepListProps) {
  const dragFrom = useRef<number | null>(null)
  const keepFocus = useRef<HTMLElement | null>(null)

  // A moved row can lose focus when the browser re-inserts it: give it back.
  useEffect(() => {
    const el = keepFocus.current
    keepFocus.current = null
    if (el?.isConnected && document.activeElement !== el) el.focus()
  }, [steps])

  const add = (kind: PlainKind) => onChange([...steps, newPlainStep(kind, sport, nextStepId(steps))])
  const addRepeat = () => onChange([...steps, newRepeat(sport, steps)])

  const moveTop = (from: number, to: number) => {
    keepFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    onChange(moveItem(steps, from, to))
  }

  const altArrows = (e: KeyboardEvent, move: (delta: number) => void) => {
    if (!e.altKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return
    e.preventDefault()
    e.stopPropagation()
    move(e.key === 'ArrowUp' ? -1 : 1)
  }

  const editRepeat = (block: RepeatStep, fn: (b: RepeatStep) => RepeatStep, key?: string) =>
    onChange(
      steps.map((s) => (s.id === block.id && s.kind === 'repeat' ? fn(s) : s)),
      key,
    )

  return (
    <div className={styles.panel}>
      <h2 className={styles.panelTitle}>Steps</h2>
      {errors.steps ? (
        <p className={styles.error} role="alert">
          {errors.steps}
        </p>
      ) : null}
      <ul className={styles.steps} aria-label="Steps">
        {steps.map((s, i) => (
          <li
            key={s.id}
            className={styles.step}
            data-over={undefined}
            data-invalid={errors[s.id] ? 'true' : undefined}
            onKeyDown={(e) => altArrows(e, (d) => moveTop(i, i + d))}
            onDragOver={(e) => {
              if (dragFrom.current !== null) e.preventDefault()
            }}
            onDrop={(e) => {
              e.preventDefault()
              const from = dragFrom.current
              dragFrom.current = null
              if (from !== null && from !== i) moveTop(from, i)
            }}
          >
            {s.kind === 'repeat' ? (
              <div
                // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role
                role="group"
                aria-label={`Step ${i + 1}, Repeat block`} className={styles.group}>
                <div className={styles.stepHead}>
                  <span
                    className={styles.handle}
                    draggable
                    onDragStart={() => {
                      dragFrom.current = i
                    }}
                    aria-hidden="true"
                  >
                    <IconDragHandle />
                  </span>
                  <strong>Repeat block</strong>
                  <NumberField
                    label="Repeats"
                    minValue={1}
                    maxValue={99}
                    value={s.repeat}
                    onChange={(v) => editRepeat(s, (b) => ({ ...b, repeat: Number.isNaN(v) ? 1 : v }), `${s.id}:repeat`)}
                  />
                  <span className={styles.spacer} />
                  <IconButton aria-label={`Move step ${i + 1}, Repeat block, up`} isDisabled={i === 0} onPress={() => moveTop(i, i - 1)}>
                    <IconChevronUp />
                  </IconButton>
                  <IconButton
                    aria-label={`Move step ${i + 1}, Repeat block, down`}
                    isDisabled={i === steps.length - 1}
                    onPress={() => moveTop(i, i + 1)}
                  >
                    <IconChevronDown />
                  </IconButton>
                  <IconButton aria-label={`Remove step ${i + 1}, Repeat block`} onPress={() => onChange(steps.filter((_, j) => j !== i))}>
                    <IconTrash />
                  </IconButton>
                </div>
                <div className={styles.block}>
                  <ul className={styles.steps} aria-label={`Steps in repeat block ${i + 1}`}>
                    {s.steps.map((c, ci) => (
                      <li
                        key={c.id}
                        className={styles.step}
                        data-invalid={errors[c.id] ? 'true' : undefined}
                        onKeyDown={(e) =>
                          altArrows(e, (d) => {
                            keepFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
                            editRepeat(s, (b) => ({ ...b, steps: moveItem(b.steps, ci, ci + d) }))
                          })
                        }
                      >
                        <PlainRow
                          step={c}
                          index={ci}
                          total={s.steps.length}
                          sport={sport}
                          error={errors[c.id]}
                          onEdit={(fn, key) => onChange(replaceStep(steps, c.id, fn), key)}
                          onMove={(to) => {
                            keepFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
                            editRepeat(s, (b) => ({ ...b, steps: moveItem(b.steps, ci, to) }))
                          }}
                          onRemove={() => editRepeat(s, (b) => ({ ...b, steps: b.steps.filter((x) => x.id !== c.id) }))}
                        />
                      </li>
                    ))}
                  </ul>
                  <div className={styles.add}>
                    {(['interval', 'recovery'] as const).map((kind) => (
                      <Button
                        key={kind}
                        variant="secondary"
                        onPress={() =>
                          editRepeat(s, (b) => ({
                            ...b,
                            steps: [...b.steps, newPlainStep(kind, sport, childId(b))],
                          }))
                        }
                      >
                        <IconPlus />
                        {`Add ${kind} to block ${i + 1}`}
                      </Button>
                    ))}
                  </div>
                  {errors[s.id] ? (
                    <p className={styles.error} role="alert">
                      {errors[s.id]}
                    </p>
                  ) : null}
                </div>
              </div>
            ) : (
              <PlainRow
                step={s}
                index={i}
                total={steps.length}
                sport={sport}
                error={errors[s.id]}
                onEdit={(fn, key) => onChange(replaceStep(steps, s.id, fn), key)}
                onMove={(to) => moveTop(i, to)}
                onRemove={() => onChange(steps.filter((_, j) => j !== i))}
                drag={{
                  onDragStart: () => {
                    dragFrom.current = i
                  },
                }}
              />
            )}
          </li>
        ))}
      </ul>
      <div
        className={styles.add}
        // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role
        role="group"
        aria-label="Add a step"
      >
        {PLAIN_KINDS.map((kind) => (
          <Button key={kind} variant="secondary" onPress={() => add(kind)}>
            <IconPlus />
            {`Add ${KIND_NAMES[kind].toLowerCase()}`}
          </Button>
        ))}
        <Button variant="secondary" onPress={addRepeat}>
          <IconPlus />
          Add repeat block
        </Button>
      </div>
      <p className={styles.note}>Reorder with the arrow buttons, by dragging the handle, or with Alt+Up and Alt+Down.</p>
    </div>
  )
}

/** The read-only view under 1024 px: the steps as plain sentences. */
export function StepSummary({ steps, th }: { steps: Step[]; th: LoadThresholds }) {
  const size = (s: PlainStep) =>
    s.durationS !== undefined ? durationLabel(s.durationS) : s.distanceM !== undefined ? distanceLabel(s.distanceM) : ''
  return (
    <div className={styles.panel}>
      <h2 className={styles.panelTitle}>Steps</h2>
      <ul className={styles.steps} aria-label="Steps">
        {steps.map((s) => (
          <li key={s.id} className={styles.step}>
            {s.kind === 'repeat' ? (
              <>
                <strong>{s.repeat} ×</strong>
                <ul className={styles.steps}>
                  {s.steps.map((c) => (
                    <li key={c.id}>
                      {KIND_NAMES[c.kind]}: {stepSentence(c, th) || size(c)}
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <span>
                {KIND_NAMES[s.kind]}: {stepSentence(s, th) || size(s)}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
