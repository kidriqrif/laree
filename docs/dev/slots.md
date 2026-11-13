# Slots and contracts for M7 to M10

This is the contract that lets the M7 to M10 tasks run in parallel. A slot is a stub file that exports one typed component and renders `null`. The host task imports it and mounts it. The owner task rewrites the file in place, keeping its path, its export name and its props. Types come from `src/domain/types.ts`.

Props below are final. If an owner needs another prop, add it as optional.

## Slot stubs

| Path | Export | Props | Owner | Host | Filled by |
|---|---|---|---|---|---|
| `src/features/athlete/log/LogSheet.tsx` | `LogSheet` | none; opens on `?sheet=log` | T7.4 | Today (T7.2) | src/features/athlete/log/LogSheet.tsx |
| `src/features/athlete/checkin/CheckInSheet.tsx` | `CheckInSheet` | none; opens on `?sheet=check-in` | T7.3 | Today (T7.2) | also src/features/athlete/checkin/CheckInSheet.tsx (rewritten in place) |
| `src/features/athlete/today/CheckInStrip.tsx` | `CheckInStrip` | `{ athleteId: AthleteId; day: DayOffset }` | T7.3 | Today (T7.2) | src/features/athlete/today/CheckInStrip.tsx |
| `src/features/athlete/today/KudosSlot.tsx` | `KudosSlot` | `{ athleteId: AthleteId }` | T10.2 | Today (T7.2) | src/features/athlete/today/KudosSlot.tsx |
| `src/features/athlete/me/AiSection.tsx` | `AiSection` | `{ athleteId: AthleteId }` | T10.3 | Me (T7.8) | src/features/athlete/me/AiSection.tsx, with src/ai/AiConsentSheet.tsx |
| `src/features/shared/activity/ActivityDetail.tsx` | `ActivityDetail` | `{ activityId: string; viewer: 'athlete' \| 'coach' }` | T7.6 | Athlete activity page (T7.6), coach activity page (T8.4) | src/features/shared/activity/ActivityDetail.tsx |
| `src/features/coach/athlete/FlagDrawerSlot.tsx` | `FlagDrawerSlot` | `{ athleteId: AthleteId; flagId: string; onClose: () => void }` | T10.1 | Athlete summary (T8.2) | src/features/coach/athlete/FlagDrawerSlot.tsx, with check-ins/FlagDetailDrawer.tsx |
| `src/features/coach/activity/KudosButtonSlot.tsx` | `KudosButtonSlot` | `{ athleteId: AthleteId; activityId: string }` | T10.2 | Coach activity page (T8.4) | src/features/coach/activity/KudosButtonSlot.tsx, with shared/kudos/KudosComposer.tsx |
| `src/features/coach/calendar/CalendarExport.tsx` | `CalendarExport` | `{ athleteId: AthleteId; weekStartDay: DayOffset; selectedWorkoutId?: string }` | T9.7 | Calendar (T9.1) | src/features/coach/calendar/CalendarExport.tsx |
| `src/features/coach/calendar/SuggestSlot.tsx` | `SuggestSlot` | `{ athleteId: AthleteId; weekStartDay: DayOffset }` | T10.5 | Calendar (T9.1) | src/features/coach/calendar/SuggestSlot.tsx, with calendar/SuggestDrawer.tsx |
| `src/features/coach/builder/ExportSlot.tsx` | `ExportSlot` | `{ template: WorkoutTemplate }` | T9.7 | Builder (T9.3) | src/features/coach/builder/ExportSlot.tsx |
| `src/features/coach/builder/AddToCalendarSlot.tsx` | `AddToCalendarSlot` | `{ template: WorkoutTemplate }` | T9.7 | Builder (T9.3) | src/features/coach/builder/AddToCalendarSlot.tsx |
| `src/features/coach/settings/AiConsentDialog.tsx` | `AiConsentDialog` | `{ athleteId: AthleteId; isOpen: boolean; onClose: () => void }` | T10.3 | Coach settings (T10.4) | src/features/coach/settings/AiConsentDialog.tsx, with src/ai/CoachConsentDialog.tsx |
| `src/features/shared/ai-panels/WeeklyRecapPanel.tsx` | `WeeklyRecapPanel` | `{ athleteId: AthleteId; weekStartDay: DayOffset }` | T10.5 | Week (T7.5) | src/features/shared/ai-panels/WeeklyRecapPanel.tsx, with AiTextPanel.tsx |
| `src/features/shared/ai-panels/CheckInSummaryPanel.tsx` | `CheckInSummaryPanel` | `{ athleteId: AthleteId; day: DayOffset }` | T10.5 | Check-in detail drawer (T10.1) | src/features/shared/ai-panels/CheckInSummaryPanel.tsx, with AiTextPanel.tsx |

Both panels are also exported from `src/features/shared/ai-panels/index.ts`; import them from there. Each stub exports its props type as `<Name>Props` (except the two sheets, which take none).

Rules for hosts: mount the slot unconditionally and let it decide whether to show anything. A slot renders nothing when it has nothing to show (for example, AI panels when consent is not active). Load sheets, dialogs and drawers with `React.lazy` inside the slot's owner file, not in the host, so the Today bundle stays under budget.

