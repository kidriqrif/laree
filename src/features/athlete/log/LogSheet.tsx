import { useEffect, useMemo, useRef, useState } from 'react'
import { useInRouterContext, useNavigate } from 'react-router'
import { useViewer } from '../../../app/viewer.ts'
import { ATHLETES } from '../../../data/seed/people.ts'
import { currentDay } from '../../../data/selectors.ts'
import { useLaree } from '../../../data/store.ts'
import { nowMinute } from '../../../domain/time.ts'
import type { Sport } from '../../../domain/types.ts'
import type { ImportError, ImportResult, ParsedActivity } from '../../../io/import/types.ts'

/**
 * Reads the file in a module worker so a large file never blocks the page and Cancel can terminate
 * it. Falls back to the main thread where workers are unavailable (tests).
 */
async function parseInWorker(bytes: ArrayBuffer, fileName: string, slot: { current: Worker | null }): Promise<ImportResult> {
  if (typeof Worker === 'undefined') {
    const { parseImportFile } = await import('../../../io/import/index.ts')
    return parseImportFile(bytes, fileName)
  }
  slot.current?.terminate()
  const w = new Worker(new URL('../../../io/import/worker.ts', import.meta.url), { type: 'module' })
  slot.current = w
  return new Promise<ImportResult>((resolve, reject) => {
    w.onmessage = (e: MessageEvent<ImportResult>) => {
      if (slot.current === w) slot.current = null
      w.terminate()
      resolve(e.data)
    }
    w.onerror = () => {
      if (slot.current === w) slot.current = null
      w.terminate()
      reject(new Error('worker failed'))
    }
    w.postMessage({ buffer: bytes, fileName }, [bytes])
  })
}
import { Button } from '../../../ui/core/index.ts'
import { DropZone, DurationField, NumberField, Rating, SegmentedControl, Select, TextField } from '../../../ui/form/index.ts'
import { Sheet, showToast, useSheetParam } from '../../../ui/overlay/index.ts'
import { LOG_MATCH_DRAFT, readLogMatch } from '../today/logMatch.ts'
import {
  buildImportedActivity,
  buildQuickActivity,
  buildSyncedActivity,
  clockText,
  dayLabel,
  dayText,
  defaultMatch,
  defaultStartMinute,
  distanceText,
  durationText,
  EFFORT_NAMES,
  existingFor,
  importIssue,
  importLoad,
  importTitle,
  LOG_BACK_DAYS,
  loadLine,
  matchLabel,
  matchOptions,
  newActivityId,
  NOT_PLANNED,
  paceText,
  quickLoad,
  SPORT_NAMES,
  SPORTS,
  startOf,
  thresholdsFor,
} from './logModel.ts'
import styles from './LogSheet.module.css'

type Method = 'quick' | 'import' | 'sync'

const METHODS = [
  { id: 'quick', label: 'Quick log' },
  { id: 'import', label: 'Import file' },
  { id: 'sync', label: 'Sync device' },
]

const SPORT_OPTIONS = SPORTS.map((s) => ({ id: s, label: SPORT_NAMES[s] }))

/**
 * Opens at ?sheet=log. A badge a log earns shows in Today's badge moment once the sheet closes.
 * Renders nothing outside a router.
 */
export function LogSheet() {
  return useInRouterContext() ? <LogSheetInner /> : null
}

function LogSheetInner() {
  const sheet = useSheetParam('log')
  return sheet.isOpen ? <OpenSheet onClose={sheet.close} onOpenChange={sheet.onOpenChange} /> : null
}

type ImportState =
  | { status: 'idle' }
  | { status: 'reading'; name: string }
  | { status: 'error'; name: string; error: ImportError }
  | { status: 'ready'; name: string; activities: ParsedActivity[] }

