import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useBlocker, useNavigate, useParams, useSearchParams } from 'react-router'
import { isAthleteId } from '../../../app/people.ts'
import { useHotkeys } from '../../../app/keyboard/index.ts'
import { useCoachReadOnly } from '../../../app/useCoachReadOnly.ts'
import { useViewer } from '../../../app/viewer.ts'
import { ZoneBar } from '../../../charts/index.ts'
import { currentDay } from '../../../data/selectors.ts'
import { useLaree } from '../../../data/store.ts'
import type { AthleteId, PhaseKind, Sport, Step, WorkoutTemplate } from '../../../domain/types.ts'
import { Button, EmptyState, IconButton } from '../../../ui/core/index.ts'
import { IconUndo } from '../../../ui/icons/index.ts'
import { Select, TextField } from '../../../ui/form/index.ts'
import { ConfirmDialog, showToast, showUndoToast } from '../../../ui/overlay/index.ts'
import { distanceLabel, durationLabel, segmentsOf } from '../../athlete/workout/targets.ts'
import { ProfileChart } from '../../athlete/workout/ProfileChart.tsx'
import { deleteTemplate, duplicateTemplate, nextTemplateId, restoreTemplate } from '../library/templateOps.ts'
import { AddToCalendarSlot } from './AddToCalendarSlot.tsx'
import { ExportSlot } from './ExportSlot.tsx'
import { metaOf, PHASES, retargetForSport, startingSteps, toTemplate, validate } from './draft.ts'
import type { DraftMeta } from './draft.ts'
import { StepList, StepSummary } from './StepList.tsx'
import { TargetPreview, thresholdsFor } from './TargetPreview.tsx'
import styles from './BuilderPage.module.css'

interface Draft {
  meta: DraftMeta
  steps: Step[]
}

const SPORT_OPTIONS: { id: Sport; label: string }[] = [
  { id: 'swim', label: 'Swim' },
  { id: 'bike', label: 'Bike' },
  { id: 'run', label: 'Run' },
  { id: 'strength', label: 'Strength' },
  { id: 'other', label: 'Other' },
]
const PHASE_OPTIONS = [
  { id: 'none', label: 'No phase' },
  ...PHASES.map((p) => ({ id: p, label: p[0]!.toUpperCase() + p.slice(1) })),
]
const HISTORY_LIMIT = 50

const same = (a: Draft, b: Draft) => JSON.stringify(a) === JSON.stringify(b)

function initialDraft(template: WorkoutTemplate | undefined, sport: Sport): Draft {
  if (template) return { meta: metaOf(template), steps: structuredClone(template.steps) }
  return {
    meta: { name: '', sport, description: '', phase: '', type: '' },
    steps: startingSteps(sport),
  }
}

interface EditorProps {
  /** The saved workout, or undefined for a new one. */
  saved: WorkoutTemplate | undefined
  onSaved: (id: string) => void
}

