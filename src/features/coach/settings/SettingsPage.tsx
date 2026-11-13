import { lazy, Suspense, useState } from 'react'
import { Link } from 'react-router'
import { WITHDRAWAL_UNSAVED } from '../../../ai/consent.ts'
import { useKeyboardDialogs } from '../../../app/keyboard/index.ts'
import { ATHLETES } from '../../../app/people.ts'
import type { AthleteId } from '../../../app/people.ts'
import { useCoachReadOnly } from '../../../app/useCoachReadOnly.ts'
import { selectAiState } from '../../../data/selectors.ts'
import type { AiState } from '../../../data/selectors.ts'
import { useLaree } from '../../../data/store.ts'
import type { ThemePreference } from '../../../domain/types.ts'
import { Button } from '../../../ui/core/index.ts'
import { SegmentedControl, Switch } from '../../../ui/form/index.ts'
import { showToast } from '../../../ui/overlay/index.ts'
import styles from './SettingsPage.module.css'

/** The consent dialog loads only when a coach opens it for an athlete. */
const AiConsentDialog = lazy(() => import('./AiConsentDialog.tsx').then((m) => ({ default: m.AiConsentDialog })))

const THEMES: ReadonlyArray<{ id: ThemePreference; label: string }> = [
  { id: 'system', label: 'System' },
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
]

const isTheme = (v: string): v is ThemePreference => THEMES.some((t) => t.id === v)

const AI_RESULT: Record<AiState, string> = {
  active: 'Active',
  'athlete-only': 'On for the athlete. Coach is off.',
  'waiting-for-athlete': 'Waiting for the athlete',
  off: 'Off',
}

const SECTIONS = [
  { id: 'units', label: 'Units' },
  { id: 'theme', label: 'Theme' },
  { id: 'keyboard', label: 'Keyboard' },
  { id: 'ai', label: 'AI consent' },
  { id: 'prototype', label: 'Prototype' },
] as const

/** Scroll a section to the top of the sheet and move focus to its heading. */
function goToSection(id: string) {
  const heading = document.getElementById(`settings-${id}`)
  heading?.scrollIntoView?.({ block: 'start' })
  heading?.focus({ preventScroll: true })
}