function OpenSheet({ onClose, onOpenChange }: { onClose: () => void; onOpenChange: (open: boolean) => void }) {
  const athleteId = useViewer((s) => s.athleteId)
  const data = useLaree((s) => s.data)
  const logActivity = useLaree((s) => s.logActivity)
  const moveWorkout = useLaree((s) => s.moveWorkout)
  const clearDraft = useLaree((s) => s.clearDraft)
  const navigate = useNavigate()
  const today = currentDay()

  // The session chosen with "Log it", read once: it stays on offer even when older than a week.
  const [prematched] = useState(() => readLogMatch(useLaree.getState().data.drafts, athleteId, today))
  const options = useMemo(() => matchOptions(data, athleteId, today, prematched), [data, athleteId, today, prematched])
  const athlete = ATHLETES.find((a) => a.id === athleteId)
  const homeSport: Sport = athlete?.sports.find((s) => s !== 'other') ?? 'run'

  const [matchId, setMatchId] = useState<string>(() => defaultMatch(options, prematched, today))
  const workout = options.find((o) => o.workout.id === matchId)?.workout
  const [method, setMethod] = useState<Method>('quick')

  // Quick log fields. A chosen session fills them from the plan; "Not planned" leaves them to the athlete.
  const [sport, setSport] = useState<Sport>(workout?.sport ?? homeSport)
  const [day, setDay] = useState<number>(workout?.day ?? today)
  const [durationS, setDurationS] = useState<number | null>(workout ? workout.plannedDurationS : null)
  const [distanceKm, setDistanceKm] = useState<number>(
    workout?.plannedDistanceM ? Math.round(workout.plannedDistanceM / 10) / 100 : Number.NaN,
  )
  const [rpe, setRpe] = useState<number>(5)
  const [note, setNote] = useState('')
  const [tried, setTried] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  // Import state. It is separate from the match, so a failed import leaves the chosen session alone.
  const [imp, setImp] = useState<ImportState>({ status: 'idle' })
  const [fileRpe, setFileRpe] = useState<number | null>(null)
  const [fileSports, setFileSports] = useState<Record<number, Sport>>({})
  const [moveSession, setMoveSession] = useState(false)
  const reading = useRef(0)
  const worker = useRef<Worker | null>(null)

  useEffect(() => () => clearDraft(LOG_MATCH_DRAFT), [clearDraft])

  // Closing the sheet cancels a file read: a read still loading never starts a worker, and a running one stops.
  useEffect(
    () => () => {
      reading.current++
      worker.current?.terminate()
      worker.current = null
    },
    [],
  )

  const chooseMatch = (id: string) => {
    setMatchId(id)
    setMoveSession(false)
    const w = options.find((o) => o.workout.id === id)?.workout
    if (w) {
      setSport(w.sport)
      setDay(w.day)
      setDurationS(w.plannedDurationS)
      setDistanceKm(w.plannedDistanceM ? Math.round(w.plannedDistanceM / 10) / 100 : Number.NaN)
    } else {
      setDay(today)
    }
  }

  const effectiveSport: Sport = workout ? workout.sport : sport
  const effectiveDay = workout ? workout.day : day
  const thresholds = thresholdsFor(data, athleteId, effectiveDay)
  const existing = existingFor(data, athleteId, workout?.id, today)

  const durationError = durationS === null || durationS < 60 ? 'Enter a duration of at least one minute.' : null
  const quick =
    durationS !== null && durationS >= 60
      ? quickLoad({
          sport: effectiveSport,
          durationS,
          ...(Number.isFinite(distanceKm) && distanceKm > 0 ? { distanceM: distanceKm * 1000 } : {}),
          rpe,
          thresholds,
        })
      : null

  // ---- save paths

  const finish = (message: string) => {
    showToast(message)
    onClose()
  }

  const attempt = (fn: () => void) => {
    setSaveError(null)
    try {
      fn()
    } catch {
      setSaveError('Something went wrong, so nothing was saved. Your entries are still here. Try again.')
    }
  }

  const saveQuick = () => {
    setTried(true)
    if (durationError || durationS === null) return
    attempt(() => {
      const startMinute = defaultStartMinute(workout, effectiveDay, today, nowMinute(), durationS)
      const a = buildQuickActivity({
        id: existing?.id ?? newActivityId(data, athleteId, 'q', effectiveDay),
        athleteId,
        day: effectiveDay,
        startMinute: existing?.startMinute ?? startMinute,
        sport: effectiveSport,
        title: workout?.title ?? `${SPORT_NAMES[effectiveSport]} session`,
        durationS,
        ...(Number.isFinite(distanceKm) && distanceKm > 0 ? { distanceM: distanceKm * 1000 } : {}),
        rpe,
        note,
        thresholds,
        ...(workout ? { matchedWorkoutId: workout.id } : {}),
      })
      logActivity(a)
      finish(`Logged ${a.title}`)
    })
  }

  const syncNow = () => {
    attempt(() => {
      const startMinute = defaultStartMinute(workout, effectiveDay, today, nowMinute(), workout?.plannedDurationS ?? 45 * 60)
      const a = buildSyncedActivity({
        id: existing?.id ?? newActivityId(data, athleteId, 's', effectiveDay),
        athleteId,
        day: effectiveDay,
        startMinute,
        sport: effectiveSport,
        thresholds,
        ...(workout ? { workout } : {}),
      })
      logActivity(a)
      finish(`Synced ${a.title} (simulated)`)
    })
  }

  // ---- import

  const readFile = async (files: File[]) => {
    const file = files[0]
    if (!file) return
    const ticket = ++reading.current
    setFileSports({})
    setMoveSession(false)
    setImp({ status: 'reading', name: file.name })
    try {
      const bytes = await file.arrayBuffer()
      // A read that was cancelled or replaced while the file loaded must not start a worker:
      // starting one would stop the worker of the file picked after it.
      if (ticket !== reading.current) return
      const result = await parseInWorker(bytes, file.name, worker)
      if (ticket !== reading.current) return
      setImp(result.ok ? { status: 'ready', name: file.name, activities: result.activities } : { status: 'error', name: file.name, error: result.error })
    } catch {
      if (ticket !== reading.current) return
      setImp({
        status: 'error',
        name: file.name,
        error: {
          code: 'read-failed',
          fileName: file.name,
          message: `Something went wrong while reading “${file.name}”. Nothing was saved. Try again, or use Quick log.`,
        },
      })
    }
  }

  const cancelRead = () => {
    reading.current++
    worker.current?.terminate()
    worker.current = null
    setImp({ status: 'idle' })
  }

  const parsed = imp.status === 'ready' ? imp.activities : []
  const plans = parsed.map((p, i) => {
    const s: Sport | null = p.sport ?? fileSports[i] ?? null
    const fileDay = startOf(p).day
    // Only the first session of a file can take the chosen session, and only with the same sport on
    // the same day (or with "Move"). Anything else saves on its own and leaves the existing log alone.
    const matches = i === 0 && !!workout && workout.sport === s && (fileDay === workout.day || moveSession)
    const replaced = matches ? existing : undefined
    const issue = s ? importIssue(p, s, data, athleteId, today, replaced?.id) : null
    const keptRpe = replaced?.source === 'manual' ? replaced.rpe : undefined
    const load = s ? importLoad(p, s, thresholdsFor(data, athleteId, fileDay), fileRpe ?? keptRpe) : null
    return { p, sport: s, issue, load, matches, replaced }
  })
  const first = plans[0]
  const otherDay = workout && first?.sport === workout.sport && startOf(first.p).day !== workout.day ? startOf(first.p).day : null
  const sportClash = workout && first?.sport && first.sport !== workout.sport
  const importBlocked = plans.length === 0 || plans.some((x) => x.sport === null || x.issue !== null)

  const saveImport = () => {
    if (importBlocked) return
    attempt(() => {
      let n = 0
      for (const x of plans) {
        if (!x.sport) continue
        const { day: fileDay } = startOf(x.p)
        const matches = x.matches && workout !== undefined
        if (matches && moveSession && workout.day !== fileDay) moveWorkout(workout.id, fileDay)
        // The existing log's id is reused (and so replaced) only when this file takes its session.
        const id = x.replaced ? x.replaced.id : newActivityId(useLaree.getState().data, athleteId, 'i', fileDay)
        logActivity(
          buildImportedActivity({
            id,
            athleteId,
            parsed: x.p,
            sport: x.sport,
            thresholds: thresholdsFor(data, athleteId, fileDay),
            title: importTitle(workout, x.sport, matches),
            ...(fileRpe !== null ? { rpe: fileRpe } : {}),
            ...(matches ? { matchedWorkoutId: workout.id } : {}),
            ...(x.replaced?.source === 'manual' ? { replaces: x.replaced } : {}),
          }),
        )
        n++
      }
      finish(n === 1 ? 'Logged 1 session from your file' : `Logged ${n} sessions from your file`)
    })
  }

  // ---- layout

  const matchSelect = (
    <Select
      label="Which session?"
      value={matchId}
      onChange={chooseMatch}
      options={[
        ...options.map((o) => ({ id: o.workout.id, label: matchLabel(o, today) })),
        { id: NOT_PLANNED, label: 'Not planned' },
      ]}
    />
  )

  const footer =
    method === 'sync' ? (
      <Button variant="primary" onPress={syncNow}>
        Sync now
      </Button>
    ) : method === 'import' ? (
      <Button variant="primary" onPress={saveImport} isDisabled={importBlocked}>
        Save
      </Button>
    ) : (
      <Button variant="primary" onPress={saveQuick}>
        Save
      </Button>
    )

  return (
    <Sheet isOpen onOpenChange={onOpenChange} title="Log a session" footer={footer} data-testid="log-sheet">
      <div className={styles.form}>
        {matchSelect}

        {!workout ? (
          <div className={styles.pair}>
            <Select
              label="Sport"
              value={sport}
              onChange={(v) => setSport(v as Sport)}
              options={SPORT_OPTIONS}
              isDisabled={method === 'import'}
            />
            <Select
              label="Date"
              value={String(day)}
              onChange={(v) => setDay(Number(v))}
              options={Array.from({ length: LOG_BACK_DAYS + 1 }, (_, i) => today - i).map((d) => ({
                id: String(d),
                label: dayLabel(d, today),
              }))}
            />
          </div>
        ) : null}

        <SegmentedControl ariaLabel="How to log" options={METHODS} value={method} onChange={(m) => setMethod(m as Method)} />

        {method === 'quick' ? (
          <div className={styles.panel}>
            <div className={styles.pair}>
              <DurationField
                label="Duration"
                value={durationS}
                onChange={setDurationS}
                error={tried ? durationError : null}
                min={0}
                max={24 * 3600}
              />
              <NumberField
                label="Distance (optional)"
                unit="km"
                value={distanceKm}
                onChange={setDistanceKm}
                minValue={0}
                maxValue={1000}
                formatOptions={{ maximumFractionDigits: 2 }}
              />
            </div>
            <Rating label="Effort" max={10} value={rpe} onChange={setRpe} valueNames={EFFORT_NAMES} showEnds />
            <TextField label="Note (optional)" value={note} onChange={setNote} maxLength={300} />
            <p className={styles.load} aria-live="polite" data-testid="load-estimate">
              {quick ? loadLine(quick.load) : 'Enter a duration to see how it counts.'}
            </p>
            {existing ? <p className={styles.muted}>This session already has a log. Saving replaces it.</p> : null}
          </div>
        ) : null}

        {method === 'import' ? (
          <div className={styles.panel}>
            <DropZone
              label="Activity file"
              title="Drop a .FIT, .GPX or .TCX file here"
              onFiles={(f) => void readFile(f)}
              isDisabled={imp.status === 'reading'}
            />
            {imp.status === 'reading' ? (
              <output className={styles.reading}>
                <span>Reading {imp.name}</span>
                <Button variant="quiet" onPress={cancelRead}>
                  Cancel
                </Button>
              </output>
            ) : null}
            {imp.status === 'error' ? (
              <p className={styles.error} role="alert" data-testid="import-error">
                {imp.error.message.includes(imp.name) ? imp.error.message : `“${imp.name}”: ${imp.error.message}`}
                {imp.error.hint ? ` ${imp.error.hint}` : ''}
              </p>
            ) : null}
            {imp.status === 'ready' ? (
              <div className={styles.preview} data-testid="import-preview">
                {plans.map((x, i) => (
                  <Preview
                    key={i}
                    plan={x}
                    onSport={(s) => setFileSports((m) => ({ ...m, [i]: s }))}
                    onOpen={(id) => {
                      clearDraft(LOG_MATCH_DRAFT)
                      void navigate(`/athlete/activity/${id}`)
                    }}
                  />
                ))}
                {plans.length > 1 ? (
                  <p className={styles.muted}>
                    This file holds {plans.length} sessions. Laree saves each one on its own. Transitions are left out.
                  </p>
                ) : null}
                {otherDay !== null && workout ? (
                  <div className={styles.note}>
                    <p>
                      You picked {dayText(workout.day)}&rsquo;s session, but this file is from {dayText(otherDay)}.{' '}
                      {moveSession ? `The session will move to ${dayText(otherDay)} and match.` : `Move the session to ${dayText(otherDay)} and match it?`}
                    </p>
                    <Button variant="secondary" onPress={() => setMoveSession((v) => !v)}>
                      {moveSession ? 'Keep it where it is' : `Move to ${dayText(otherDay)}`}
                    </Button>
                  </div>
                ) : null}
                {sportClash ? (
                  <p className={styles.muted}>
                    You picked a {SPORT_NAMES[workout.sport].toLowerCase()} session, so this {SPORT_NAMES[first.sport as Sport].toLowerCase()} file will save on its own.
                  </p>
                ) : null}
                <Rating
                  label="Effort (optional)"
                  max={10}
                  value={fileRpe}
                  onChange={setFileRpe}
                  valueNames={EFFORT_NAMES}
                  showEnds
                />
                {plans[0]?.replaced?.source === 'manual' ? (
                  <p className={styles.muted}>This session has a quick log. The file replaces its numbers and keeps your effort and note.</p>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}

        {method === 'sync' ? (
          <div className={styles.panel}>
            <p className={styles.simulated}>
              <span className={styles.tag}>Simulated</span>
            </p>
            <p>
              No watch is connected in this prototype. Sync now makes a realistic session from {workout ? `“${workout.title}”` : 'a typical plan'}, with
              heart rate and {effectiveSport === 'bike' ? 'power' : 'pace'} close to the plan. It is marked Simulated.
            </p>
          </div>
        ) : null}

        {saveError ? (
          <p className={styles.error} role="alert">
            {saveError}
          </p>
        ) : null}
      </div>
    </Sheet>
  )
}

interface Plan {
  p: ParsedActivity
  sport: Sport | null
  issue: ReturnType<typeof importIssue>
  load: ReturnType<typeof importLoad> | null
}

function Preview({ plan, onSport, onOpen }: { plan: Plan; onSport: (s: Sport) => void; onOpen: (id: string) => void }) {
  const { p, sport, issue, load } = plan
  const { day, startMinute } = startOf(p)
  const hasHr = p.summary.avgHr !== null
  const hasPower = p.summary.avgPowerW !== null
  const pace = sport && sport !== 'bike' && p.summary.avgSpeedMps ? paceText(sport, p.summary.avgSpeedMps) : null
  return (
    <section className={styles.card} aria-label={`Preview of ${p.fileName}`}>
      {sport === null ? (
        <Select
          label="Sport"
          hint="The file doesn't say which sport this was. Choose one."
          placeholder="Choose a sport"
          options={SPORT_OPTIONS}
          onChange={(v) => onSport(v as Sport)}
        />
      ) : (
        <h3 className={styles.cardTitle}>{SPORT_NAMES[sport]}</h3>
      )}
      <dl className={styles.facts}>
        <div>
          <dt>Starts</dt>
          <dd>
            {dayText(day)}, {clockText(startMinute)}
          </dd>
        </div>
        <div>
          <dt>Duration</dt>
          <dd>{durationText(p.timerSeconds)}</dd>
        </div>
        {p.distanceM !== null ? (
          <div>
            <dt>Distance</dt>
            <dd>{distanceText(p.distanceM)}</dd>
          </div>
        ) : null}
        {hasHr ? (
          <div>
            <dt>Average heart rate</dt>
            <dd>{Math.round(p.summary.avgHr as number)} bpm</dd>
          </div>
        ) : null}
        {hasPower ? (
          <div>
            <dt>Average power</dt>
            <dd>{Math.round(p.summary.avgPowerW as number)} W</dd>
          </div>
        ) : pace ? (
          <div>
            <dt>Average pace</dt>
            <dd>{pace}</dd>
          </div>
        ) : null}
        <div>
          <dt>Laps</dt>
          <dd>{p.laps.length}</dd>
        </div>
      </dl>
      {p.warnings
        .filter((w) => w.code !== 'ask-sport')
        .map((w) => (
          <p key={w.code} className={styles.muted}>
            {w.message}
          </p>
        ))}
      {load ? (
        <p className={styles.load}>
          {!hasHr && !hasPower ? 'No heart rate or power in this file. ' : ''}
          {loadLine(load)}
        </p>
      ) : null}
      {issue ? (
        <p className={styles.error} role="alert">
          {issue.text}{' '}
          {issue.kind === 'duplicate' ? (
            <Button variant="quiet" onPress={() => onOpen(issue.activityId)}>
              Open it
            </Button>
          ) : null}
        </p>
      ) : null}
    </section>
  )
}

