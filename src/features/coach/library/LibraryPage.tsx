import { useMemo } from 'react'
import type { SortDescriptor } from 'react-aria-components'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { useHotkeys } from '../../../app/keyboard/index.ts'
import { useCoachReadOnly } from '../../../app/useCoachReadOnly.ts'
import { currentDay } from '../../../data/selectors.ts'
import { useLaree } from '../../../data/store.ts'
import { dayToIso } from '../../../domain/time.ts'
import type { Sport, WorkoutTemplate } from '../../../domain/types.ts'
import { Button, Chip, EmptyState, IconButton, SportMark } from '../../../ui/core/index.ts'
import { IconCopy, IconTrash } from '../../../ui/icons/index.ts'
import { SegmentedControl, TextField } from '../../../ui/form/index.ts'
import { DataTable } from '../../../ui/data/index.ts'
import type { DataTableColumn } from '../../../ui/data/index.ts'
import { showToast, showUndoToast } from '../../../ui/overlay/index.ts'
import { distanceLabel, durationLabel } from '../../athlete/workout/targets.ts'
import { ProfileMini } from './ProfileMini.tsx'
import { deleteTemplate, duplicateTemplate, restoreTemplate } from './templateOps.ts'
import styles from './LibraryPage.module.css'

type SportKey = 'swim' | 'bike' | 'run' | 'strength'
type SportFilter = 'all' | SportKey
type DurationFilter = 'all' | 'short' | 'mid' | 'long'

const SPORTS: { id: SportFilter; label: string }[] = [
  { id: 'all', label: 'All sports' },
  { id: 'swim', label: 'Swim' },
  { id: 'bike', label: 'Bike' },
  { id: 'run', label: 'Run' },
  { id: 'strength', label: 'Strength' },
]

const DURATIONS: { id: DurationFilter; label: string; test: (s: number) => boolean }[] = [
  { id: 'all', label: 'Any length', test: () => true },
  { id: 'short', label: 'Under 45 min', test: (s) => s < 45 * 60 },
  { id: 'mid', label: '45 to 90 min', test: (s) => s >= 45 * 60 && s <= 90 * 60 },
  { id: 'long', label: 'Over 90 min', test: (s) => s > 90 * 60 },
]

const isSportFilter = (v: string | null): v is SportFilter => SPORTS.some((s) => s.id === v)
const isDuration = (v: string | null): v is DurationFilter => DURATIONS.some((d) => d.id === v)
const COLUMN_IDS = ['name', 'sport', 'duration', 'distance', 'load', 'lastUsed']

function parseSort(raw: string | null): SortDescriptor {
  const desc = raw?.startsWith('-') ?? false
  const col = desc ? raw?.slice(1) : raw
  const column = col && COLUMN_IDS.includes(col) ? col : 'name'
  return { column, direction: desc ? 'descending' : 'ascending' }
}

/** A whole template at a glance: whole minutes, so a swim reads "40 min", not "40 min 23 s". */
const listDuration =(seconds: number): string =>
  durationLabel(seconds < 60 ? seconds : Math.round(seconds / 60) * 60)

const shortDate = (day: number): string =>
  new Date(dayToIso(day)).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })

function tagsOf(t: WorkoutTemplate): string[] {
  return [t.tags.phase, t.tags.type].filter((x): x is string => Boolean(x))
}

