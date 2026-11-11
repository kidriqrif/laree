/* oxlint-disable jsx-a11y/prefer-tag-over-role, jsx-a11y/interactive-supports-focus -- a combobox with aria-activedescendant needs listbox and option roles */
import { useId, useMemo, useState, type KeyboardEvent } from 'react'
import { useNavigate } from 'react-router'
import { Dialog } from '../../ui/overlay/index.ts'
import { useViewer } from '../viewer.ts'
import { useLaree } from '../../data/store.ts'
import { buildDestinations, DESTINATION_GROUPS, filterDestinations, type Destination } from './destinations.ts'
import styles from './Keyboard.module.css'

export interface JumpToProps {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
}

/** C21: a search field over athletes and screens. Arrow keys move, Enter goes. */
export function JumpTo({ isOpen, onOpenChange }: JumpToProps) {
  return (
    <Dialog isOpen={isOpen} onOpenChange={onOpenChange} title="Jump to" register="coach" data-testid="jump-to">
      {isOpen ? <JumpToBody onDone={() => onOpenChange(false)} /> : null}
    </Dialog>
  )
}

function JumpToBody({ onDone }: { onDone: () => void }) {
  const navigate = useNavigate()
  const athleteId = useViewer((s) => s.coachAthleteId)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const uid = useId()
  const listId = `${uid}-list`
  const templates = useLaree((s) => s.data.templates)
  const races = useLaree((s) => s.data.races)
  const all = useMemo(() => buildDestinations(athleteId, { templates, races }), [athleteId, templates, races])
  const results = useMemo(() => filterDestinations(all, query), [all, query])
  const current = Math.min(active, Math.max(results.length - 1, 0))
  const optionId = (d: Destination) => `${uid}-${d.id}`

  const go = (d: Destination | undefined) => {
    if (!d) return
    onDone()
    navigate(d.to)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive(results.length ? (current + 1) % results.length : 0)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive(results.length ? (current - 1 + results.length) % results.length : 0)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      go(results[current])
    }
  }

  const groups = DESTINATION_GROUPS.map((g) => ({ name: g, items: results.filter((r) => r.group === g) }))
    .filter((g) => g.items.length > 0)

  return (
    <div className={styles.jump}>
      <input
        className={styles.search}
        type="text"
        role="combobox"
        aria-label="Search athletes, sections, workouts and races"
        aria-expanded={results.length > 0}
        aria-controls={listId}
        aria-activedescendant={results[current] ? optionId(results[current]) : undefined}
        aria-autocomplete="list"
        placeholder="Search athletes, sections, workouts and races"
        autoComplete="off"
        // eslint-disable-next-line jsx-a11y/no-autofocus
        autoFocus
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          setActive(0)
        }}
        onKeyDown={onKeyDown}
      />
      <p className={styles.srOnly} role="status">
        {results.length === 0 ? 'No results' : `${results.length} result${results.length === 1 ? '' : 's'}`}
      </p>
      <div id={listId} role="listbox" aria-label="Results" className={styles.results}>
        {groups.map((g) => (
          <div key={g.name} role="group" aria-label={g.name}>
            <p className={styles.groupLabel} aria-hidden="true">
              {g.name}
            </p>
            {g.items.map((d) => (
              // Options are driven from the search field with aria-activedescendant; the mouse click is a convenience.
              // eslint-disable-next-line jsx-a11y/click-events-have-key-events
              <div
                key={d.id}
                id={optionId(d)}
                role="option"
                aria-selected={results[current] === d}
                data-active={results[current] === d || undefined}
                className={styles.option}
                onMouseMove={() => setActive(results.indexOf(d))}
                onClick={() => go(d)}
              >
                {d.label}
              </div>
            ))}
          </div>
        ))}
      </div>
      {results.length === 0 ? <p className={styles.empty}>Nothing matches &lsquo;{query.trim()}&rsquo;.</p> : null}
    </div>
  )
}