function Editor({ saved, onSaved }: EditorProps) {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const readOnly = useCoachReadOnly()
  const data = useLaree((s) => s.data)
  const coachAthlete = useViewer((s) => s.coachAthleteId)
  const saveTemplate = useLaree((s) => s.saveTemplate)

  const sportParam = params.get('sport')
  const startSport: Sport = SPORT_OPTIONS.some((o) => o.id === sportParam) ? (sportParam as Sport) : 'bike'

  const [draft, setDraft] = useState<Draft>(() => initialDraft(saved, startSport))
  const [baseline, setBaseline] = useState<Draft>(draft)
  const [savedId, setSavedId] = useState<string | undefined>(saved?.id)
  const [attempted, setAttempted] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const past = useRef<Draft[]>([])
  const lastKey = useRef<string | undefined>(undefined)
  const dirtyRef = useRef(false)
  const dirty = !same(draft, baseline)
  useEffect(() => {
    dirtyRef.current = dirty
  }, [dirty])

  const commit = (next: Draft, key?: string) => {
    if (same(next, draft)) return
    if (key === undefined || key !== lastKey.current) {
      past.current = [...past.current.slice(-(HISTORY_LIMIT - 1)), draft]
    }
    lastKey.current = key
    setDraft(next)
  }
  const undo = () => {
    const prev = past.current.pop()
    if (!prev) return
    lastKey.current = undefined
    setDraft(prev)
  }
  const setMeta = (patch: Partial<DraftMeta>, key?: string) => commit({ ...draft, meta: { ...draft.meta, ...patch } }, key)
  const setSteps = (steps: Step[], key?: string) => commit({ ...draft, steps }, key)

  const errors = useMemo(() => validate(draft.meta, draft.steps), [draft])
  const hasErrors = Object.keys(errors).length > 0

  const previewParam = params.get('athlete')
  const previewId: AthleteId = isAthleteId(previewParam) ? previewParam : coachAthlete
  const today = currentDay()
  const previewTh = useMemo(() => thresholdsFor(data, previewId, today), [data, previewId, today])

  const id = savedId ?? nextTemplateId(data.templates)
  const template = useMemo(() => toTemplate(id, draft.meta, draft.steps), [id, draft])
  const segments = useMemo(() => segmentsOf(draft.steps, draft.meta.sport, previewTh), [draft, previewTh])
  const zoneSeconds = useMemo(() => {
    const z = [0, 0, 0, 0, 0]
    for (const s of segments) z[s.zone - 1] = (z[s.zone - 1] ?? 0) + s.durS
    return z
  }, [segments])

  const save = () => {
    if (readOnly) return
    setAttempted(true)
    if (hasErrors) {
      showToast('Fix the marked fields, then save again.')
      return
    }
    const t = toTemplate(id, draft.meta, draft.steps)
    saveTemplate(t)
    dirtyRef.current = false
    setBaseline(draft)
    past.current = []
    lastKey.current = undefined
    if (!savedId) {
      setSavedId(id)
      onSaved(id)
      void navigate(`/coach/library/${id}${params.get('athlete') ? `?athlete=${params.get('athlete')}` : ''}`, {
        replace: true,
      })
    }
    showToast(`Saved "${t.name}".`)
  }

  useHotkeys(
    [
      { keys: 'Ctrl+s', description: 'Save', inFields: true, handler: save, enabled: !readOnly },
      { keys: 'Ctrl+z', description: 'Undo last change', handler: undo, enabled: !readOnly },
    ],
    { scope: 'page' },
  )

  // Only leaving the page asks first. A change to the search alone (the preview athlete) stays on it.
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) => dirtyRef.current && currentLocation.pathname !== nextLocation.pathname,
  )
  const proceeded = useRef(false)

  const copy = () => {
    if (!savedId) return
    // The copy is made from the saved workout, so unsaved edits would be left behind.
    if (dirty) {
      showToast('Save your changes first, then duplicate.')
      return
    }
    const copyId = duplicateTemplate(savedId)
    if (copyId) {
      showToast(`Copied as "${draft.meta.name} (copy)".`)
      void navigate(`/coach/library/${copyId}`)
    }
  }
  const remove = () => {
    if (!savedId) return
    const gone = deleteTemplate(savedId)
    dirtyRef.current = false
    void navigate('/coach/library', { replace: true })
    if (gone) showUndoToast(`Deleted "${gone.name}".`, () => restoreTemplate(gone))
  }

  const setPreview = (a: AthleteId) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.set('athlete', a)
        return next
      },
      { replace: true },
    )

  const totalsLine = (
    <dl className={styles.totals} aria-label="Workout totals">
      <div>
        <dt>Duration</dt>
        <dd>{durationLabel(template.estimatedDurationS)}</dd>
      </div>
      <div>
        <dt>Distance</dt>
        <dd>{template.estimatedDistanceM ? distanceLabel(template.estimatedDistanceM) : '-'}</dd>
      </div>
      <div>
        <dt>Planned load</dt>
        <dd>{Math.round(template.estimatedLoad)}</dd>
      </div>
    </dl>
  )

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <div>
          <Link className={styles.back} to="/coach/library">
            Library
          </Link>
          <h1 className={styles.title}>{draft.meta.name.trim() || (savedId ? 'Untitled workout' : 'New workout')}</h1>
        </div>
        {readOnly ? null : (
          <div className={styles.actions}>
            {dirty ? <span className={styles.unsaved}>Unsaved changes</span> : null}
            <IconButton aria-label="Undo last change" onPress={undo}>
              <IconUndo />
            </IconButton>
            <ExportSlot template={template} />
            <AddToCalendarSlot template={template} />
            {savedId ? (
              <>
                <Button variant="secondary" onPress={copy}>
                  Duplicate
                </Button>
                <Button variant="secondary" onPress={() => setConfirmDelete(true)}>
                  Delete
                </Button>
              </>
            ) : null}
            <Button variant="primary" onPress={save}>
              Save
            </Button>
          </div>
        )}
      </header>

      <ProfileChart segments={segments} title="Workout profile" />

      <div className={styles.layout}>
        <div className={styles.col}>
          {readOnly ? null : (
            <section className={styles.panel} aria-label="Details">
              <div className={styles.metaGrid}>
                <TextField
                  className={styles.wide}
                  label="Name"
                  value={draft.meta.name}
                  error={attempted ? errors.name : undefined}
                  onChange={(v) => setMeta({ name: v }, 'name')}
                />
                <Select
                  label="Sport"
                  options={SPORT_OPTIONS}
                  value={draft.meta.sport}
                  onChange={(v) => {
                    const sport = v as Sport
                    if (sport === draft.meta.sport) return
                    commit({ meta: { ...draft.meta, sport }, steps: retargetForSport(draft.steps, sport) })
                  }}
                />
                <Select
                  label="Phase"
                  options={PHASE_OPTIONS}
                  value={draft.meta.phase || 'none'}
                  onChange={(v) => setMeta({ phase: v === 'none' ? '' : (v as PhaseKind) })}
                />
                <TextField label="Type" value={draft.meta.type} onChange={(v) => setMeta({ type: v }, 'type')} />
                <TextField
                  className={styles.wide}
                  label="Description"
                  value={draft.meta.description}
                  onChange={(v) => setMeta({ description: v }, 'description')}
                />
              </div>
            </section>
          )}
          {readOnly ? (
            <StepSummary steps={draft.steps} th={previewTh} />
          ) : (
            <StepList steps={draft.steps} sport={draft.meta.sport} errors={errors} onChange={setSteps} />
          )}
        </div>
        <div className={styles.col}>
          <section className={styles.panel} aria-labelledby="totals-title">
            <h2 id="totals-title" className={styles.panelTitle}>
              Totals
            </h2>
            {totalsLine}
            <ZoneBar seconds={zoneSeconds} />
          </section>
          <TargetPreview
            steps={draft.steps}
            sport={draft.meta.sport}
            athleteId={previewId}
            onAthlete={setPreview}
            thresholds={previewTh}
          />
        </div>
      </div>

      <ConfirmDialog
        isOpen={confirmDelete}
        onOpenChange={setConfirmDelete}
        thing={`"${draft.meta.name}"`}
        description="You can undo this straight after."
        onConfirm={remove}
      />
      <ConfirmDialog
        isOpen={blocker.state === 'blocked'}
        onOpenChange={(open) => {
          if (!open && !proceeded.current && blocker.state === 'blocked') blocker.reset()
        }}
        thing="without saving"
        description="Your changes to this workout will be lost."
        confirmLabel="Leave"
        cancelLabel="Keep editing"
        onConfirm={() => {
          proceeded.current = true
          if (blocker.state === 'blocked') blocker.proceed()
        }}
      />
    </div>
  )
}

export default function BuilderPage() {
  const { workoutId = 'new' } = useParams()
  const templates = useLaree((s) => s.data.templates)
  const [adopted, setAdopted] = useState<string | undefined>()
  const found = templates.find((t) => t.id === workoutId)
  const isNew = workoutId === 'new'

  if (!isNew && !found) {
    return (
      <div className={styles.page}>
        <EmptyState
          title="Workout not found."
          description="It may have been deleted."
          action={
            <Link className={styles.back} to="/coach/library">
              Back to the library
            </Link>
          }
        />
      </div>
    )
  }
  // A new workout keeps its editor (and its undo history) when the first save changes the URL.
  const key = isNew || workoutId === adopted ? 'draft' : workoutId
  return <Editor key={key} saved={isNew ? undefined : found} onSaved={setAdopted} />
}