export default function LibraryPage() {
  const navigate = useNavigate()
  const readOnly = useCoachReadOnly()
  const [params, setParams] = useSearchParams()
  const templates = useLaree((s) => s.data.templates)
  const planned = useLaree((s) => s.data.planned)

  const sportParam = params.get('sport')
  const durParam = params.get('dur')
  const sport: SportFilter = isSportFilter(sportParam) ? sportParam : 'all'
  const dur: DurationFilter = isDuration(durParam) ? durParam : 'all'
  const q = params.get('q') ?? ''
  const sort = parseSort(params.get('sort'))

  const setParam = (key: string, value: string | null) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (value) next.set(key, value)
        else next.delete(key)
        return next
      },
      { replace: true },
    )

  // The latest day up to today that a session built from the template sat in a plan. Days still to come do not count as used.
  const today = currentDay()
  const lastUsed = useMemo(() => {
    const m = new Map<string, number>()
    for (const w of planned) {
      if (!w.sourceTemplateId || w.day > today) continue
      m.set(w.sourceTemplateId, Math.max(m.get(w.sourceTemplateId) ?? -Infinity, w.day))
    }
    return m
  }, [planned, today])

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const test = DURATIONS.find((d) => d.id === dur)?.test ?? (() => true)
    return templates.filter(
      (t) =>
        (sport === 'all' || t.sport === (sport as Sport)) &&
        test(t.estimatedDurationS) &&
        (!needle || `${t.name} ${t.description} ${tagsOf(t).join(' ')}`.toLowerCase().includes(needle)),
    )
  }, [templates, sport, dur, q])

  const clear = () =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        for (const k of ['sport', 'dur', 'q']) next.delete(k)
        return next
      },
      { replace: true },
    )

  useHotkeys(
    [{ keys: 'n', description: 'New workout', handler: () => void navigate('/coach/library/new'), enabled: !readOnly }],
    { scope: 'page' },
  )

  const columns: DataTableColumn<WorkoutTemplate>[] = [
    {
      id: 'name',
      label: 'Name',
      sortable: true,
      isRowHeader: true,
      value: (t) => t.name,
      render: (t) => <span className={styles.name}>{t.name}</span>,
    },
    {
      id: 'sport',
      label: 'Sport',
      sortable: true,
      value: (t) => t.sport,
      render: (t) => (t.sport === 'other' ? <span>Other</span> : <SportMark sport={t.sport} showLabel size={16} />),
    },
    {
      id: 'duration',
      label: 'Duration',
      numeric: true,
      sortable: true,
      value: (t) => t.estimatedDurationS,
      render: (t) => listDuration(t.estimatedDurationS),
    },
    {
      id: 'distance',
      label: 'Distance',
      numeric: true,
      sortable: true,
      value: (t) => t.estimatedDistanceM,
      render: (t) => (t.estimatedDistanceM ? distanceLabel(t.estimatedDistanceM) : '-'),
    },
    {
      id: 'load',
      label: 'Load',
      numeric: true,
      sortable: true,
      value: (t) => t.estimatedLoad,
      render: (t) => Math.round(t.estimatedLoad),
    },
    {
      id: 'tags',
      label: 'Tags',
      value: (t) => tagsOf(t).join(' '),
      render: (t) => {
        // A phase tag and a type tag can share a word ("recovery"): show it once.
        const tags = [...new Set(tagsOf(t))]
        return tags.length ? (
          <span className={styles.tags}>
            {tags.map((x) => (
              <Chip key={x}>{x}</Chip>
            ))}
          </span>
        ) : (
          <span className={styles.untagged}>Untagged</span>
        )
      },
    },
    { id: 'profile', label: 'Profile', value: () => null, render: (t) => <ProfileMini template={t} /> },
    {
      id: 'lastUsed',
      label: 'Last used',
      sortable: true,
      value: (t) => lastUsed.get(t.id),
      render: (t) => {
        const d = lastUsed.get(t.id)
        return d === undefined ? 'Not yet' : shortDate(d)
      },
    },
  ]

  const copy = (t: WorkoutTemplate) => {
    const id = duplicateTemplate(t.id)
    if (id) showToast(`Copied as "${t.name} (copy)".`)
  }
  const remove = (t: WorkoutTemplate) => {
    const gone = deleteTemplate(t.id)
    if (gone) showUndoToast(`Deleted "${gone.name}".`, () => restoreTemplate(gone))
  }

  const newButton = (
    <Button variant="primary" onPress={() => void navigate('/coach/library/new')}>
      New workout
      <kbd className={styles.newHint} aria-hidden="true">
        N
      </kbd>
    </Button>
  )

  const noMatches = (
    <EmptyState
      title="No workouts match these filters."
      action={
        <Button variant="secondary" onPress={clear}>
          Clear filters
        </Button>
      }
    />
  )

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <h1 className={styles.title}>Library</h1>
        {readOnly ? null : newButton}
      </header>

      {templates.length === 0 ? (
        <EmptyState
          title="No workouts yet."
          description="Build your first one."
          action={readOnly ? undefined : newButton}
          hint="Press N"
        />
      ) : (
        <>
          <div className={styles.filters}>
            <SegmentedControl
              ariaLabel="Sport"
              options={SPORTS}
              value={sport}
              onChange={(id) => setParam('sport', id === 'all' ? null : id)}
            />
            <SegmentedControl
              ariaLabel="Duration"
              options={DURATIONS.map((d) => ({ id: d.id, label: d.label }))}
              value={dur}
              onChange={(id) => setParam('dur', id === 'all' ? null : id)}
            />
            <TextField
              className={styles.search}
              label="Search"
              type="search"
              value={q}
              onChange={(v) => setParam('q', v || null)}
            />
          </div>
          <output className={styles.count} aria-live="polite">
            {rows.length} {rows.length === 1 ? 'workout' : 'workouts'}
          </output>

          {readOnly ? (
            rows.length === 0 ? (
              noMatches
            ) : (
              <ul className={styles.list} aria-label="Workouts">
                {rows.map((t) => (
                  <li key={t.id} className={styles.item}>
                    <Link className={styles.itemLink} to={`/coach/library/${t.id}`}>
                      {t.name}
                    </Link>
                    <span className={styles.meta}>
                      {listDuration(t.estimatedDurationS)} · Load {Math.round(t.estimatedLoad)}
                    </span>
                  </li>
                ))}
              </ul>
            )
          ) : (
            <DataTable
              aria-label="Workouts"
              columns={columns}
              rows={rows}
              getRowId={(t) => t.id}
              sort={sort}
              onSortChange={(d) =>
                setParam(
                  'sort',
                  d.column === 'name' && d.direction === 'ascending'
                    ? null
                    : `${d.direction === 'descending' ? '-' : ''}${String(d.column)}`,
                )
              }
              onRowAction={(t) => void navigate(`/coach/library/${t.id}`)}
              rowActionsLabel="Actions"
              rowActions={(t) => (
                <span className={styles.actions}>
                  <IconButton aria-label={`Duplicate ${t.name}`} onPress={() => copy(t)}>
                    <IconCopy />
                  </IconButton>
                  <IconButton aria-label={`Delete ${t.name}`} onPress={() => remove(t)}>
                    <IconTrash />
                  </IconButton>
                </span>
              )}
              emptyState={noMatches}
            />
          )}
        </>
      )}
    </div>
  )
}
