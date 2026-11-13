import { useMemo, useState } from 'react'
import { VisuallyHidden } from 'react-aria-components/VisuallyHidden'
import type { AthleteId } from '../../../app/people.ts'
import { currentDay } from '../../../data/selectors.ts'
import { useLaree } from '../../../data/store.ts'
import type { PlanChange } from '../../../data/store.ts'
import { fmtNumber } from '../../../charts/index.ts'
import { relativeWeek } from '../../../domain/time.ts'
import { Button } from '../../../ui/core/index.ts'
import { Select } from '../../../ui/form/index.ts'
import type { SelectOption } from '../../../ui/form/index.ts'
import { Dialog } from '../../../ui/overlay/index.ts'
import { PHASE_LABEL, WEEKDAYS, proposeFill, toChanges, weekTotal } from './fill.ts'
import type { FillCell, FillWeek } from './fill.ts'
import styles from './SeasonPage.module.css'

export interface FillDialogProps {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  athleteId: AthleteId
  athleteName: string
  weeks: readonly number[]
  /** Called after the plan changed, with the batch label and how many sessions went in. */
  onApplied: (info: { label: string; count: number; firstWeek: number }) => void
}

const NONE = 'none'

/** Fill from library (C8): proposals per day, swap or remove one, then apply as one undo step. */
export default function FillDialog({ isOpen, onOpenChange, athleteId, athleteName, weeks, onApplied }: FillDialogProps) {
  const data = useLaree((s) => s.data)
  const applyPlanChanges = useLaree((s) => s.applyPlanChanges)
  const today = currentDay()
  const [proposal, setProposal] = useState<FillWeek[]>(() =>
    proposeFill({
      athleteId,
      weeks,
      phases: data.phases.filter((p) => p.athleteId === athleteId),
      templates: data.templates,
      planned: data.planned.filter((p) => p.athleteId === athleteId),
      races: data.races,
      today,
    }),
  )
  const templates = data.templates
  const byId = useMemo(() => new Map(templates.map((t) => [t.id, t])), [templates])

  const setCell = (week: number, key: string, templateId: string | null) =>
    setProposal((rows) =>
      rows.map((w) =>
        w.week === week ? { ...w, cells: w.cells.map((c) => (c.key === key ? { ...c, templateId } : c)) } : w,
      ),
    )
  const clearWeek = (week: number) =>
    setProposal((rows) =>
      rows.map((w) =>
        w.week === week ? { ...w, cells: w.cells.map((c) => (c.kind === 'slot' ? { ...c, templateId: null } : c)) } : w,
      ),
    )

  const count = proposal.reduce((s, w) => s + w.cells.filter((c) => c.kind === 'slot' && c.templateId).length, 0)

  const apply = () => {
    const changes: PlanChange[] = toChanges(
      athleteId,
      proposal,
      templates,
      data.planned.filter((p) => p.athleteId === athleteId),
    )
    if (changes.length === 0) return
    const label = `Filled ${changes.length} ${changes.length === 1 ? 'session' : 'sessions'} for ${athleteName}`
    const added = applyPlanChanges(changes, label)
    onOpenChange(false)
    onApplied({ label, count: added.length, firstWeek: proposal[0]?.week ?? weeks[0] ?? 1 })
  }

  const optionsFor = (cell: FillCell): SelectOption[] => [
    { id: NONE, label: 'None' },
    ...templates
      .filter((t) => t.sport === cell.sport)
      .toSorted((a, b) => a.name.localeCompare(b.name))
      .map((t) => ({ id: t.id, label: `${t.name} (Load ${fmtNumber(t.estimatedLoad)})` })),
  ]

  return (
    <Dialog
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      title="Fill from library"
      size="wide"
      footer={
        <div className={styles.dialogFooter}>
          <span className={styles.footerNote}>
            {count === 0 ? 'Nothing to apply.' : `${count} ${count === 1 ? 'session' : 'sessions'} for ${athleteName}.`}
          </span>
          <Button variant="quiet" onPress={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="primary" onPress={apply} isDisabled={count === 0}>
            Apply
          </Button>
        </div>
      }
    >
      <p className={styles.fillIntro}>
        Rule-based picks from the library. Each day matches the phase tag, the sport and the week&rsquo;s target
        Load. Down weeks come out lighter.
      </p>
      <div className={styles.fillScroll}>
        <table className={styles.fillTable}>
          <caption className={styles.srOnly}>Proposed workouts, one row per week and one column per day</caption>
          <thead>
            <tr>
              <th scope="col">Week</th>
              {WEEKDAYS.map((d) => (
                <th key={d} scope="col">
                  {d}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {proposal.map((w) => {
              const total = weekTotal(
                {
                  ...w,
                  cells: w.cells,
                },
                templates,
              )
              const target = w.target?.loadTarget
              const gap = target === undefined ? 0 : target - total
              const rel = relativeWeek(w.week)
              return (
                <tr key={w.week}>
                  <th scope="row" className={styles.fillWeek}>
                    <span className={styles.fillWeekName}>
                      Week {w.week}
                      {w.target?.downWeek ? ' (down week)' : ''}
                    </span>
                    <span className={styles.fillMeta}>
                      {w.phaseKind ? PHASE_LABEL[w.phaseKind] : 'No phase'}
                      {rel === 0 ? ', this week' : rel > 0 ? `, in ${rel} wk` : ''}
                    </span>
                    {w.target ? (
                      <span className={styles.fillMeta}>
                        Target Load {fmtNumber(w.target.loadTarget)}, {fmtNumber(w.target.hoursTarget)} h
                      </span>
                    ) : null}
                    <span className={styles.fillMeta} data-testid={`fill-total-${w.week}`}>
                      Proposed Load {fmtNumber(total)}
                      {target !== undefined && gap > 0 ? `, ${fmtNumber(gap)} below target` : ''}
                    </span>
                    <Button variant="quiet" onPress={() => clearWeek(w.week)}>
                      Clear week {w.week}
                    </Button>
                  </th>
                  {w.cells.map((c) => (
                    <td key={c.key} className={styles.fillCell} data-kind={c.kind}>
                      {c.kind === 'slot' ? (
                        <>
                          <Select
                            label={<VisuallyHidden>{`Week ${w.week}, ${WEEKDAYS[c.weekday]}`}</VisuallyHidden>}
                            options={optionsFor(c)}
                            value={c.templateId ?? NONE}
                            onChange={(id) => setCell(w.week, c.key, id === NONE ? null : id)}
                            placeholder="None"
                            className={styles.fillSelect}
                          />
                          {c.templateId ? (
                            <span className={styles.fillMeta}>Load {fmtNumber(byId.get(c.templateId)?.estimatedLoad ?? 0)}</span>
                          ) : (
                            <span className={styles.fillMeta}>{c.note}</span>
                          )}
                        </>
                      ) : (
                        <span className={styles.fillMeta}>
                          <VisuallyHidden>{`Week ${w.week}, ${WEEKDAYS[c.weekday]}: `}</VisuallyHidden>
                          {c.kind === 'planned' ? `Already planned: ${c.note}` : c.kind === 'rest' ? c.note : c.note}
                        </span>
                      )}
                    </td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </Dialog>
  )
}
