import { useMemo, useState } from 'react'
import type { Key, ReactNode } from 'react'
import { Cell, Checkbox, Column, Row, Table, TableBody, TableHeader } from 'react-aria-components'
import type { Selection, SortDescriptor } from 'react-aria-components'
import styles from './DataTable.module.css'

export interface DataTableColumn<T> {
  id: string
  label: string
  /** Right-aligned mono tabular figures. */
  numeric?: boolean
  sortable?: boolean
  /** The cell that names the row (for screen readers). Defaults to the first column. */
  isRowHeader?: boolean
  /** Value used for sorting and as the default cell text. */
  value: (row: T) => string | number | null | undefined
  /** Custom cell content. */
  render?: (row: T) => ReactNode
  width?: string
}

export interface DataTableProps<T> {
  /** Accessible name for the table. */
  'aria-label': string
  columns: DataTableColumn<T>[]
  rows: T[]
  getRowId: (row: T) => string
  /** Initial sort. */
  defaultSort?: SortDescriptor
  sort?: SortDescriptor
  onSortChange?: (sort: SortDescriptor) => void
  selectionMode?: 'none' | 'single' | 'multiple'
  selectedKeys?: Selection
  onSelectionChange?: (keys: Selection) => void
  /** Enter or click on a row. */
  onRowAction?: (row: T) => void
  /** Optional last-column actions. */
  rowActions?: (row: T) => ReactNode
  rowActionsLabel?: string
  /** Shown when there are no rows. */
  emptyState?: ReactNode
  className?: string
  /** Max block size before the body scrolls under the sticky header. */
  maxHeight?: string
}

function compare(a: string | number | null | undefined, b: string | number | null | undefined): number {
  if (a == null && b == null) return 0
  if (a == null) return 1
  if (b == null) return -1
  if (typeof a === 'number' && typeof b === 'number') return a - b
  return String(a).localeCompare(String(b), 'en-GB', { numeric: true, sensitivity: 'base' })
}

function SelectBox() {
  return (
    <Checkbox slot="selection" className={styles.checkbox}>
      <span className={styles.box} aria-hidden="true" />
    </Checkbox>
  )
}

export function DataTable<T>({
  columns,
  rows,
  getRowId,
  defaultSort,
  sort,
  onSortChange,
  selectionMode = 'none',
  selectedKeys,
  onSelectionChange,
  onRowAction,
  rowActions,
  rowActionsLabel = 'Actions',
  emptyState,
  className,
  maxHeight,
  'aria-label': ariaLabel,
}: DataTableProps<T>) {
  const [innerSort, setInnerSort] = useState<SortDescriptor | undefined>(defaultSort)
  const active = sort ?? innerSort

  const sorted = useMemo(() => {
    if (!active) return rows
    const col = columns.find((c) => c.id === active.column)
    if (!col) return rows
    const dir = active.direction === 'descending' ? -1 : 1
    return rows.toSorted((x, y) => dir * compare(col.value(x), col.value(y)))
  }, [rows, columns, active])

  const rowHeaderId = columns.find((c) => c.isRowHeader)?.id ?? columns[0]?.id
  const empty = rows.length === 0

  const handleSort = (next: SortDescriptor) => {
    setInnerSort(next)
    onSortChange?.(next)
  }

  const handleAction = (key: Key) => {
    const row = rows.find((r) => getRowId(r) === String(key))
    if (row) onRowAction?.(row)
  }

  return (
    <div
      className={[styles.wrap, className].filter(Boolean).join(' ')}
      style={maxHeight ? { maxBlockSize: maxHeight } : undefined}
      data-empty={empty || undefined}
    >
      <Table
        aria-label={ariaLabel}
        className={styles.table}
        {...(active ? { sortDescriptor: active } : {})}
        onSortChange={handleSort}
        selectionMode={selectionMode}
        {...(selectedKeys !== undefined ? { selectedKeys } : {})}
        {...(onSelectionChange ? { onSelectionChange } : {})}
        {...(onRowAction ? { onRowAction: handleAction } : {})}
      >
        <TableHeader className={styles.header}>
          {selectionMode === 'multiple' ? (
            <Column className={[styles.column, styles.check].join(' ')} width={40}>
              <SelectBox />
            </Column>
          ) : null}
          {columns.map((c) => (
            <Column
              key={c.id}
              id={c.id}
              allowsSorting={c.sortable ?? false}
              isRowHeader={c.id === rowHeaderId}
              className={styles.column}
              data-numeric={c.numeric || undefined}
            >
              {({ allowsSorting, sortDirection }) => (
                <span className={styles.colInner}>
                  {c.label}
                  {allowsSorting ? (
                    <span className={styles.sortMark} aria-hidden="true" data-direction={sortDirection ?? 'none'}>
                      {sortDirection === 'ascending' ? '↑' : sortDirection === 'descending' ? '↓' : '↕'}
                    </span>
                  ) : null}
                </span>
              )}
            </Column>
          ))}
          {rowActions ? (
            <Column className={[styles.column, styles.actions].join(' ')}>
              <span className="sr-only">{rowActionsLabel}</span>
            </Column>
          ) : null}
        </TableHeader>
        <TableBody renderEmptyState={() => <div className={styles.empty}>{emptyState}</div>}>
          {sorted.map((row) => (
            <Row key={getRowId(row)} id={getRowId(row)} className={styles.row}>
              {selectionMode === 'multiple' ? (
                <Cell className={[styles.cell, styles.check].join(' ')}>
                  <SelectBox />
                </Cell>
              ) : null}
              {columns.map((c) => (
                <Cell key={c.id} className={styles.cell} data-numeric={c.numeric || undefined}>
                  {c.render ? c.render(row) : (c.value(row) ?? '')}
                </Cell>
              ))}
              {rowActions ? <Cell className={[styles.cell, styles.actions].join(' ')}>{rowActions(row)}</Cell> : null}
            </Row>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
