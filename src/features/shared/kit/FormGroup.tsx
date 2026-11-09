import { useState } from 'react'
import {
  DropZone,
  DurationField,
  NumberField,
  PaceField,
  PhaseSlider,
  RadioCards,
  Rating,
  SegmentedControl,
  Select,
  Slider,
  Switch,
  TextField,
  formatClock,
  formatDuration,
  formatPace,
  parseClock,
  parseDuration,
  parsePace,
} from '../../../ui/form/index.ts'
import { Pin } from './Pin.tsx'
import { Group, Helpers, Specimen, State } from './Specimen.tsx'

const FROM = 'src/ui/form/index.ts'

const SPORT_OPTIONS = [
  { id: 'swim', label: 'Swim' },
  { id: 'bike', label: 'Bike' },
  { id: 'run', label: 'Run' },
  { id: 'strength', label: 'Strength', isDisabled: true },
]
const DAY_OPTIONS = [
  { id: 'week', label: 'Week' },
  { id: 'month', label: 'Month' },
  { id: 'season', label: 'Season' },
]
const PHASES = [
  { id: 'base', label: 'Base' },
  { id: 'build', label: 'Build' },
  { id: 'peak', label: 'Peak' },
  { id: 'taper', label: 'Taper' },
]
const NOTE_FOR = 'Sample data only; nothing is saved.'

