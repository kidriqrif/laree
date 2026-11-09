import {
  Badge,
  BibCard,
  Button,
  buttonClass,
  Card,
  Chip,
  CountBadge,
  EmptyState,
  IconButton,
  SPORT_LABEL,
  SportChip,
  SportGlyph,
  SportMark,
  Skeleton,
  STATUS_LABEL,
  StatusChip,
  StatusGlyph,
  Tooltip,
} from '../../../ui/core/index.ts'
import type { SportKey, StatusKey } from '../../../ui/core/index.ts'
import { IconClose, IconRun } from '../../../ui/icons/index.ts'
import { Pin } from './Pin.tsx'
import { Group, Helpers, Specimen, State } from './Specimen.tsx'
import styles from './KitPage.module.css'

const FROM = 'src/ui/core/index.ts'
const SPORTS: SportKey[] = ['swim', 'bike', 'run', 'strength']
const STATUSES: StatusKey[] = ['on-plan', 'partial', 'over', 'missed', 'unplanned']

export function CoreGroup() {
  return (
    <Group
      title="Core"
      importPath={FROM}
      intro="Buttons, chips, cards and the small marks. Button height follows the register: 48 px for athletes, 28 px for coaches."
    >
      <Specimen
        name="Button"
        covers={['Button']}
        from={FROM}
        note="Hover, focus and pressed are pinned below with the same data attributes react-aria sets. Move the pointer or press Tab on any button to see the live state."
      >
        {(['primary', 'secondary', 'quiet', 'danger'] as const).map((v) => (
          <State key={v} label={`${v} / default`}>
            <Button variant={v}>{v === 'danger' ? 'Delete session' : 'Log session'}</Button>
          </State>
        ))}
        <State label="Hover (pinned)">
          <Pin state="hover">
            <Button variant="primary">Log session</Button>
          </Pin>
        </State>
        <State label="Focus (pinned)">
          <Pin state="focus">
            <Button variant="primary">Log session</Button>
          </Pin>
        </State>
        <State label="Pressed (pinned)">
          <Pin state="pressed">
            <Button variant="secondary">Save week</Button>
          </Pin>
        </State>
        <State label="Disabled">
          <Button variant="primary" isDisabled>
            Log session
          </Button>
          <Button variant="secondary" isDisabled>
            Save week
          </Button>
        </State>
        <State label="Loading">
          <Button variant="primary" isPending>
            Saving
          </Button>
        </State>
      </Specimen>

      <Specimen name="Button class" covers={['buttonClass']} from={FROM} note="For links that must look like a button.">
        <State label="Default">
          <a href="#/kit" className={buttonClass('secondary')}>
            Open the week
          </a>
        </State>
      </Specimen>

      <Specimen name="IconButton" covers={['IconButton']} from={FROM}>
        <State label="Default">
          <IconButton aria-label="Close">
            <IconClose />
          </IconButton>
        </State>
        <State label="Hover (pinned)">
          <Pin state="hover">
            <IconButton aria-label="Close">
              <IconClose />
            </IconButton>
          </Pin>
        </State>
        <State label="Focus (pinned)">
          <Pin state="focus">
            <IconButton aria-label="Close">
              <IconClose />
            </IconButton>
          </Pin>
        </State>
        <State label="Disabled">
          <IconButton aria-label="Close" isDisabled>
            <IconClose />
          </IconButton>
        </State>
      </Specimen>

      <Specimen
        name="Tooltip"
        covers={['Tooltip']}
        from={FROM}
        note="Interactive only: it opens on hover or keyboard focus after a short delay, and Escape closes it. Hover or tab to the button."
      >
        <State label="Default">
          <Tooltip content="Weighted power over the last 20 minutes">
            <Button variant="quiet">Hover or focus me</Button>
          </Tooltip>
        </State>
      </Specimen>

      <Specimen name="Chip" covers={['Chip']} from={FROM}>
        <State label="Default">
          <Chip>Race week</Chip>
        </State>
        <State label="With glyph">
          <Chip glyph={<IconRun size={14} />}>Tempo run</Chip>
        </State>
      </Specimen>

      <Specimen name="StatusChip" covers={['StatusChip']} from={FROM} note="Always a glyph plus a word, so colour is never the only cue.">
        {STATUSES.map((s) => (
          <State key={s} label={s}>
            <StatusChip status={s} />
          </State>
        ))}
      </Specimen>

      <Specimen name="SportChip" covers={['SportChip']} from={FROM}>
        {SPORTS.map((s) => (
          <State key={s} label={s}>
            <SportChip sport={s} />
          </State>
        ))}
      </Specimen>

      <Specimen name="SportMark" covers={['SportMark']} from={FROM}>
        {SPORTS.map((s) => (
          <State key={s} label={s}>
            <SportMark sport={s} showLabel />
            <SportMark sport={s} size={32} />
          </State>
        ))}
      </Specimen>

      <Specimen name="Badge" covers={['Badge']} from={FROM} note="Earned is a sun medal with a finish-tape ribbon; locked is dashed and muted.">
        <State label="Earned">
          <Badge label="First 10 km" earned />
        </State>
        <State label="Locked">
          <Badge label="Four weeks on plan" earned={false} />
        </State>
        <State label="Earned, no label">
          <Badge label="Brick session" earned showLabel={false} />
        </State>
      </Specimen>

      <Specimen name="CountBadge" covers={['CountBadge']} from={FROM}>
        <State label="Default">
          <CountBadge count={3} label="open flags" />
        </State>
        <State label="Capped">
          <CountBadge count={120} label="unread notes" />
        </State>
      </Specimen>

      <Specimen name="Card" covers={['Card']} from={FROM} note="Soft panel for athletes, hairline box for coaches. No shadow.">
        <State label="Default">
          <Card>
            <strong>Week 17</strong>
            <p>Four of six sessions done. Load is on plan.</p>
          </Card>
        </State>
        <State label="Flush">
          <Card flush>
            <p style={{ margin: 0, padding: 'var(--space-2)' }}>Holds a table or list edge to edge.</p>
          </Card>
        </State>
      </Specimen>

      <Specimen name="BibCard" covers={['BibCard']} from={FROM} note="Race-bib card in the athlete register; a plain hairline box in the coach register.">
        <State label="Default">
          <BibCard figure="1:45:00" caption="Tempo run" mark={<SportMark sport="run" />} stub="Thu 12 Nov, 1 h 45 min" />
        </State>
        <State label="Without stub">
          <BibCard figure="42" caption="Bike endurance" mark={<SportMark sport="bike" />} />
        </State>
      </Specimen>

      <Specimen name="Skeleton" covers={['Skeleton']} from={FROM} note="The loading state. It pulses softly and stops under reduced motion.">
        <State label="Loading">
          <div aria-busy="true" style={{ display: 'grid', gap: 'var(--space-2)', inlineSize: '100%' }}>
            <Skeleton width="60%" />
            <Skeleton height="4rem" />
            <Skeleton circle width="2.5rem" height="2.5rem" />
          </div>
        </State>
      </Specimen>

      <Specimen name="EmptyState" covers={['EmptyState']} from={FROM}>
        <State label="Empty" wide>
          <EmptyState
            title="Nothing planned today"
            description="Rest is part of the plan. Log a session if you did one anyway."
            action={<Button variant="primary">Log a session</Button>}
            hint="Press N"
            illustration
            headingLevel={4}
          />
        </State>
        <State label="Error" wide>
          <div className={styles.errorBox} role="alert">
            <strong>Could not load this week</strong>
            <span>Your plan is saved on this device. Try again.</span>
            <Button variant="secondary">Try again</Button>
          </div>
        </State>
      </Specimen>

      <Specimen name="Flag row" covers={['StatusChip']} from={FROM} note="A composition, not an export: a Chip, a sentence and an action on one hairline row.">
        <State label="Default" wide>
          <div className={styles.flagRow}>
            <StatusChip status="over" label="Watch" />
            <span style={{ flex: 1 }}>Amir: Fatigue is up 18 over the week.</span>
            <Button variant="quiet">Acknowledge</Button>
          </div>
        </State>
      </Specimen>

      <Helpers
        from={FROM}
        items={[
          ['SPORT_LABEL', Object.values(SPORT_LABEL).join(', ')],
          ['STATUS_LABEL', Object.values(STATUS_LABEL).join(', ')],
          ['SportGlyph', <SportGlyph key="s" sport="swim" />],
          ['StatusGlyph', <StatusGlyph key="t" status="on-plan" />],
        ]}
      />
    </Group>
  )
}
