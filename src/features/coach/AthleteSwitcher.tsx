import { ATHLETES } from '../../app/people.ts'
import type { AthleteId } from '../../app/people.ts'
import { IconButton } from '../../ui/core/index.ts'
import { Select } from '../../ui/form/index.ts'
import { IconChevronLeft, IconChevronRight } from '../../ui/icons/index.ts'
import styles from './AthleteSwitcher.module.css'

/**
 * Whose plan, season or numbers a coach screen shows, in the same place on every such screen. The
 * arrows step through the team in one tap and wrap round, as `[` and `]` do. The picker reaches anyone
 * in two, and stays one control whatever the names' length or the team's size. With one athlete there
 * is no one to switch to, so it shows nothing.
 */
export function AthleteSwitcher({ value, onChange }: { value: AthleteId; onChange: (id: AthleteId) => void }) {
  const team = ATHLETES
  if (team.length < 2) return null
  const at = Math.max(
    team.findIndex((a) => a.id === value),
    0,
  )
  const prev = team[(at - 1 + team.length) % team.length]
  const next = team[(at + 1) % team.length]
  return (
    <fieldset className={styles.switcher} aria-label="Switch athlete">
      {prev ? (
        <IconButton variant="secondary" aria-label={`Previous athlete, ${prev.name}`} onPress={() => onChange(prev.id)}>
          <IconChevronLeft size={20} aria-hidden="true" />
        </IconButton>
      ) : null}
      <Select
        aria-label="Athlete"
        className={styles.picker}
        options={team.map((a) => ({ id: a.id, label: a.name }))}
        value={value}
        onChange={(id) => {
          const chosen = team.find((a) => a.id === id)
          if (chosen) onChange(chosen.id)
        }}
      />
      {next ? (
        <IconButton variant="secondary" aria-label={`Next athlete, ${next.name}`} onPress={() => onChange(next.id)}>
          <IconChevronRight size={20} aria-hidden="true" />
        </IconButton>
      ) : null}
    </fieldset>
  )
}
