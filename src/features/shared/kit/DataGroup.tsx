import { useMemo, useState } from 'react'
import { Button, EmptyState, Skeleton, StatusChip } from '../../../ui/core/index.ts'
import { DataTable, DateStrip, DragGrid } from '../../../ui/data/index.ts'
import type { DataTableColumn, DragGridColumn, DragGridMove } from '../../../ui/data/index.ts'
import { ATHLETES } from '../../../data/seed/people.ts'
import { weekOfDay } from '../../../domain/time.ts'
import { Pin } from './Pin.tsx'
import { getSample } from './sample.ts'
import { Group, Specimen, State } from './Specimen.tsx'

const FROM = 'src/ui/data/index.ts'

interface Row {
  id: string
  name: string
  fitness: number
  form: number
  compliance: number | null
  flags: number
}

const COLUMNS: DataTableColumn<Row>[] = [
  { id: 'name', label: 'Athlete', isRowHeader: true, sortable: true, value: (r) => r.name },
  { id: 'fitness', label: 'Fitness', numeric: true, sortable: true, value: (r) => r.fitness },
  { id: 'form', label: 'Form', numeric: true, sortable: true, value: (r) => r.form },
  {
    id: 'compliance',
    label: 'This week',
    numeric: true,
    sortable: true,
    value: (r) => r.compliance,
    render: (r) => (r.compliance === null ? 'No plan' : `${Math.round(r.compliance)}%`),
  },
  {
    id: 'flags',
    label: 'Flags',
    value: (r) => r.flags,
    render: (r) => <StatusChip status={r.flags > 0 ? 'partial' : 'on-plan'} label={r.flags > 0 ? `${r.flags} open` : 'None'} />,
  },
]

export function DataGroup() {
  const sample = getSample()
  const rows = useMemo<Row[]>(
    () =>
      sample.roster.map((r) => ({
        id: r.athleteId,
        name: ATHLETES.find((a) => a.id === r.athleteId)?.name ?? r.athleteId,
        fitness: Math.round(r.fitness),
        form: Math.round(r.form),
        compliance: r.compliance,
        flags: r.openFlags,
      })),
    [sample.roster],
  )
  const week = weekOfDay(sample.today)
  const [day, setDay] = useState(sample.today)
  const [acted, setActed] = useState<string | null>(null)
  const [columns, setColumns] = useState<DragGridColumn[]>(() => [
    {
      key: 'mon',
      label: 'Monday',
      items: [
        { id: 'swim', label: 'Swim: 2 km endurance' },
        { id: 'strength', label: 'Strength: 40 min' },
      ],
    },
    { key: 'tue', label: 'Tuesday', items: [{ id: 'run', label: 'Run: tempo 8 km' }] },
    { key: 'wed', label: 'Wednesday', items: [] },
  ])
  const move = ({ itemId, from, to, index }: DragGridMove) =>
    setColumns((cols) => {
      const item = cols.find((c) => c.key === from)?.items.find((i) => i.id === itemId)
      if (!item) return cols
      return cols.map((c) => {
        const kept = c.items.filter((i) => i.id !== itemId)
        if (c.key !== to) return { ...c, items: kept }
        kept.splice(Math.min(index, kept.length), 0, item)
        return { ...c, items: kept }
      })
    })

  return (
    <Group
      title="Data"
      importPath={FROM}
      intro="The roster table, the week strip and the drag grid. The table is keyboard-first: arrow keys move between rows, Enter opens one."
    >
      <Specimen name="DataTable" covers={['DataTable']} from={FROM} wide note={acted ? `Opened ${acted}.` : 'Click a column heading to sort. Select a row and press Enter to open it.'}>
        <State label="Default" wide>
          <DataTable
            aria-label="Roster"
            columns={COLUMNS}
            rows={rows}
            getRowId={(r) => r.id}
            defaultSort={{ column: 'name', direction: 'ascending' }}
            selectionMode="single"
            onRowAction={(r) => setActed(r.name)}
          />
        </State>
        <State label="Row actions and multiple selection" wide>
          <DataTable
            aria-label="Roster with actions"
            columns={COLUMNS}
            rows={rows}
            getRowId={(r) => r.id}
            selectionMode="multiple"
            rowActionsLabel="Row actions"
            rowActions={(r) => (
              <Button variant="quiet" onPress={() => setActed(r.name)}>
                Open
              </Button>
            )}
          />
        </State>
        <State label="Empty" wide>
          <DataTable
            aria-label="Empty roster"
            columns={COLUMNS}
            rows={[]}
            getRowId={(r) => r.id}
            emptyState={<EmptyState title="No athletes yet" description="Invite an athlete to start planning." headingLevel={4} />}
          />
        </State>
        <State label="Loading" wide>
          <div aria-busy="true" style={{ display: 'grid', gap: 'var(--space-2)', inlineSize: '100%' }}>
            <Skeleton height="1.75rem" />
            <Skeleton height="1.75rem" />
            <Skeleton height="1.75rem" />
          </div>
        </State>
      </Specimen>

      <Specimen
        name="DateStrip"
        covers={['DateStrip']}
        from={FROM}
        note="One tab stop; arrow keys move and select a day. Dots mark days with a session."
      >
        <State label="Default" wide>
          <DateStrip
            week={week}
            value={day}
            onChange={setDay}
            today={sample.today}
            marks={{ [sample.today]: <span aria-hidden="true">•</span> }}
            markLabels={{ [sample.today]: 'Session planned' }}
          />
        </State>
        <State label="Focus (pinned)" wide>
          <Pin state="focus">
            <DateStrip week={week} value={sample.today} onChange={() => {}} today={sample.today} />
          </Pin>
        </State>
      </Specimen>

      <Specimen
        name="DragGrid"
        covers={['DragGrid']}
        from={FROM}
        wide
        note="Drag a card to another day, or focus it and use the move menu. Dragging is never the only way."
      >
        <State label="Default" wide>
          <DragGrid aria-label="Week 18 sessions" columns={columns} onMove={move} />
        </State>
        <State label="Empty" wide>
          <DragGrid aria-label="Empty week" columns={[{ key: 'thu', label: 'Thursday', items: [] }]} onMove={() => {}} emptyLabel="Nothing planned" />
        </State>
      </Specimen>
    </Group>
  )
}