## App hooks

| Path | Export | Use | Filled by |
|---|---|---|
| `src/app/useCoachReadOnly.ts` | `useCoachReadOnly(): boolean` | True under 1024 px (IA 4.4). A coach screen then hides drag and drop, builder editing, the phase slider and every form, and shows the same data as a read-only stack. Follows resizing. Also exports `COACH_READ_ONLY_QUERY`. |
| `src/app/keyboard` | `buildDestinations(athleteId, { templates, races })`, `filterDestinations`, `DESTINATION_GROUPS` | Jump to now also lists library workouts (`/coach/library/:id`) and races (`/coach/season/:athleteId`). |

## Store actions

Saved shape is now version 2. `data.skippedCheckIns` and `data.activityNotes` are new; migration `v1ToV2` adds them.

- `logActivity(activity)`: saves, re-matches the plan, re-runs the flag rules for that athlete, awards new badges. Re-saving the same id replaces.
- `saveCheckIn(checkIn)`: replaces the day's check-in, clears a "Not today" for that day, re-runs the flag rules, awards badges.
- `skipCheckIn(athleteId, day?)`: records "Not today". It is no check-in. Does nothing if the day already has a check-in.
- `refreshFlags(athleteId?, day?)`: re-runs the rules for one athlete or all three. Harmless to repeat in a day.
- `editPlanned`, `moveWorkout`: unchanged signatures. Both re-run matching, flags and badges.
- `applyPlanChanges(changes, label): string[]`: one batch of `PlanChange` (`add`, `update`, `move`, `delete`) as one undo step. Returns the ids it added. Use for fill from library, apply suggested changes and add to calendar.
- `addPlannedFromTemplate(templateId, athleteId, day, options?): string | undefined`: copies a library template onto a day as one undo step.
- `deletePlanned(id)`: deletes a planned workout as one undo step.
- `undo()`: undoes the latest plan step (move, add, delete or batch). `undoMove()` is the same call. `undoStack[last].label` is the toast text.
- `markBadgesSeen(athleteId, ids?)`: the badge moment was shown. Defaults to all of the athlete's badges.
- `markKudosSeen(athleteId, ids?)`: the athlete has seen their kudos.
- `setActivityCoachNote(activityId, note)`: coach note on an activity. A blank note removes it.
- `addRace(race): string`, `updateRace(id, patch)`, `deleteRace(id)`.
- `setPhases(athleteId, phases)`: replaces all of an athlete's phases.
- `derivePhasesFromRace(raceId, options?): Phase[]`: derives phases back from an A race and replaces the athlete's; a B or C race returns `[]` and changes nothing.
- `setAiConsent(owner, on): boolean`: turning on needs the owner to be the viewer, so the coach can never turn AI on for an athlete (docs/spec/ai.md 2.1). Turning off is open to the owner and, for an athlete, to the coach. Returns false when refused. `setSettings` no longer accepts `aiConsent`.
- Existing and unchanged: `saveTemplate`, `acknowledgeFlag`, `resolveFlag`, `addFlagNote`, `sendKudos` (also awards a badge), `changeThreshold` (also awards a badge), `setDraft`, `clearDraft`, `setPref`, `dismissStorageBanner`, `reset`.

`flagsState` (the lifecycle records with severity, status and notes) is the source of truth. `data.flags` is the list shape and is rebuilt from it after every flag change, including flags the rules open.

## Selectors (`src/data/selectors.ts`)

Take today from `currentDay()`. Array results are memoised, so they are safe in `useLaree((s) => ...)`.

- `selectOpenFlags(data, athleteId)`: open `FlagRecord`s, most serious first.
- `selectFlagRecords(data, athleteId, status?)`: lifecycle records, newest first.
- `selectOpenFlagCount(data, athleteId?)`: open flags for one athlete, or the team. Acknowledged flags are not counted.
- `selectHasCheckedIn(data, athleteId, day)`: a check-in is saved for the day.
- `selectCheckInSkipped(data, athleteId, day)`: the athlete chose "Not today".
- `selectAiState(data, athleteId)`: `'off' | 'athlete-only' | 'waiting-for-athlete' | 'active'` (the table in docs/spec/ai.md 2.1). `aiActiveFor` is unchanged.
- `selectUnseenBadges(data, athleteId)`: badges not yet shown in the badge moment, oldest first.
- `selectUnseenKudos(data, athleteId)`, `selectKudosForActivity(data, activityId)`.
- `selectActivityCoachNote(data, activityId)`.
- `selectRaces(data, athleteId)`: soonest first.
- `selectActivity`, `selectPlannedWorkout`, `selectTemplate`: lookups by id.
- `earnedAwards(data, athleteId, today)`: every badge the data earns, from the domain `badges` function.

## Coach rail

`src/app/CoachShell.tsx` shows a flag glyph on an athlete with an open flag and a hollow dot when there is no check-in today, the open flag count on Check-ins, a Jump to field at the top and a Keyboard link in the footer. Rail icons are 24 px.
