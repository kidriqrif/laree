import { useCallback, useRef, useState } from 'react'
import type { KeyboardEvent, ReactNode } from 'react'
import { Button, GridList, GridListItem, useDragAndDrop } from 'react-aria-components'
import styles from './DragGrid.module.css'

export interface DragGridItem {
  id: string
  /** Plain-text name, used in announcements and accessible names. */
  label: string
  /** Optional richer content for the card. */
  content?: ReactNode
}

export interface DragGridColumn {
  key: string
  /** Column heading, for example "Monday 10". */
  label: string
  items: DragGridItem[]
}

export interface DragGridMove {
  itemId: string
  from: string
  to: string
  /** Index in the target column after the move. */
  index: number
}

export interface DragGridProps {
  columns: DragGridColumn[]
  /** Called for both pointer drops and keyboard drops; the parent owns the data. */
  onMove: (move: DragGridMove) => void
  'aria-label'?: string
  className?: string
  emptyLabel?: string
  moveLabel?: string
}

const DRAG_TYPE = 'application/x-laree-session'

interface DayListProps {
  column: DragGridColumn
  isMoveTarget: boolean
  movingId: string | null
  emptyLabel: string
  moveLabel: string
  onStartMove: (itemId: string, from: string) => void
  onMove: (move: DragGridMove) => void
}

function DayList({ column, isMoveTarget, movingId, emptyLabel, moveLabel, onStartMove, onMove }: DayListProps) {
  const { dragAndDropHooks } = useDragAndDrop({
    getItems: (keys) =>
      [...keys].map((k) => ({ [DRAG_TYPE]: JSON.stringify({ id: String(k), from: column.key }) })),
    acceptedDragTypes: [DRAG_TYPE],
    getAllowedDropOperations: () => ['move'],
    onRootDrop: async (e) => {
      const first = e.items[0]
      if (!first || first.kind !== 'text') return
      const data = JSON.parse(await first.getText(DRAG_TYPE)) as { id: string; from: string }
      onMove({ itemId: data.id, from: data.from, to: column.key, index: column.items.length })
    },
    onInsert: async (e) => {
      const first = e.items[0]
      if (!first || first.kind !== 'text') return
      const data = JSON.parse(await first.getText(DRAG_TYPE)) as { id: string; from: string }
      const at = column.items.findIndex((i) => i.id === String(e.target.key))
      const index = at < 0 ? column.items.length : e.target.dropPosition === 'before' ? at : at + 1
      onMove({ itemId: data.id, from: data.from, to: column.key, index })
    },
    onReorder: (e) => {
      const id = String([...e.keys][0])
      const at = column.items.findIndex((i) => i.id === String(e.target.key))
      const index = e.target.dropPosition === 'before' ? at : at + 1
      onMove({ itemId: id, from: column.key, to: column.key, index })
    },
  })

  return (
    <section className={styles.column} data-move-target={isMoveTarget || undefined} aria-label={column.label}>
      <h3 className={styles.heading}>{column.label}</h3>
      <GridList
        aria-label={column.label}
        className={styles.list}
        dragAndDropHooks={dragAndDropHooks}
        renderEmptyState={() => <div className={styles.empty}>{emptyLabel}</div>}
      >
        {column.items.map((item) => (
          <GridListItem
            key={item.id}
            id={item.id}
            textValue={item.label}
            className={styles.item}
            data-moving={item.id === movingId || undefined}
          >
            <span className={styles.itemBody}>{item.content ?? item.label}</span>
            <Button
              className={styles.moveButton}
              aria-label={`${moveLabel} ${item.label}`}
              data-item-id={item.id}
              onPress={() => onStartMove(item.id, column.key)}
            >
              {moveLabel}
            </Button>
          </GridListItem>
        ))}
      </GridList>
    </section>
  )
}

interface MoveState {
  itemId: string
  from: string
  target: string
}

/**
 * Columns of draggable cards. Pointer: drag between columns. Keyboard: press Move on a card,
 * choose a column with the arrow keys, Enter drops, Escape cancels. Each step is announced.
 */
export function DragGrid({
  columns,
  onMove,
  'aria-label': ariaLabel = 'Sessions by day',
  className,
  emptyLabel = 'Nothing planned',
  moveLabel = 'Move',
}: DragGridProps) {
  const [moving, setMoving] = useState<MoveState | null>(null)
  const [announcement, setAnnouncement] = useState('')
  const rootRef = useRef<HTMLDivElement>(null)

  const labelOf = useCallback(
    (key: string) => columns.find((c) => c.key === key)?.label ?? key,
    [columns],
  )
  const itemLabel = useCallback(
    (id: string) => columns.flatMap((c) => c.items).find((i) => i.id === id)?.label ?? 'Session',
    [columns],
  )

  const refocus = (itemId: string) => {
    requestAnimationFrame(() => {
      const el = rootRef.current?.querySelector<HTMLElement>(`[data-item-id="${CSS.escape(itemId)}"]`)
      el?.focus()
    })
  }

  const start = (itemId: string, from: string) => {
    setMoving({ itemId, from, target: from })
    setAnnouncement(
      `Picked up ${itemLabel(itemId)} from ${labelOf(from)}. Use the arrow keys to choose a day, Enter to drop, Escape to cancel.`,
    )
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!moving) return
    const idx = columns.findIndex((c) => c.key === moving.target)
    let nextIdx = idx
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') nextIdx = Math.min(columns.length - 1, idx + 1)
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') nextIdx = Math.max(0, idx - 1)
    else if (e.key === 'Home') nextIdx = 0
    else if (e.key === 'End') nextIdx = columns.length - 1
    else if (e.key === 'Enter') {
      e.preventDefault()
      e.stopPropagation()
      const target = columns[idx]
      if (!target) return
      const name = itemLabel(moving.itemId)
      if (target.key === moving.from) {
        setAnnouncement(`${name} stays on ${target.label}.`)
      } else {
        const count = target.items.length + 1
        onMove({ itemId: moving.itemId, from: moving.from, to: target.key, index: target.items.length })
        setAnnouncement(`Dropped ${name} on ${target.label}, position ${count} of ${count}.`)
      }
      refocus(moving.itemId)
      setMoving(null)
      return
    } else if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      setAnnouncement(`Move cancelled. ${itemLabel(moving.itemId)} stays on ${labelOf(moving.from)}.`)
      refocus(moving.itemId)
      setMoving(null)
      return
    } else if (e.key === 'Tab') {
      setAnnouncement('Move cancelled.')
      setMoving(null)
      return
    } else {
      return
    }
    e.preventDefault()
    e.stopPropagation()
    const next = columns[nextIdx]
    if (!next) return
    setMoving({ ...moving, target: next.key })
    setAnnouncement(
      next.key === moving.from
        ? `${next.label}, the original day. Enter to keep it here.`
        : `${next.label}, ${next.items.length} sessions. Enter to drop here.`,
    )
  }

  return (
    <div
      ref={rootRef}
      // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role
      role="group"
      aria-label={ariaLabel}
      className={[styles.grid, className].filter(Boolean).join(' ')}
      data-moving={moving ? '' : undefined}
      onKeyDownCapture={handleKeyDown}
    >
      {columns.map((c) => (
        <DayList
          key={c.key}
          column={c}
          isMoveTarget={moving?.target === c.key}
          movingId={moving?.itemId ?? null}
          emptyLabel={emptyLabel}
          moveLabel={moveLabel}
          onStartMove={start}
          onMove={onMove}
        />
      ))}
      <output className="sr-only" aria-live="polite" aria-atomic="true">
        {announcement}
      </output>
    </div>
  )
}
