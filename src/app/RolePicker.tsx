/* oxlint-disable jsx-a11y/no-redundant-roles -- role="list" keeps list semantics in Safari when list-style is none */
import { Link, useNavigate } from 'react-router'
import { Logo } from '../ui/brand/Logo.tsx'
import { ATHLETES, COACH, personName, type ViewerChoice } from './people.ts'
import { useViewer, viewerChoice } from './viewer.ts'
import styles from './RolePicker.module.css'

interface Card {
  id: ViewerChoice
  name: string
  blurb: string
  /** Second line: the sport focus. The race and weeks to go join it when the data layer lands. */
  focus: string
}

const CARDS: Card[] = [
  { id: 'coach', name: COACH.name, blurb: COACH.blurb, focus: 'Whole team' },
  ...ATHLETES.map((a) => ({ id: a.id, name: a.name, blurb: a.blurb, focus: a.focus })),
]

/** S1. The start URL: a real first impression in the race-day register. */
export function RolePicker() {
  const choice = useViewer(viewerChoice)
  const chosen = useViewer((s) => s.chosen)
  const viewAs = useViewer((s) => s.viewAs)
  const navigate = useNavigate()

  const go = (next: ViewerChoice) => {
    viewAs(next)
    void navigate(next === 'coach' ? '/coach/overview' : '/athlete/today')
  }

  return (
    <div className={styles.page} data-register="athlete" data-screen="S1">
      <div className={styles.lanes} aria-hidden="true" />
      <header className={styles.hero}>
        <Logo size={72} title="Laree" />
        <h1 className={styles.title}>Who are you today?</h1>
        <p className={styles.lede}>
          A training planner for triathlon, running and cycling. This is a prototype with made-up data, kept only on
          this device.
        </p>
        {chosen ? (
          <button type="button" className={styles.continue} onClick={() => go(choice)}>
            Continue as {personName(choice)}
          </button>
        ) : null}
      </header>

      <ul className={styles.cards} role="list">
        {CARDS.map((c, i) => {
          const descId = `role-${c.id}-desc`
          return (
            <li key={c.id}>
              <button type="button" className={styles.bib} aria-label={c.name} aria-describedby={descId} onClick={() => go(c.id)}>
                <span className={styles.pin} data-side="start" aria-hidden="true" />
                <span className={styles.pin} data-side="end" aria-hidden="true" />
                <span className={styles.number} data-numeric="display" aria-hidden="true">
                  {String(i + 1).padStart(3, '0')}
                </span>
                <span className={styles.name}>{c.name}</span>
                <span id={descId} className={styles.blurb}>
                  {c.blurb}
                </span>
                <span className={styles.stub}>
                  <span>{c.focus}</span>
                  <span aria-hidden="true">Go →</span>
                </span>
              </button>
            </li>
          )
        })}
      </ul>

      <nav className={styles.links} aria-label="Prototype pages">
        <Link to="/brand">Brand board</Link>
        <Link to="/kit">UI kit</Link>
        <Link to="/reset">Reset demo data</Link>
      </nav>
    </div>
  )
}