export function FormGroup() {
  const [files, setFiles] = useState<string[]>([])
  return (
    <Group
      title="Form"
      importPath={FROM}
      intro="Every control has a visible label, a hint line and an error line. Errors say what to do next, never just that something is wrong."
    >
      <Specimen name="TextField" covers={['TextField']} from={FROM} note={NOTE_FOR}>
        <State label="Default">
          <TextField label="Session title" defaultValue="Tempo run" hint="Shown on your week." />
        </State>
        <State label="Empty">
          <TextField label="Notes" placeholder="How did it feel?" />
        </State>
        <State label="Hover (pinned)">
          <Pin state="hover">
            <TextField label="Session title" defaultValue="Tempo run" />
          </Pin>
        </State>
        <State label="Focus (pinned)">
          <Pin state="focus">
            <TextField label="Session title" defaultValue="Tempo run" />
          </Pin>
        </State>
        <State label="Error">
          <TextField label="Session title" defaultValue="" error="Add a title so you can find it later." />
        </State>
        <State label="Disabled">
          <TextField label="Session title" defaultValue="Tempo run" isDisabled />
        </State>
      </Specimen>

      <Specimen name="NumberField" covers={['NumberField']} from={FROM} note="A stepper: the plus and minus buttons and the arrow keys change the value.">
        <State label="Default">
          <NumberField label="Distance" unit="km" defaultValue={12} minValue={0} />
        </State>
        <State label="Focus (pinned)">
          <Pin state="focus">
            <NumberField label="Distance" unit="km" defaultValue={12} minValue={0} />
          </Pin>
        </State>
        <State label="Error">
          <NumberField label="Distance" unit="km" defaultValue={0} error="Enter a distance above 0 km." />
        </State>
        <State label="Disabled">
          <NumberField label="Distance" unit="km" defaultValue={12} isDisabled />
        </State>
      </Specimen>

      <Specimen name="DurationField and PaceField" covers={['DurationField', 'PaceField']} from={FROM} note="Type 45:00 or 1:05:30; the value commits on blur or Enter.">
        <State label="Duration">
          <DurationField label="Time" defaultValue={3930} hint="Hours, minutes, seconds." />
        </State>
        <State label="Pace per km">
          <PaceField label="Pace" defaultValue={300} per="km" />
        </State>
        <State label="Pace per 100 m">
          <PaceField label="Swim pace" defaultValue={105} per="100m" />
        </State>
        <State label="Empty">
          <DurationField label="Time" />
        </State>
        <State label="Error">
          <DurationField label="Time" defaultValue={null} error="Enter a time like 45:00 or 1:05:30." />
        </State>
        <State label="Disabled">
          <DurationField label="Time" defaultValue={3930} isDisabled />
        </State>
      </Specimen>

      <Specimen name="Select" covers={['Select']} from={FROM}>
        <State label="Default">
          <Select label="Sport" options={SPORT_OPTIONS} defaultValue="run" />
        </State>
        <State label="Empty">
          <Select label="Sport" options={SPORT_OPTIONS} placeholder="Choose a sport" />
        </State>
        <State label="Focus (pinned)">
          <Pin state="focus">
            <Select label="Sport" options={SPORT_OPTIONS} defaultValue="bike" />
          </Pin>
        </State>
        <State label="Error">
          <Select label="Sport" options={SPORT_OPTIONS} error="Choose a sport to continue." />
        </State>
        <State label="Disabled">
          <Select label="Sport" options={SPORT_OPTIONS} defaultValue="run" isDisabled />
        </State>
      </Specimen>

      <Specimen name="SegmentedControl" covers={['SegmentedControl']} from={FROM}>
        <State label="Default">
          <SegmentedControl ariaLabel="Range" options={DAY_OPTIONS} defaultValue="week" />
        </State>
        <State label="Hover (pinned)">
          <Pin state="hover">
            <SegmentedControl ariaLabel="Range" options={DAY_OPTIONS} defaultValue="week" />
          </Pin>
        </State>
        <State label="Focus (pinned)">
          <Pin state="focus">
            <SegmentedControl ariaLabel="Range" options={DAY_OPTIONS} defaultValue="month" />
          </Pin>
        </State>
        <State label="Disabled">
          <SegmentedControl ariaLabel="Range" options={DAY_OPTIONS} defaultValue="week" isDisabled />
        </State>
      </Specimen>

      <Specimen name="RadioCards" covers={['RadioCards']} from={FROM}>
        <State label="Default" wide>
          <RadioCards
            label="How did the session feel?"
            defaultValue="steady"
            options={[
              { id: 'easy', title: 'Easy', description: 'Could talk the whole way.' },
              { id: 'steady', title: 'Steady', description: 'Comfortable work.' },
              { id: 'hard', title: 'Hard', description: 'Short sentences only.', isDisabled: true },
            ]}
          />
        </State>
        <State label="Error" wide>
          <RadioCards
            label="How did the session feel?"
            error="Pick one so your coach sees it."
            options={[
              { id: 'easy', title: 'Easy' },
              { id: 'steady', title: 'Steady' },
            ]}
          />
        </State>
      </Specimen>

      <Specimen name="Switch" covers={['Switch']} from={FROM}>
        <State label="Off">
          <Switch label="Share my check-ins with Coach" />
        </State>
        <State label="On">
          <Switch label="Share my check-ins with Coach" defaultSelected />
        </State>
        <State label="Focus (pinned)">
          <Pin state="focus">
            <Switch label="Share my check-ins with Coach" defaultSelected />
          </Pin>
        </State>
        <State label="Disabled">
          <Switch label="Share my check-ins with Coach" isDisabled />
        </State>
      </Specimen>

      <Specimen name="Slider" covers={['Slider']} from={FROM}>
        <State label="Default">
          <Slider label="Easy-day cap" defaultValue={60} minValue={30} maxValue={90} unit="%" />
        </State>
        <State label="Focus (pinned)">
          <Pin state="focus">
            <Slider label="Easy-day cap" defaultValue={60} minValue={30} maxValue={90} unit="%" />
          </Pin>
        </State>
        <State label="Disabled">
          <Slider label="Easy-day cap" defaultValue={60} minValue={30} maxValue={90} unit="%" isDisabled />
        </State>
      </Specimen>

      <Specimen name="PhaseSlider" covers={['PhaseSlider']} from={FROM} note="Multi-thumb: each thumb moves a boundary between phases, in weeks.">
        <State label="Default" wide>
          <PhaseSlider label="Season phases" phases={PHASES} defaultWeeks={[6, 6, 3, 2]} />
        </State>
        <State label="Disabled" wide>
          <PhaseSlider label="Season phases" phases={PHASES} defaultWeeks={[6, 6, 3, 2]} isDisabled />
        </State>
      </Specimen>

      <Specimen name="Rating" covers={['Rating']} from={FROM}>
        <State label="Default" wide>
          <Rating label="Sleep quality" max={5} defaultValue={4} showEnds valueNames={['Poor', 'Low', 'Fair', 'Good', 'Great']} />
        </State>
        <State label="Empty" wide>
          <Rating label="Effort" max={10} />
        </State>
        <State label="Error" wide>
          <Rating label="Sleep quality" max={5} error="Rate last night's sleep." />
        </State>
        <State label="Disabled" wide>
          <Rating label="Sleep quality" max={5} defaultValue={3} isDisabled />
        </State>
      </Specimen>

      <Specimen name="DropZone" covers={['DropZone']} from={FROM} note="Drop a file or press the button. Files stay on this device.">
        <State label="Default" wide>
          <DropZone
            label="Upload an activity file"
            title="Drop a .fit file here"
            accept={['.fit']}
            hint={files.length ? `Received: ${files.join(', ')}` : 'FIT files from a Garmin or Wahoo.'}
            onFiles={(f) => setFiles(f.map((x) => x.name))}
          />
        </State>
        <State label="Error" wide>
          <DropZone label="Upload an activity file" accept={['.fit']} error="That file is not a .fit file." onFiles={() => {}} />
        </State>
        <State label="Disabled" wide>
          <DropZone label="Upload an activity file" accept={['.fit']} isDisabled onFiles={() => {}} />
        </State>
      </Specimen>

      <Helpers
        from={FROM}
        items={[
          ['cx', 'Joins class names, skipping empty ones.'],
          ['FieldLabel', 'The label line inside a field.'],
          ['FieldFooter', 'The hint and error lines under a react-aria field.'],
          ['PlainFooter', 'The same footer for controls that are not react-aria fields.'],
          ['formatClock', `formatClock(75) = ${formatClock(75)}`],
          ['formatDuration', `formatDuration(3930) = ${formatDuration(3930)}`],
          ['formatPace', `formatPace(300) = ${formatPace(300)}`],
          ['parseClock', `parseClock("4:30") = ${String(parseClock('4:30'))}`],
          ['parseDuration', `parseDuration("1:05:30") = ${String(parseDuration('1:05:30'))}`],
          ['parsePace', `parsePace("5:00") = ${String(parsePace('5:00'))}`],
        ]}
      />
    </Group>
  )
}
