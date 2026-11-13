import { useState } from 'react'
import { Link } from 'react-router'
import { ATHLETES as FOCUS } from '../../../app/people.ts'
import { ATHLETES } from '../../../data/seed/people.ts'
import { useViewer } from '../../../app/viewer.ts'
import { currentDay } from '../../../data/selectors.ts'
import { useLaree } from '../../../data/store.ts'
import { now } from '../../../domain/time.ts'
import type { ThemePreference } from '../../../domain/types.ts'
import { Button, Card, SPORT_LABEL } from '../../../ui/core/index.ts'
import { SegmentedControl } from '../../../ui/form/index.ts'
import { showToast } from '../../../ui/overlay/index.ts'
import { AiSection } from './AiSection.tsx'
import { changeLines, currentOf, historyOf, kindsFor, valueText, zoneRows } from './thresholds.ts'
import styles from './MePage.module.css'

const THEMES: ReadonlyArray<{ id: ThemePreference; label: string }> = [
  { id: 'system', label: 'System' },
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
]

const SECTIONS = [
  ['profile', 'Profile'],
  ['thresholds', 'Thresholds'],
  ['data-in', 'Data in and out'],
  ['ai', 'AI summaries'],
  ['preferences', 'Preferences'],
  ['prototype', 'Prototype'],
] as const

const timeFmt = new Intl.DateTimeFormat('en-GB', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Asia/Kuala_Lumpur',
})

function jump(id: string) {
  const el = document.getElementById(`me-${id}`)
  const calm = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? true
  el?.scrollIntoView?.({ block: 'start', behavior: calm ? 'auto' : 'smooth' })
  el?.focus({ preventScroll: true })
}

