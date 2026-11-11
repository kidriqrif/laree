import { cleanup, render } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it } from 'vitest'
import { useLaree } from '../data/store.ts'
import { AiSection } from './athlete/me/AiSection.tsx'
import { CheckInSheet } from './athlete/checkin/CheckInSheet.tsx'
import { LogSheet } from './athlete/log/LogSheet.tsx'
import { CheckInStrip } from './athlete/today/CheckInStrip.tsx'
import { KudosSlot } from './athlete/today/KudosSlot.tsx'
import { KudosButtonSlot } from './coach/activity/KudosButtonSlot.tsx'
import { FlagDrawerSlot } from './coach/athlete/FlagDrawerSlot.tsx'
import { AddToCalendarSlot } from './coach/builder/AddToCalendarSlot.tsx'
import { ExportSlot } from './coach/builder/ExportSlot.tsx'
import { CalendarExport } from './coach/calendar/CalendarExport.tsx'
import { SuggestSlot } from './coach/calendar/SuggestSlot.tsx'
import { AiConsentDialog } from './coach/settings/AiConsentDialog.tsx'
import { ActivityDetail } from './shared/activity/ActivityDetail.tsx'
import { CheckInSummaryPanel, WeeklyRecapPanel } from './shared/ai-panels/index.ts'

afterEach(cleanup)

// Every slot in docs/dev/slots.md keeps the props its table names (the file only compiles while it
// does), and each one mounts with them: real or stub, a host can rely on it.
describe('slots', () => {
  it('mount with the props the contracts name', () => {
    const template = useLaree.getState().data.templates[0]!
    const { container } = render(
      <MemoryRouter>
        <LogSheet />
        <CheckInSheet />
        <CheckInStrip athleteId="amir" day={100} />
        <KudosSlot athleteId="amir" />
        <AiSection athleteId="amir" />
        <ActivityDetail activityId="a1" viewer="athlete" />
        <ActivityDetail activityId="a1" viewer="coach" />
        <FlagDrawerSlot athleteId="amir" flagId="f1" onClose={() => {}} />
        <KudosButtonSlot athleteId="amir" activityId="a1" />
        <CalendarExport athleteId="amir" weekStartDay={112} selectedWorkoutId="w1" />
        <CalendarExport athleteId="amir" weekStartDay={112} />
        <SuggestSlot athleteId="amir" weekStartDay={112} />
        <ExportSlot template={template} />
        <AddToCalendarSlot template={template} />
        <AiConsentDialog athleteId="amir" isOpen onClose={() => {}} />
        <WeeklyRecapPanel athleteId="amir" weekStartDay={112} />
        <CheckInSummaryPanel athleteId="amir" day={100} />
      </MemoryRouter>,
    )
    expect(container).toBeTruthy()
  })
})