/** Coach settings: one ruled sheet of units, theme, keyboard, AI consent and the prototype controls (C18). */
export default function SettingsPage() {
  const readOnly = useCoachReadOnly()
  const { openHelp } = useKeyboardDialogs()
  const data = useLaree((s) => s.data)
  const storageFailed = useLaree((s) => s.storageFailed)
  const setSettings = useLaree((s) => s.setSettings)
  const setAiConsent = useLaree((s) => s.setAiConsent)
  const [consentFor, setConsentFor] = useState<AthleteId | null>(null)

  const coach = data.settings.coach
  const coachOn = coach.aiConsent
  // Off but not saved for good, also after a reload: the warning stays under the switch until it is saved.
  const coachUnsaved = useLaree((s) => s.aiUnsavedOwners.includes('coach')) && !coachOn
  const singleKeys = coach.singleKeyShortcuts !== false

  const chooseTheme = (id: string) => {
    if (!isTheme(id)) return
    setSettings('coach', { theme: id })
  }

  const toggleSingleKeys = (on: boolean) => setSettings('coach', { singleKeyShortcuts: on })

  // Turning AI on for an athlete confirms in the dialog. Turning it off is direct.
  const toggleCoachAi = (on: boolean) => {
    if (on) {
      setConsentFor(ATHLETES[0]?.id ?? 'amir')
      return
    }
    if (!setAiConsent('coach', false)) return
    // A withdrawal that could not be saved must not look like one that was.
    showToast(useLaree.getState().aiWithdrawalUnsaved ? WITHDRAWAL_UNSAVED : 'AI is off for the coach. Every AI panel is hidden.')
  }

  return (
    <div className={styles.page} data-readonly={readOnly ? 'true' : undefined}>
      <header className={styles.head}>
        <h1 className={styles.title}>Settings</h1>
        <p className={styles.hint}>Set up how Laree works for you on this device.</p>
      </header>

      {storageFailed ? (
        <output className={styles.notice}>
          This device cannot save changes right now. Settings last for this visit only.
        </output>
      ) : null}

      <div className={styles.layout}>
        <nav className={styles.index} aria-label="Settings sections">
          {SECTIONS.map((s) => (
            <button key={s.id} type="button" className={styles.indexLink} onClick={() => goToSection(s.id)}>
              {s.label}
            </button>
          ))}
        </nav>

        <div className={styles.sheet}>
          <section className={styles.section} aria-labelledby="settings-units">
            <h2 id="settings-units" tabIndex={-1} className={styles.sectionTitle}>
              Units
            </h2>
            <dl className={styles.rows}>
              <div className={styles.row}>
                <dt>Units</dt>
                <dd>
                  Metric (km, metres, kilograms)
                  <p className={styles.hint}>Metric is the only system in this prototype.</p>
                </dd>
              </div>
            </dl>
          </section>

          <section className={styles.section} aria-labelledby="settings-theme">
            <h2 id="settings-theme" tabIndex={-1} className={styles.sectionTitle}>
              Theme
            </h2>
            <dl className={styles.rows}>
              <div className={styles.row}>
                <dt>Theme</dt>
                <dd>
                  <SegmentedControl
                    ariaLabel="Theme"
                    options={THEMES.map((t) => ({ id: t.id, label: t.label }))}
                    value={coach.theme}
                    onChange={chooseTheme}
                    isDisabled={readOnly}
                  />
                </dd>
              </div>
            </dl>
          </section>

          <section className={styles.section} aria-labelledby="settings-keyboard">
            <h2 id="settings-keyboard" tabIndex={-1} className={styles.sectionTitle}>
              Keyboard
            </h2>
            <dl className={styles.rows}>
              <div className={styles.row}>
                <dt>Shortcuts</dt>
                <dd>
                  <Switch
                    isSelected={singleKeys}
                    onChange={toggleSingleKeys}
                    isDisabled={readOnly}
                    label="Single-key shortcuts"
                    hint="Keys such as g then o and ?. Ctrl+Z and Ctrl+S always work."
                  />
                </dd>
              </div>
              <div className={styles.row}>
                <dt>Help</dt>
                <dd>
                  <Button variant="secondary" onPress={openHelp}>
                    Keyboard help
                  </Button>
                </dd>
              </div>
            </dl>
          </section>

          <section className={styles.section} aria-labelledby="settings-ai">
            <h2 id="settings-ai" tabIndex={-1} className={styles.sectionTitle}>
              AI consent
            </h2>
            <p className={styles.hint}>
              AI runs for an athlete only when both the athlete and Coach have turned it on. Coach can never turn it on for an athlete.
            </p>
            <Switch
              isSelected={coachOn}
              onChange={toggleCoachAi}
              isDisabled={readOnly}
              label="Coach AI for the team"
              hint={coachOn ? 'On. AI runs for each athlete who has turned it on too.' : 'Off for every athlete.'}
              error={coachUnsaved ? WITHDRAWAL_UNSAVED : undefined}
            />
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <caption className={styles.srOnly}>AI consent by athlete</caption>
                <thead>
                  <tr>
                    <th scope="col">Athlete</th>
                    <th scope="col">Athlete's consent</th>
                    <th scope="col">Coach's consent</th>
                    <th scope="col">Result</th>
                  </tr>
                </thead>
                <tbody>
                  {ATHLETES.map((a) => {
                    const state = selectAiState(data, a.id)
                    const athleteOn = data.settings[a.id].aiConsent
                    return (
                      <tr key={a.id}>
                        <th scope="row">{a.name}</th>
                        <td>{athleteOn ? 'On' : 'Off'}</td>
                        <td>{coachOn ? 'On' : 'Off'}</td>
                        <td>{AI_RESULT[state]}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <section className={styles.section} aria-labelledby="settings-prototype">
            <h2 id="settings-prototype" tabIndex={-1} className={styles.sectionTitle}>
              Prototype
            </h2>
            <dl className={styles.rows}>
              <div className={styles.row}>
                <dt>Demo data</dt>
                <dd>
                  <Link to="/reset" className={styles.link}>
                    Reset demo data
                  </Link>
                  <p className={styles.hint}>Puts the seeded demo back on this device. Your changes are lost.</p>
                </dd>
              </div>
            </dl>
          </section>
        </div>
      </div>

      {consentFor ? (
        <Suspense fallback={null}>
          <AiConsentDialog athleteId={consentFor} isOpen onClose={() => setConsentFor(null)} />
        </Suspense>
      ) : null}
    </div>
  )
}
