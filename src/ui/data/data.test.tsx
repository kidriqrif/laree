import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { DataTable, DateStrip, DragGrid } from './index.ts'
import type { DragGridColumn, DragGridMove } from './index.ts'

afterEach(cleanup)

interface Row {
  id: string
  name: string
  load: number
}
const ROWS: Row[] = [
  { id: 'a', name: 'Bea', load: 40 },
  { id: 'b', name: 'Adam', load: 90 },
  { id: 'c', name: 'Cal', load: 10 },
]
const COLUMNS = [
  { id: 'name', label: 'Athlete', sortable: true, value: (r: Row) => r.name },
  { id: 'load', label: 'Load', numeric: true, sortable: true, value: (r: Row) => r.load },
]

function names(): string[] {
  return screen
    .getAllByRole('row')
    .slice(1)
    .map((r) => within(r).getAllByRole('rowheader')[0]?.textContent ?? '')
}

describe('DataTable', () => {
  it('sorts and sets aria-sort', async () => {
    render(<DataTable aria-label="Roster" columns={COLUMNS} rows={ROWS} getRowId={(r) => r.id} />)
    const nameHeader = screen.getByRole('columnheader', { name: /Athlete/ })
    expect(nameHeader.getAttribute('aria-sort')).toBe('none')
    fireEvent.click(nameHeader)
    expect(screen.getByRole('columnheader', { name: /Athlete/ }).getAttribute('aria-sort')).toBe('ascending')
    expect(names()).toEqual(['Adam', 'Bea', 'Cal'])
    fireEvent.click(screen.getByRole('columnheader', { name: /Athlete/ }))
    expect(screen.getByRole('columnheader', { name: /Athlete/ }).getAttribute('aria-sort')).toBe('descending')
    expect(names()).toEqual(['Cal', 'Bea', 'Adam'])
  })

  it('sorts numbers numerically', () => {
    render(<DataTable aria-label="Roster" columns={COLUMNS} rows={ROWS} getRowId={(r) => r.id} defaultSort={{ column: 'load', direction: 'descending' }} />)
    expect(names()).toEqual(['Adam', 'Bea', 'Cal'])
  })

  it('selects rows from the keyboard', () => {
    let selected: unknown = null
    render(
      <DataTable
        aria-label="Roster"
        columns={COLUMNS}
        rows={ROWS}
        getRowId={(r) => r.id}
        selectionMode="multiple"
        onSelectionChange={(k) => {
          selected = k
        }}
      />,
    )
    const row = screen.getAllByRole('row')[1]!
    act(() => row.focus())
    fireEvent.keyDown(row, { key: ' ' })
    fireEvent.keyUp(row, { key: ' ' })
    expect(selected instanceof Set ? [...(selected as Set<string>)] : selected).toEqual(['a'])
    expect(screen.getAllByRole('row')[1]!.getAttribute('aria-selected')).toBe('true')
  })

  it('shows the empty slot', () => {
    render(<DataTable aria-label="Roster" columns={COLUMNS} rows={[]} getRowId={(r) => r.id} emptyState="No athletes yet" />)
    expect(screen.getByText('No athletes yet')).toBeTruthy()
  })
})

describe('DateStrip', () => {
  function Strip() {
    const [day, setDay] = useState(7 * 16 + 2)
    return <DateStrip week={17} value={day} onChange={setDay} today={7 * 16 + 2} />
  }

  it('shows seven days starting Monday and marks today', () => {
    render(<Strip />)
    const days = screen.getAllByRole('radio')
    expect(days).toHaveLength(7)
    expect(days[0]!.getAttribute('aria-label')).toMatch(/^Monday/)
    expect(days[2]!.getAttribute('aria-label')).toMatch(/today/)
  })

  it('moves with arrow keys', () => {
    render(<Strip />)
    const days = () => screen.getAllByRole('radio')
    act(() => days()[2]!.focus())
    fireEvent.keyDown(days()[2]!, { key: 'ArrowRight' })
    expect(days()[3]!.getAttribute('aria-checked')).toBe('true')
    expect(document.activeElement).toBe(days()[3])
    fireEvent.keyDown(days()[3]!, { key: 'End' })
    expect(days()[6]!.getAttribute('aria-checked')).toBe('true')
    fireEvent.keyDown(days()[6]!, { key: 'ArrowRight' })
    expect(days()[6]!.getAttribute('aria-checked')).toBe('true')
    fireEvent.keyDown(days()[6]!, { key: 'Home' })
    expect(days()[0]!.getAttribute('aria-checked')).toBe('true')
  })
})

describe('DragGrid keyboard move', () => {
  function Grid() {
    const [cols, setCols] = useState<DragGridColumn[]>([
      { key: 'mon', label: 'Monday', items: [{ id: 's1', label: 'Easy run' }] },
      { key: 'tue', label: 'Tuesday', items: [] },
      { key: 'wed', label: 'Wednesday', items: [] },
    ])
    const onMove = (m: DragGridMove) =>
      setCols((prev) => {
        const item = prev.flatMap((c) => c.items).find((i) => i.id === m.itemId)
        if (!item) return prev
        return prev.map((c) => {
          const rest = c.items.filter((i) => i.id !== m.itemId)
          if (c.key !== m.to) return { ...c, items: rest }
          const next = [...rest]
          next.splice(m.index, 0, item)
          return { ...c, items: next }
        })
      })
    return <DragGrid columns={cols} onMove={onMove} />
  }

  it('moves an item with Move, arrows and Enter, and announces each step', () => {
    render(<Grid />)
    const live = screen.getByRole('status')
    fireEvent.click(screen.getByRole('button', { name: 'Move Easy run' }))
    expect(live.textContent).toMatch(/Picked up Easy run from Monday/)
    const root = screen.getByRole("group", { name: "Sessions by day" })
    fireEvent.keyDown(root.querySelector('[data-item-id]')!, { key: 'ArrowRight' })
    expect(live.textContent).toMatch(/Tuesday/)
    fireEvent.keyDown(root.querySelector('[data-item-id]')!, { key: 'ArrowRight' })
    expect(live.textContent).toMatch(/Wednesday/)
    fireEvent.keyDown(root.querySelector('[data-item-id]')!, { key: 'Enter' })
    expect(live.textContent).toMatch(/Dropped Easy run on Wednesday/)
    const wed = screen.getByRole('region', { name: 'Wednesday' })
    expect(within(wed).getByText('Easy run')).toBeTruthy()
    const mon = screen.getByRole('region', { name: 'Monday' })
    expect(within(mon).queryByText('Easy run')).toBeNull()
  })

  it('cancels with Escape', () => {
    render(<Grid />)
    const live = screen.getByRole('status')
    fireEvent.click(screen.getByRole('button', { name: 'Move Easy run' }))
    const root = screen.getByRole("group", { name: "Sessions by day" })
    fireEvent.keyDown(root.querySelector('[data-item-id]')!, { key: 'ArrowRight' })
    fireEvent.keyDown(root.querySelector('[data-item-id]')!, { key: 'Escape' })
    expect(live.textContent).toMatch(/Move cancelled/)
    expect(within(screen.getByRole('region', { name: 'Monday' })).getByText('Easy run')).toBeTruthy()
  })
})
