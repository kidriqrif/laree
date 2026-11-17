import { useEffect, useRef } from 'react'
import { ATHLETES } from '../../app/people.ts'
import type { AthleteId } from '../../app/people.ts'
import { IconButton } from '../../ui/core/index.ts'
import { Select } from '../../ui/form/index.ts'
import { IconChevronLeft, IconChevronRight } from '../../ui/icons/index.ts'
import styles from './AthleteSwitcher.module.css'

type Control = 'prev' | 'next' | 'picker'

/**
 * The control that last switched athlete, and to whom. Some screens key their content by athlete, so
 * a switch unmounts the control that had the focus; the new switcher takes it back on mount. Module
 * scope, because that state has to outlive the component that set it.
 */
let refocus: { control: Control; id: AthleteId } | null = null

/**
 * Whose plan, season or numbers a coach screen shows, in the same place on every such screen. The
 * arrows step through the team in one tap and wrap round, as `[` and `]` do. The picker reaches anyone
 * in two, and stays one control whatever the names' length or the team's size. With one athlete there
 * is no one to switch to, so it shows nothing.
 */
export function AthleteSwitcher({ value, onChange }: { value: AthleteId; onChange: (id: AthleteId) => void }) {
  const prevButton = useRef<HTMLButtonElement>(null)
  const nextButton = useRef<HTMLButtonElement>(null)
  const picker = useRef<HTMLDivElement>(null)

  // A keyboard user who pressed "Next athlete" can press it again without finding it first.
  useEffect(() => {
    const pending = refocus
    refocus = null
    if (pending?.id !== value) return
    const target =
      pending.control === 'prev'
        ? prevButton.current
        : pending.control === 'next'
          ? nextButton.current
          : picker.current?.querySelector('button')
    if (target && document.activeElement !== target) target.focus()
  }, [value])

  const team = ATHLETES
  if (team.length < 2) return null
  const at = Math.max(
    team.findIndex((a) => a.id === value),
    0,
  )
  const prev = team[(at - 1 + team.length) % team.length]
  const next = team[(at + 1) % team.length]
  const go = (control: Control, id: AthleteId) => {
    if (id === value) return
    refocus = { control, id }
    onChange(id)
  }
  return (
    <fieldset className={styles.switcher} aria-label="Switch athlete">
      {prev ? (
        <IconButton
          ref={prevButton}
          variant="secondary"
          aria-label={`Previous athlete, ${prev.name}`}
          onPress={() => go('prev', prev.id)}
        >
          <IconChevronLeft size={20} aria-hidden="true" />
        </IconButton>
      ) : null}
      <Select
        ref={picker}
        aria-label="Athlete"
        className={styles.picker}
        options={team.map((a) => ({ id: a.id, label: a.name }))}
        value={value}
        onChange={(id) => {
          const chosen = team.find((a) => a.id === id)
          if (chosen) go('picker', chosen.id)
        }}
      />
      {next ? (
        <IconButton
          ref={nextButton}
          variant="secondary"
          aria-label={`Next athlete, ${next.name}`}
          onPress={() => go('next', next.id)}
        >
          <IconChevronRight size={20} aria-hidden="true" />
        </IconButton>
      ) : null}
    </fieldset>
  )
}