export default function MePage() {
  const athleteId = useViewer((s) => s.athleteId)
  const data = useLaree((s) => s.data)
  const setSettings = useLaree((s) => s.setSettings)
  const setPref = useLaree((s) => s.setPref)
  const athlete = ATHLETES.find((a) => a.id === athleteId)
  const info = FOCUS.find((a) => a.id === athleteId)
  const theme: ThemePreference = data.settings[athleteId]?.theme ?? 'system'
  const today = currentDay()
  const [themeError, setThemeError] = useState('')

  const changeTheme = (id: string) => {
    const next = THEMES.find((t) => t.id === id)?.id
    if (!next) return
    try {
      setSettings(athleteId, { theme: next })
      setThemeError('')
    } catch {
      setThemeError('Your theme could not be saved, so it stays as it was.')
    }
  }

  const lastSyncRaw = data.prefs[`lastSync:${athleteId}`]
  const lastSync = typeof lastSyncRaw === 'number' ? lastSyncRaw : null
  const syncNow = () => {
    setPref(`lastSync:${athleteId}`, now().getTime())
    showToast('Synced. Nothing new on your watch.')
  }

  if (!athlete) return null

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Me</h1>
      <nav aria-label="On this page">
        <ul className={styles.index}>
          {SECTIONS.map(([id, label]) => (
            <li key={id}>
              <button type="button" className={styles.indexBtn} onClick={() => jump(id)}>
                {label}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      <section id="me-profile" tabIndex={-1} className={styles.section} aria-labelledby="me-profile-h">
        <h2 id="me-profile-h" className={styles.h}>
          Profile
        </h2>
        <Card>
          <dl className={styles.list}>
            <div className={styles.row}>
              <dt className={styles.label}>Name</dt>
              <dd className={styles.dd}>{info?.name ?? ''}</dd>
            </div>
            <div className={styles.row}>
              <dt className={styles.label}>Focus</dt>
              <dd className={styles.dd}>{info?.focus ?? ''}</dd>
            </div>
            <div className={styles.row}>
              <dt className={styles.label}>Sports</dt>
              <dd className={styles.dd}>
                {athlete.sports
                  .filter((s) => s === 'swim' || s === 'bike' || s === 'run')
                  .map((s) => SPORT_LABEL[s])
                  .join(', ')}
              </dd>
            </div>
            <div className={styles.row}>
              <dt className={styles.label}>Coach</dt>
              <dd className={styles.dd}>Coach</dd>
            </div>
          </dl>
        </Card>
      </section>

      <section id="me-thresholds" tabIndex={-1} className={styles.section} aria-labelledby="me-thresholds-h">
        <h2 id="me-thresholds-h" className={styles.h}>
          Thresholds
        </h2>
        <p className={styles.sub}>Coach sets these. They decide your zones and how hard a session counts.</p>
        <ul className={styles.list}>
          {kindsFor(athlete.sports).map((k) => {
            const history = historyOf(data.thresholds, athleteId, k.kind)
            const cur = currentOf(history, today)
            const lines = changeLines(history, k.label)
            const zones = cur ? zoneRows(k.kind, cur.value) : []
            return (
              <li key={k.kind}>
                <Card data-testid={`threshold-${k.kind}`}>
                  <div className={styles.row}>
                    <span className={styles.label}>{k.label}</span>
                    {cur ? (
                      <span className={styles.num}>{valueText(k.kind, cur.value)}</span>
                    ) : (
                      <span>Not set. Coach can add it.</span>
                    )}
                  </div>
                  {lines.length > 0 ? (
                    <ul className={styles.history} aria-label={`${k.label} history`}>
                      {lines
                        .toReversed()
                        .map((l) => (
                          <li key={l}>{l}</li>
                        ))}
                    </ul>
                  ) : null}
                  {zones.length > 0 ? (
                    <details className={styles.zones}>
                      <summary>{k.label} zones</summary>
                      <table className={styles.zoneTable}>
                        <tbody>
                          {zones.map((z) => (
                            <tr key={z.zone}>
                              <th scope="row">
                                Zone {z.zone}, {z.name}
                              </th>
                              <td>{z.range}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </details>
                  ) : null}
                </Card>
              </li>
            )
          })}
        </ul>
      </section>

      <section id="me-data-in" tabIndex={-1} className={styles.section} aria-labelledby="me-data-h">
        <h2 id="me-data-h" className={styles.h}>
          Data in and out
        </h2>
        <Card>
          <ul className={styles.list}>
            <li className={styles.row}>
              <span>Import a file from your watch or bike computer</span>
              <Link className={styles.link} to="/athlete/today?sheet=log">
                Import file
              </Link>
            </li>
            <li className={styles.row}>
              <span>
                Sync device (simulated)
                <br />
                <span className={styles.label}>
                  {lastSync === null ? 'Not synced yet' : `Last synced ${timeFmt.format(lastSync)}`}
                </span>
              </span>
              <Button onPress={syncNow}>Sync now</Button>
            </li>
            <li>
              <div className={styles.row}>
                <span>Send a session to Strava</span>
                <Button isDisabled>Share to Strava</Button>
              </div>
              <p className={styles.note}>
                Sharing to Strava comes with the full app. Strava only shows activities to the athlete who owns them,
                so Coach could never see them there. Use file import or device sync instead.
              </p>
            </li>
          </ul>
        </Card>
      </section>

      <section id="me-ai" tabIndex={-1} className={styles.section} aria-label="AI summaries">
        <AiSection athleteId={athleteId} />
      </section>

      <section id="me-preferences" tabIndex={-1} className={styles.section} aria-labelledby="me-pref-h">
        <h2 id="me-pref-h" className={styles.h}>
          Preferences
        </h2>
        <Card>
          <div className={styles.list}>
            <SegmentedControl
              label="Units"
              options={[
                { id: 'metric', label: 'Metric' },
                { id: 'imperial', label: 'Imperial', isDisabled: true },
              ]}
              value="metric"
              hint="Kilometres, metres and kilograms. Imperial comes with the full app."
            />
            <SegmentedControl
              label="Theme"
              options={THEMES}
              value={theme}
              onChange={changeTheme}
              hint="System follows your phone."
            />
            {themeError ? (
              <p className={styles.error} role="alert">
                {themeError}
              </p>
            ) : null}
          </div>
        </Card>
      </section>

      <section id="me-prototype" tabIndex={-1} className={styles.section} aria-labelledby="me-proto-h">
        <h2 id="me-proto-h" className={styles.h}>
          Prototype
        </h2>
        <p className={styles.sub}>Laree is a prototype with made-up data kept on this device.</p>
        <div className={styles.actions}>
          <Link className={styles.link} to="/reset">
            Reset demo data
          </Link>
        </div>
      </section>
    </div>
  )
}
