import { useState } from 'react'
import type { AthleteId } from '../../../app/people.ts'
import { useLaree } from '../../../data/store.ts'
import { dateToDay, dayToIso } from '../../../domain/time.ts'
import type { DayOffset, Race, RacePriority } from '../../../domain/types.ts'
import { Button } from '../../../ui/core/index.ts'
import { DurationField, NumberField, RadioCards, Select, TextField } from '../../../ui/form/index.ts'
import type { RadioCardOption, SelectOption } from '../../../ui/form/index.ts'
import { Dialog } from '../../../ui/overlay/index.ts'
import styles from './SeasonPage.module.css'

export interface RaceDialogProps {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  athleteId: AthleteId
  /** Set to edit this race; omit to add one. */
  race?: Race | undefined
  /** A day to start the date on, for a new race. */
  suggestDay?: DayOffset
  /** The sport a new race starts on. */
  defaultSport?: Race['sport']
  onSaved: (race: Race, isNew: boolean) => void
  onDeleted: (race: Race) => void
}

const SPORTS: SelectOption[] = [
  { id: 'triathlon', label: 'Triathlon' },
  { id: 'bike', label: 'Bike' },
  { id: 'run', label: 'Run' },
  { id: 'swim', label: 'Swim' },
]

const PRIORITIES: RadioCardOption[] = [
  { id: 'A', title: 'A race', description: 'The one the season peaks for. Phases are built back from it.' },
  { id: 'B', title: 'B race', description: 'Important, but trained through. Marks the calendar and moves nothing.' },
  { id: 'C', title: 'C race', description: 'A hard session in race clothes. Marks the calendar and moves nothing.' },
]

type RaceSport = Race['sport']
const LEGS = ['Swim', 'Bike', 'Run'] as const

const legCount = (sport: RaceSport) => (sport === 'triathlon' ? 3 : 1)

function startingDistances(race: Race | undefined, sport: RaceSport): number[] {
  const n = legCount(sport)
  const have = race && race.sport === sport ? race.distancesKm : []
  return Array.from({ length: n }, (_, i) => have[i] ?? Number.NaN)
}

/** Add or edit a race (C7). Loaded on demand from the Season page. */
export default function RaceDialog({ isOpen, onOpenChange, athleteId, race, suggestDay, defaultSport, onSaved, onDeleted }: RaceDialogProps) {
  const races = useLaree((s) => s.data.races)
  const addRace = useLaree((s) => s.addRace)
  const updateRace = useLaree((s) => s.updateRace)
  const deleteRace = useLaree((s) => s.deleteRace)

  const [name, setName] = useState(race?.name ?? '')
  const [date, setDate] = useState(race ? dayToIso(race.day) : suggestDay !== undefined ? dayToIso(suggestDay) : '')
  const [sport, setSport] = useState<RaceSport>(race?.sport ?? defaultSport ?? 'run')
  const [distances, setDistances] = useState<number[]>(() => startingDistances(race, race?.sport ?? defaultSport ?? 'run'))
  const [climbing, setClimbing] = useState<number>(race?.climbingM ?? Number.NaN)
  const [priority, setPriority] = useState<RacePriority>(race?.priority ?? 'B')
  const [goal, setGoal] = useState<number | null>(race?.goalTimeS ?? null)
  const [errors, setErrors] = useState<{ name?: string; date?: string }>({})

  const changeSport = (id: string) => {
    const next = id as RaceSport
    setSport(next)
    setDistances(startingDistances(race, next))
  }

  const save = () => {
    const found: { name?: string; date?: string } = {}
    const trimmed = name.trim()
    if (!trimmed) found.name = 'Enter a name for the race.'
    const validDate = /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(dateToDay(date))
    if (!validDate) found.date = 'Choose the race date.'
    const day = validDate ? dateToDay(date) : 0
    if (validDate && priority === 'A') {
      const clash = races.find((r) => r.athleteId === athleteId && r.priority === 'A' && r.day === day && r.id !== race?.id)
      if (clash) found.date = `${clash.name} is already the A race on that day. Pick another day or another priority.`
    }
    setErrors(found)
    if (found.name || found.date) return

    const body: Omit<Race, 'id'> = {
      athleteId,
      name: trimmed,
      day,
      sport,
      distancesKm: distances.filter((d) => Number.isFinite(d) && d > 0),
      priority,
    }
    if (Number.isFinite(climbing) && climbing > 0) body.climbingM = climbing
    if (goal !== null && goal > 0) body.goalTimeS = goal
    if (race) {
      // A patch cannot drop a field, so rebuild the optional ones explicitly.
      updateRace(race.id, { ...body, climbingM: body.climbingM as number, goalTimeS: body.goalTimeS as number })
      onSaved({ ...race, ...body }, false)
    } else {
      const id = addRace(body)
      onSaved({ ...body, id }, true)
    }
    onOpenChange(false)
  }

  const remove = () => {
    if (!race) return
    deleteRace(race.id)
    onDeleted(race)
    onOpenChange(false)
  }

  const legs = legCount(sport)
  return (
    <Dialog
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      title={race ? 'Edit race' : 'Add race'}
      footer={
        <div className={styles.dialogFooter}>
          {race ? (
            <Button variant="danger" onPress={remove} className={styles.footerStart}>
              Delete race
            </Button>
          ) : null}
          <Button variant="quiet" onPress={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="primary" onPress={save}>
            Save
          </Button>
        </div>
      }
    >
      <form
        className={styles.form}
        noValidate
        onSubmit={(e) => {
          e.preventDefault()
          save()
        }}
      >
        <TextField label="Name" value={name} onChange={setName} error={errors.name} isRequired />
        <TextField
          label="Date"
          type="date"
          value={date}
          onChange={setDate}
          error={errors.date}
          hint="Weeks start on Monday."
          isRequired
        />
        <Select label="Sport" options={SPORTS} value={sport} onChange={changeSport} />
        <div className={styles.legs}>
          {Array.from({ length: legs }, (_, i) => (
            <NumberField
              key={`${sport}-${i}`}
              label={legs === 1 ? 'Distance' : `${LEGS[i]} distance`}
              unit="km"
              minValue={0}
              value={distances[i] ?? Number.NaN}
              onChange={(v) => setDistances((d) => d.map((x, j) => (j === i ? v : x)))}
              hint={i === 0 ? 'Optional' : undefined}
            />
          ))}
          <NumberField label="Climbing" unit="m" minValue={0} value={climbing} onChange={setClimbing} hint="Optional" />
        </div>
        <RadioCards
          label="Priority"
          options={PRIORITIES}
          value={priority}
          onChange={(id) => setPriority(id as RacePriority)}
        />
        <DurationField label="Goal time" value={goal} onChange={setGoal} hint="Optional. For example 5:20:00." />
      </form>
    </Dialog>
  )
}
