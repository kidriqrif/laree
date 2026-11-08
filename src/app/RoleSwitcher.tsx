/* oxlint-disable jsx-a11y/prefer-tag-over-role -- ARIA patterns on non-native elements: region, status, radiogroup and menu */
import { useEffect, useId, useRef, useState, useSyncExternalStore, type KeyboardEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import { ChevronDownIcon } from '../ui/icons/index.ts'
import { PEOPLE, personName, type ViewerChoice } from './people.ts'
import { getLastCoachRoute, useViewer, viewerChoice } from './viewer.ts'
import styles from './RoleSwitcher.module.css'

/** Where each choice lands (IA section 4.1). Pure, so it can be tested without a router. */
export function landingFor(choice: ViewerChoice, pathname: string, search: string, lastCoachRoute: string | null): string {
  if (choice === 'coach') return lastCoachRoute ?? '/coach/overview'
  const section = /^\/athlete\/(today|week|progress|me)\/?$/.exec(pathname)?.[1]
  if (section === 'week') {
    const w = new URLSearchParams(search).get('w')
    return w === null ? '/athlete/week' : `/athlete/week?w=${encodeURIComponent(w)}`
  }
  // Same section for Today, Progress and Me (open sheets close). Detail pages and everything else go to Today.
  return section ? `/athlete/${section}` : '/athlete/today'
}

const QUERY = '(max-width: 599px)'
function subscribe(cb: () => void) {
  const m = window.matchMedia?.(QUERY)
  m?.addEventListener('change', cb)
  return () => m?.removeEventListener('change', cb)
}
const isCompact = () => window.matchMedia?.(QUERY).matches ?? false

/** Open/close state for a small popover: Escape closes and returns focus, a press outside closes. */
function usePopover() {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
        trigger.current?.focus()
      }
    }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])
  return { open, setOpen, root, trigger }
}

/** S2. The bar at the top of every route. */
export function RoleSwitcher() {
  const choice = useViewer(viewerChoice)
  const viewAs = useViewer((s) => s.viewAs)
  const { pathname, search } = useLocation()
  const navigate = useNavigate()
  const compact = useSyncExternalStore(subscribe, isCompact, () => false)
  const [announce, setAnnounce] = useState('')

  const choose = (next: ViewerChoice) => {
    if (next === choice) return
    viewAs(next)
    setAnnounce(`Viewing as ${personName(next)}.`)
    void navigate(landingFor(next, pathname, search, getLastCoachRoute()))
  }

  return (
    <div role="region" aria-label="Prototype controls" className={styles.bar}>
      {compact ? (
        <CompactPicker choice={choice} onChoose={choose} />
      ) : (
        <>
          <span className={styles.label} id="viewing-as-label">
            Prototype · viewing as
          </span>
          <RadioPicker choice={choice} onChoose={choose} />
        </>
      )}
      <PrototypeMenu />
      <span role="status" className="sr-only">
        {announce}
      </span>
    </div>
  )
}

function RadioPicker({ choice, onChoose }: { choice: ViewerChoice; onChoose: (c: ViewerChoice) => void }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = PEOPLE.findIndex((p) => p.id === choice)
    let next = -1
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (i + 1) % PEOPLE.length
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (i - 1 + PEOPLE.length) % PEOPLE.length
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = PEOPLE.length - 1
    const person = PEOPLE[next]
    if (!person) return
    e.preventDefault()
    onChoose(person.id)
    refs.current[next]?.focus()
  }
  return (
    <div role="radiogroup" tabIndex={-1} aria-labelledby="viewing-as-label" className={styles.options} onKeyDown={onKeyDown}>
      {PEOPLE.map((p, i) => (
        <button
          key={p.id}
          ref={(el) => {
            refs.current[i] = el
          }}
          type="button"
          role="radio"
          aria-checked={p.id === choice}
          tabIndex={p.id === choice ? 0 : -1}
          className={styles.option}
          onClick={() => onChoose(p.id)}
        >
          {p.name}
        </button>
      ))}
    </div>
  )
}

function CompactPicker({ choice, onChoose }: { choice: ViewerChoice; onChoose: (c: ViewerChoice) => void }) {
  const { open, setOpen, root, trigger } = usePopover()
  const menuId = useId()
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    const items = [...e.currentTarget.querySelectorAll<HTMLElement>('[role="menuitemradio"]')]
    const at = items.indexOf(document.activeElement as HTMLElement)
    const step = e.key === 'ArrowDown' ? 1 : -1
    e.preventDefault()
    items[(at + step + items.length) % items.length]?.focus()
  }
  return (
    <div ref={root} className={styles.popoverRoot}>
      <button
        ref={trigger}
        type="button"
        className={styles.menuButton}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((o) => !o)}
      >
        <span>Prototype · viewing as {personName(choice)}</span>
        <ChevronDownIcon size={20} />
      </button>
      {open ? (
        <div id={menuId} role="menu" tabIndex={-1} aria-label="Viewing as" className={styles.popover} onKeyDown={onKeyDown}>
          {PEOPLE.map((p) => (
            <button
              key={p.id}
              type="button"
              role="menuitemradio"
              aria-checked={p.id === choice}
              className={styles.menuItem}
              ref={(el) => {
                if (el && p.id === choice) el.focus()
              }}
              onClick={() => {
                onChoose(p.id)
                setOpen(false)
                trigger.current?.focus()
              }}
            >
              {p.name}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}

const LINKS = [
  { to: '/', label: 'Role picker' },
  { to: '/brand', label: 'Brand board' },
  { to: '/kit', label: 'UI kit' },
  { to: '/reset', label: 'Reset demo data' },
]

function PrototypeMenu() {
  const { open, setOpen, root, trigger } = usePopover()
  const menuId = useId()
  return (
    <div ref={root} className={`${styles.popoverRoot} ${styles.end}`}>
      <button
        ref={trigger}
        type="button"
        className={styles.menuButton}
        aria-label="Prototype menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((o) => !o)}
      >
        <span className={styles.moreText}>More</span>
        <ChevronDownIcon size={20} />
      </button>
      {open ? (
        <nav id={menuId} aria-label="Prototype menu" className={`${styles.popover} ${styles.popoverEnd}`}>
          {LINKS.map((l) => (
            <Link key={l.to} to={l.to} className={styles.menuItem} onClick={() => setOpen(false)}>
              {l.label}
            </Link>
          ))}
        </nav>
      ) : null}
    </div>
  )
}
