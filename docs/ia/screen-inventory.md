# Screen inventory

This is the list of every screen in the Laree prototype: pages, sheets, drawers, dialogs and the few elements that stay on screen across pages. Each entry gives the screen's purpose, the main question it answers, the data it shows, its primary and secondary actions, its states, and notes on responsive layout and accessibility.

Structure, routes, flows and naming live in `docs/ia/information-architecture.md`. Formulas and rules live in the `docs/spec/` files. Examples use the fictional seeded athletes Amir (70.3 triathlete), Danial (marathoner) and Irfan (gran-fondo cyclist).

## How to read an entry

- **Purpose** is why the screen exists.
- **Main question** is what the person wants answered when they open it.
- **Data shown** is listed in priority order, highest first.
- **Primary action** is the one action the screen is built around. Secondary actions are everything else.
- **States** cover empty, partial data and error. Loading appears only where a screen can actually wait (see section 8.4 of the IA).
- **Responsive** and **Accessibility** notes add to the shared rules below. They do not repeat them.

## Shared rules

### Responsive

- **Athlete side.** Designed at 390 × 844. Works from 320 px wide with no horizontal page scroll. On wider screens the content stays in a centred column no wider than 560 px. The bottom bar and sheets stay inside that column.
- **Coach side.** Designed at 1440 × 900. The full layout runs from 1024 px. Under 1024 px the rail becomes a top bar and every screen becomes a read-only stack, with a banner that explains why.
- **Standalone pages** (`#/`, `#/brand`, `#/kit`, `#/reset`, not found) work from 320 px up.
- **Spot check** at 768 px for both sides.
- Wide tables scroll inside their own container, never the page.

### Accessibility

- The target is WCAG 2.2 AA.
- Every screen has one `h1`. On a route change, focus moves to the `h1` and the document title changes (pattern in IA section 9.8).
- A "Skip to content" link comes first in the tab order, before the prototype switcher.
- Landmarks: the switcher bar is a labelled region ("Prototype controls"), the bottom bar and the rail are `nav` landmarks, the content is `main`, and the calendar's library panel is a labelled `complementary` region.
- Colour never carries meaning alone. Compliance bands, flags, Form bands, zones and sport colours always have a glyph or a text label as well.
- Touch targets are at least 44 × 44 px on the athlete side. Coach rows are 28 px high, and every coach target is at least 24 × 24 px.
- Every chart has a one-sentence text summary and a "Show as table" control.
- Animations (the track lap fill and the badge finish tape) respect `prefers-reduced-motion`. With reduced motion, the end state appears at once.
- Every screen works at 200% zoom and with the keyboard alone.
- Sheets, drawers and dialogs trap focus, close with Esc and a visible Close button, and return focus to the control that opened them.
- Toasts live in one region that F6 reaches. Toasts with an action never time out.

## Screen list

| ID | Screen | Route or trigger | Register | Main question |
|---|---|---|---|---|
| S1 | Role picker | `#/` | Race day | Who do I want to see Laree as? |
| S2 | Prototype switcher | Every route | Shared | Whose view is this, and how do I change it? |
| S3 | Brand board | `#/brand` | Race day | What does Laree look like, and which files do I use? |
| S4 | UI kit gallery | `#/kit` | Both | Does each component look and behave right in both registers? |
| S5 | Reset demo data | `#/reset` | Race day | Do I want to throw away my changes and start fresh? |
| S6 | Not found | Unknown address or id | Depends | Where did I mean to go? |
| S7 | Update toast | A new version is waiting | Shared | Should I reload now? |
| S8 | Storage banner | Storage unavailable or full | Shared | Will my changes be kept? |
| A1 | Today | `#/athlete/today` | Race day | What do I do today, and am I on track this week? |
| A2 | Log sheet | `#/athlete/today?sheet=log` | Race day | What did I do, and how does it count? |
| A3 | Check-in sheet | `#/athlete/today?sheet=check-in` | Race day | How am I this morning? |
| A4 | Week | `#/athlete/week` | Race day | How is this week going, and what is coming? |
| A5 | Progress | `#/athlete/progress` | Race day | Am I getting fitter for my race? |
| A6 | Me | `#/athlete/me` | Race day | What does Laree know about me, and how do I change it? |
| A7 | Workout | `#/athlete/workout/:workoutId` | Race day | What exactly do I do in this session? |
| A8 | Activity | `#/athlete/activity/:activityId` | Race day | How did that go? |
| A9 | AI consent sheet | Me, "AI summaries" toggle | Race day | Do I want AI summaries, knowing what they use? |
| A10 | Badge moment | After a log earns a badge | Race day | What did I just earn? |
| C1 | Overview | `#/coach/overview` | Results sheet | Who needs me today? |
| C2 | Athlete summary | `#/coach/athlete/:athleteId` | Results sheet | How is this athlete doing, and what needs changing? |
| C3 | Calendar | `#/coach/calendar/:athleteId?` | Results sheet | What is planned, what was done, and what should move? |
| C4 | Session editor | Drawer on Calendar | Results sheet | What should this session be? |
| C5 | Suggest next week | Drawer on Calendar, AI only | Results sheet | Which suggested changes do I want? |
| C6 | Season | `#/coach/season/:athleteId?` | Results sheet | Is the season built to peak for the A race? |
| C7 | Race dialog | Season, "Add race" or a race row | Results sheet | What is this race, and how much does it matter? |
| C8 | Fill from library | Dialog on Season | Results sheet | Which workouts fill these weeks? |
| C9 | Library | `#/coach/library` | Results sheet | Which workout do I need? |
| C10 | Workout builder | `#/coach/library/:workoutId` | Results sheet | Is this workout right, and can I send it where it needs to go? |
| C11 | Add to calendar | Dialog on the builder | Results sheet | Which athlete and day get this workout? |
| C12 | Analytics | `#/coach/analytics/:athleteId?` | Results sheet | Is the training working, and is the load safe? |
| C13 | Check-ins | `#/coach/check-ins` | Results sheet | Who isn't recovering, and who deserves praise? |
| C14 | Flag detail | Pane on Check-ins, drawer on the athlete summary | Results sheet | Why was this raised, and what do I do about it? |
| C15 | Check-in detail | Drawer from a grid cell or a flag | Results sheet | What did this athlete report that day? |
| C16 | Kudos composer | Popover from any "Send kudos" | Results sheet | What do I want to say? |
| C17 | Activity | `#/coach/activity/:activityId` | Results sheet | How did the athlete carry out this session? |
| C18 | Settings | `#/coach/settings` | Results sheet | How is Laree set up for me? |
| C19 | Edit thresholds | Dialog on the athlete summary | Results sheet | What are this athlete's thresholds now? |
| C20 | Coach AI consent | Dialog on Settings | Results sheet | Do I want AI features for my athletes? |
| C21 | Jump to | `/` on the coach side | Results sheet | Where is the thing I'm thinking of? |
| C22 | Keyboard help | `?` on the coach side | Results sheet | Which keys work here? |

---

## Shared and persistent

### S1. Role picker

`#/` · Standalone frame · Reached from: app start, the Laree mark on standalone pages, the Prototype menu.

- **Purpose.** Let a visitor choose who to view the prototype as, and say plainly what the prototype is.
- **Main question.** "Who do I want to see Laree as?"
- **Data shown.**
  1. The Laree wordmark, the tagline ("Every lane counts."), and one line: "A training planner for triathlon, running and cycling. This is a prototype with made-up data, kept only on this device."
  2. "Continue as Amir" (or whichever role was last used), for returning visitors.
  3. Four role cards. Coach: "Plan and review the team. Best on a laptop." Amir: "70.3 triathlete. Teluk Half in 10 weeks." Danial: "Marathoner. Kota Marathon in 12 weeks." Irfan: "Gran-fondo cyclist. Cameron Gran Fondo in 9 weeks." The weeks to go come from the data.
  4. Links: Brand board, UI kit, Reset demo data.
- **Primary action.** Choose a role, or "Continue as".
- **Secondary actions.** Open the brand board, the UI kit or reset.
- **States.**
  - Empty: not possible. The four roles are fixed.
  - Partial data: if an athlete has no A race (for example after the coach deleted it), the card shows the sport focus only.
  - Error: if saved data cannot be read, the full-page storage notice replaces the picker and offers a reset (IA section 8.5).
- **Responsive.** One column of cards on phones. A 2 × 2 grid from 768 px. Under 1024 px the Coach card keeps its "Best on a laptop" note and still works, as a read-only stack.
- **Accessibility.** The `h1` is "Who are you today?" Each card is one button whose accessible name is the role and whose description is the one-line summary. Cards are bib cards, but the bib number is decoration and hidden from screen readers.

### S2. Prototype switcher

A bar at the top of every route.

- **Purpose.** Stand in for sign-in. Show who is viewing and let the visitor change it.
- **Main question.** "Whose view am I seeing, and how do I change it?"
- **Data shown.** The label "Prototype - viewing as", the four options (Coach, Amir, Danial, Irfan) with the current one marked, and the "Prototype" menu (Role picker, Brand board, UI kit, Reset demo data).
- **Primary action.** Choose a role. Where each choice lands is set in IA section 4.1.
- **Secondary actions.** The Prototype menu items.
- **States.**
  - Empty and partial data: not applicable.
  - Error: if storage is unavailable, the choice still works for the current visit.
  - Role follows route: when an address forces a change, a toast says so, for example "Viewing as Coach, because this is a coach page."
- **Responsive.** One line at every width. Under 600 px the four options fold into a menu button that reads "Prototype - viewing as Amir" and opens the list. The word "Prototype" stays visible at every width, so no screenshot can pass for a real product.
- **Accessibility.** The bar is a region labelled "Prototype controls". The options form a radio group with arrow-key movement. Under 600 px the menu button opens a menu with the same four options. A change is announced politely: "Viewing as Danial."

### S3. Brand board

`#/brand` · Standalone frame · Reached from: the role picker and the Prototype menu.

- **Purpose.** Show the whole brand kit in one place for review and reuse.
- **Main question.** "What does Laree look like, and which files do I use?"
- **Data shown.**
  1. The logo: primary, reversed, mono and the mark alone. A short note on its construction: the L drawn as a 400 m track bend with lane lines and a real track stagger.
  2. Icons: app icon, maskable icon, monochrome icon, and favicons at 32 and 16 px. The 1200 × 630 social image.
  3. Colour: the palette with names, hex values and contrast pairs; sport colours; the intensity heat ramp from sand to oxblood; status colours with their glyphs.
  4. Type: Anybody in expanded italic (race day) and condensed (results sheet); Atkinson Hyperlegible Next and Atkinson Hyperlegible Mono.
  5. The icon set, voice samples and the tagline ("Every lane counts.").
- **Primary action.** Download an asset as SVG or PNG.
- **Secondary actions.** Copy a hex value. Jump to a section. Switch the theme to see dark variants.
- **States.**
  - Empty: not applicable.
  - Partial data: a missing asset shows a "Not built yet" tile instead of a broken image.
  - Error: a failed download shows a message on its tile.
- **Responsive.** One column on phones. A tile grid from 768 px.
- **Accessibility.** Each logo image has alt text that names the variant. Swatches state their name, hex value and contrast ratio in text. The section index uses buttons that scroll and move focus, not fragment anchors. Download links state the format and file size.

### S4. UI kit gallery

`#/kit` · Standalone frame · Reached from: the role picker and the Prototype menu.

- **Purpose.** Show every building block and chart in both registers and all states, for design review and QA.
- **Main question.** "Does each component look and behave right in both registers?"
- **Data shown.**
  1. The register toggle (Race day | Results sheet) and the theme toggle (Light | Dark).
  2. An index of components.
  3. Each component in each state (default, hover, focus, pressed, disabled, error, loading): buttons, inputs, steppers, segmented controls, switches, single and multi-thumb sliders, sheet, drawer, dialog, toast, table, bib card, badge, flag row, empty state, error state.
  4. Charts on sample data: fitness chart, bars, bullet graph, heatmap, curve, zone bar, sparkline and track lap.
  5. The icon grid.
- **Primary action.** Switch the register.
- **Secondary actions.** Switch the theme. Jump to a component. Open live examples of the sheet, dialog, drawer and toast.
- **States.**
  - Empty: not applicable.
  - Partial data: components still being built carry a "Draft" label.
  - Error: a component that fails shows the error state inside its own tile only. The rest of the page keeps working.
- **Responsive.** One column on phones. At phone width, results-sheet examples show their read-only stack form, which is what the coach side does there.
- **Accessibility.** Each example is a labelled region. Live examples are the real components, with real focus and keyboard behaviour. The register toggle announces the change. A "Reduced motion" example shows the end state of each animation.

### S5. Reset demo data

`#/reset` · Standalone frame · Reached from: the Prototype menu, Me, Settings and the role picker.

- **Purpose.** Restore the seeded demo, after asking first. Visiting the address never resets anything on its own.
- **Main question.** "Do I want to throw away my changes and start the demo fresh?"
- **Data shown.**
  1. One sentence: "This puts the demo back to how it started."
  2. What is lost: logs, imported files, check-ins, plan edits, workouts, races, kudos, AI consent, drafts and preferences on this device.
  3. What comes back: the seeded demo for Amir, Danial and Irfan, with 16 weeks of history and 12 weeks of plan, dated to the current week.
  4. In small print: the data lives in this browser under the key `laree:v1`.
- **Primary action.** "Reset demo data", styled as destructive.
- **Secondary actions.** Cancel, which goes back, or to the role picker when there is no history.
- **States.**
  - Empty: if nothing has changed since the demo was set up, the page says so and still offers the button.
  - Partial data: not applicable.
  - Error: if storage cannot be written, the page says the reset could not be saved and the fresh demo will last only for this visit.
  - Done: "Demo data reset." with a link, "Choose who to view as", to `#/`.
- **Responsive.** One column at every width.
- **Accessibility.** The destructive button names the action in full; it never says "OK". After the reset, focus moves to the done message, which is also announced.

### S6. Not found

Any unknown address, or a valid route with an unknown id.

- **Purpose.** Say plainly that an address leads nowhere, and offer a way on.
- **Main question.** "Where did I mean to go?"
- **Data shown.**
  - **Page not found:** the heading "Off course", the line "There's no page at #/coach/calender.", and links to the role picker, Today and Overview. Under `#/athlete/` or `#/coach/` it shows inside that side's shell. Elsewhere it uses the standalone frame. `#/athlete` and `#/athlete/` are not errors: they redirect to `#/athlete/today`, like `#/coach` to `#/coach/overview`.
  - **Item not found:** inside the shell, for example "We can't find that activity. It may have been deleted, made on another device, or removed by a reset." with a link to the section's main page.
- **Primary action.** Go to the nearest main page: Today in the athlete shell, Overview in the coach shell, the role picker in the standalone frame.
- **Secondary actions.** The other links.
- **States.** This screen is itself an error state. It has no empty or partial variant.
- **Responsive.** One column at every width.
- **Accessibility.** Focus moves to the `h1`. The document title is "Not found · Laree". The requested address appears as plain text, not as a link.

### S7. Update toast

Appears when the service worker has a new version waiting.

- **Purpose.** Say that a new version is ready without reloading the page under the person.
- **Main question.** "Should I reload now?"
- **Data shown.** "A new version of Laree is ready." Buttons: "Reload" and "Later".
- **Primary action.** Reload. Drafts are saved first, and the app reopens at the same address.
- **Secondary actions.** Later. The toast hides until the next launch. The new version applies once every Laree tab has closed.
- **States.** It has no empty, partial or error variant. If the reload fails, the browser's own page shows and the old version keeps working offline.
- **Responsive.** Athlete side: above the bottom bar, inside the column. Coach side: bottom right. Standalone pages: bottom centre.
- **Accessibility.** The toast has the status role and is announced politely. It never takes focus and never times out. F6 reaches it. Undo toasts and confirmation toasts use the same region.

### S8. Storage banner

Appears below the switcher when the browser will not keep data.

- **Purpose.** Warn that changes will not survive closing the tab.
- **Main question.** "Will my changes be kept?"
- **Data shown.** "This browser isn't saving changes. They last until you close the tab." A "Why?" disclosure explains private browsing and full storage.
- **Primary action.** Dismiss for this visit.
- **Secondary actions.** Open the "Why?" disclosure.
- **States.** Not applicable.
- **Responsive.** Full width under the switcher. It wraps to two lines on phones.
- **Accessibility.** It is announced once, with the status role. The Dismiss button has a full label: "Dismiss storage warning".

---

## Athlete side

### A1. Today

`#/athlete/today` · Athlete shell · Reached from: the Today tab, the "Today" PWA shortcut, the role picker and the switcher.

- **Purpose.** The athlete's home: what to do today and how the week is going.
- **Main question.** "What do I do today, and am I on track this week?"
- **Data shown.**
  1. **Today's session** as a bib card: weekday and date, sport glyph and colour, title, planned duration, distance and load, a key-session mark, the main set in one line (for Amir, "3 × 10 min at 4:25-4:39 /km") and the first two lines of Coach's note. Days with two sessions show two cards in planned order. Once done, the card shows the result: band glyph and label ("On plan"), actual duration and distance, load, and a link to the activity.
  2. **Check-in strip.** Before checking in: "Morning check-in" with a "Check in" button. After: a one-line summary, for example "Checked in. Sleep 7 h. Soreness 2. Mood 4."
  3. **Track lap**, compact: one lane per sport in this week's plan, the share of each sport's planned work done, the pace light and, if the week overshoots, the caution state.
  4. **Tomorrow**, as a small card, and the **next race** countdown, for example "Tasik Olympic Tri. B race. In 4 weeks."
  5. **New from Coach**: the latest kudos with its message and activity, and Coach's note for the week.
  6. **A new badge**, shown once (A10).
- **Primary action.** Log: the raised + Log button, or "Log it" on the bib card.
- **Secondary actions.** Open the session (A7). Check in (A3). Open Week by tapping the lap. Open a finished activity (A8).
- **States.**
  - Empty: on a rest day, a "Rest day" card with Coach's note if there is one, and "Rest days count towards your streak." With nothing planned at all: "Nothing planned today. Rest, or log something you did."
  - Partial data: no check-in yet shows the prompt. An activity with no match shows as a separate "Unplanned" result. A week with one sport shows a one-lane lap. With no upcoming race, the countdown is hidden.
  - Error: a failed save in the log sheet keeps the sheet open with the draft intact. The storage banner (S8) covers storage problems.
- **Responsive.** At 390 × 844 the bib card, the check-in strip and the top of the lap sit above the fold. From 600 px the 560 px column is centred.
- **Accessibility.** The `h1` is "Today". The bib card is one link whose accessible name joins sport, title, duration and key-session state. The lap has a text version, for example "Run: 62% of this week's plan done. The plan expects 45% by today." After a log, the new lap text is announced politely.

### A2. Log sheet

`#/athlete/today?sheet=log` · Sheet over Today · Reached from: + Log on any athlete screen, "Log it" on the bib card, "Log this session" on a workout page, the "Log a session" PWA shortcut.

- **Purpose.** Record a session in under a minute.
- **Main question.** "What did I do, and how does it count?"
- **Data shown.**
  1. **Which session?** The match is chosen in advance: today's planned session, or the session passed from "Log this session". The other options are unlogged sessions from the last 7 days and "Not planned".
  2. **Method tabs:** Quick log, Import file, Sync device (simulated).
  3. **Quick log fields:** sport (from the match), date (today by default, any of the last 7 days), duration, distance (optional), effort from 1 to 10 with word anchors, and a note.
  4. **Import file:** a drop zone that is also a file picker, accepting .FIT, .GPX and .TCX. After reading, a preview shows sport, start time, duration, distance, average heart rate, average power or pace, and the number of laps.
  5. **Sync device (simulated):** a short explanation and a "Sync now" button. It creates an activity from the plan with realistic numbers, marked as simulated.
  6. **Load estimate** with its method and confidence, for example "Load 62, from pace, medium confidence".
- **Primary action.** Save.
- **Secondary actions.** Change the method. Change the match. Close.
- **States.**
  - Empty: with no planned sessions in the last 7 days, "Which session?" offers only "Not planned".
  - Partial data: a file without heart rate or power says what is missing and which load method will be used instead. A quick log without distance saves without it.
  - Error: an unreadable file is named, with the reason: not a .FIT, .GPX or .TCX file, damaged, no timestamps, or too large. A future date or a zero duration gets an inline message. If saving fails, the draft stays.
  - Loading: while a file is read, the drop zone shows the file name, progress and Cancel.
- **Responsive.** A bottom sheet up to 90% of the viewport height at 390 × 844, inside the 560 px column on wider screens. Save stays visible above the on-screen keyboard.
- **Accessibility.** A modal dialog titled "Log a session". Focus starts on "Which session?". The methods are a tab list. The drop zone is also a button that opens the file picker. Effort values have text anchors ("1, very easy" to "10, all out"). Errors are announced and sit next to their field.

### A3. Check-in sheet

`#/athlete/today?sheet=check-in` · Sheet over Today · Reached from: the check-in strip on Today.

- **Purpose.** Capture the morning wellness numbers in about 30 seconds.
- **Main question.** "How am I this morning?"
- **Data shown.**
  1. Sleep in hours, as a stepper in quarter hours, starting from last night's value.
  2. Soreness from 1 (none) to 5 (very sore) and mood from 1 (low) to 5 (great), each with text labels.
  3. Resting HR (bpm) and HRV (ms), prefilled "from your watch (simulated)" and editable.
  4. An optional note.
- **Primary action.** Submit, or Update when today's check-in already exists.
- **Secondary actions.** "Not today", which hides the prompt for the day. Close.
- **States.**
  - Empty: on the first check-in ever, there are no usual values to compare with, so the summary shows plain values.
  - Partial data: resting HR or HRV can be left blank. The check-in saves without them, and the coach grid shows a hollow cell for that metric.
  - Error: values out of range (sleep over 16 h, resting HR under 25 or over 120 bpm) get an inline message. If saving fails, the draft stays.
- **Responsive.** At 390 × 844 the five main inputs fit without scrolling. Submit stays visible.
- **Accessibility.** Each 1-5 scale is a radio group with visible text labels. Steppers are spin buttons with plus and minus buttons. Labels carry units, for example "Resting HR (bpm)". No meaning rests on colour.

### A4. Week

`#/athlete/week` (`?w=-1` last week, `?w=1` next week) · Athlete shell · Reached from: the Week tab and the lap on Today.

- **Purpose.** Show the whole week, planned and done.
- **Main question.** "How is this week going, and what is coming?"
- **Data shown.**
  1. The week header: relative label ("This week", "Last week", "In 3 weeks"), date range, phase, and the previous and next arrows.
  2. The track lap for the week, full size.
  3. Seven day rows, Monday to Sunday. Each shows planned sessions as bib chips (sport, title, duration) with their state (done with its band glyph, upcoming, missed or rest), unplanned activities, a race marker on race days and a check-in mark.
  4. Week totals per sport: planned against done for time and distance, and load planned against done. Past weeks add compliance as a percentage.
  5. Coach's note for the week.
  6. The weekly recap, labelled "Simulated AI - prototype" with the model `claude-haiku-5-5`, on past weeks only and only when AI is active.
- **Primary action.** Open a session (A7) or an activity (A8).
- **Secondary actions.** Previous and next week. "This week", shown when another week is on screen. + Log.
- **States.**
  - Empty: a future week with no plan says "Coach hasn't planned this week yet." A past week with nothing logged says "No activities this week."
  - Partial data: Danial's sick week (history week 11) shows its sessions as missed in a neutral style, with no alarm colour, and Coach's note if there is one.
  - Error: an out-of-range `?w` is clamped and the URL is rewritten.
- **Responsive.** Day rows stack at 390 px. The lap is full column width. The column stays at 560 px on wider screens.
- **Accessibility.** The `h1` is the week label with dates, for example "This week, 10 to 16 November". The arrows are buttons labelled "Previous week" and "Next week", and the new week is announced. Each day is a list item headed by its date. State glyphs have text labels.

### A5. Progress

`#/athlete/progress` · Athlete shell · Reached from: the Progress tab.

- **Purpose.** Show fitness and milestones over time, in plain words.
- **Main question.** "Am I getting fitter for my race?"
- **Data shown.**
  1. The next A race countdown, and Fitness now with its change over the last 16 weeks in words, for example "Fitness 58, up 14 in 16 weeks". A simple Fitness line runs through the plan to race day. Form appears as its plain-language band.
  2. The streak: weeks in a row at 80% compliance or better, and the best streak.
  3. Earned badges: name, what earned it, date.
  4. Weekly volume per sport for the last 16 weeks.
  5. Personal bests from the best-effort curves: power for Amir and Irfan, pace for Amir and Danial. Threshold changes, such as Amir's FTP rise from 245 W to 255 W, appear as milestones.
  6. Upcoming races with their priority.
- **Primary action.** None. This is a reading screen.
- **Secondary actions.** Open a badge's source activity. Open a week from its volume bar (Week with the right `?w`).
- **States.**
  - Empty: with no badges, "Badges come from real milestones, like your first 100 km week." With no A race, the countdown is hidden.
  - Partial data: with less than six weeks of history, a note says Fitness takes about six weeks to settle. Without power data (Danial), power bests are hidden and pace bests show.
  - Error: a chart that fails shows an error tile in its place. The rest of the page renders.
- **Responsive.** One column. Charts are full width. At 320 px charts use fewer axis ticks so labels stay legible.
- **Accessibility.** Each chart has a text summary and "Show as table". Badges have names and descriptions in text. The streak count is text, not only a graphic.

### A6. Me

`#/athlete/me` · Athlete shell · Reached from: the Me tab.

- **Purpose.** Hold the athlete's profile, thresholds, data sources, AI consent and preferences.
- **Main question.** "What does Laree know about me, and how do I change it?"
- **Data shown.**
  1. Profile: name, focus, and coach ("Coach").
  2. Thresholds and zones, read-only: the thresholds that apply to the athlete's sports (FTP, threshold pace, CSS, LTHR), the zone table, and a history list such as "FTP 245 W to 255 W, set by Coach".
  3. Data in: "Import file" (opens the log sheet on Import), "Sync device (simulated)" with the last sync time, and "Share to Strava", disabled. Visible text explains: "Sharing to Strava comes with the full app. Strava only shows activities to the athlete who owns them, so Coach could never see them there. Use file import or device sync instead."
  4. AI summaries: the athlete's toggle, what it would do, and a status line.
  5. Units (metric or imperial) and theme (system, light or dark).
  6. Prototype: Reset demo data and "About this prototype".
- **Primary action.** None dominant. The toggles are used most.
- **Secondary actions.** Everything listed above.
- **States.**
  - Empty: a sport with no threshold shows "Not set. Coach can add it."
  - Partial data: with the athlete's AI consent on and Coach's off, the status reads "On for you. Coach hasn't turned AI on yet."
  - Error: if a setting cannot be saved, the control reverts and a message says why.
- **Responsive.** One column, with a section index at the top whose buttons scroll to each section.
- **Accessibility.** Toggles are switches with a label and a description. The Strava explanation is visible text next to the disabled control, so nobody has to focus a disabled button to read it.

### A7. Workout

`#/athlete/workout/:workoutId` · Athlete shell, with Back · Reached from: the bib card on Today, a day row on Week.

- **Purpose.** Show one planned session in full, with targets in the athlete's own numbers.
- **Main question.** "What exactly do I do in this session?"
- **Data shown.**
  1. The bib header: weekday and date, sport, title, planned duration, distance and load, the key-session mark and the phase.
  2. Coach's note.
  3. The profile chart: intensity over time, with zone colours and zone labels.
  4. The step list, with each target as a percentage and in personal numbers. For Amir, "12 min at 88-93% FTP, 224-237 W" or "10 min at 95-100% threshold, 4:25-4:39 /km". Swim targets read per 100 m.
  5. Status: upcoming, done (with its band and a link to the activity) or missed.
- **Primary action.** "Log this session" for today and past days that are not done. Future sessions have no primary action.
- **Secondary actions.** "Send to device (simulated)". Open the matched activity.
- **States.**
  - Empty: a session without steps reads as a free session, for example "45 min easy. No set structure."
  - Partial data: a target that needs a threshold the athlete lacks shows the percentage only, with "Ask Coach to set your swim threshold."
  - Error: an unknown id shows item not found. A session owned by another athlete follows "role follows route".
- **Responsive.** The profile chart is full width, with the step list below it.
- **Accessibility.** The chart's text summary reads like "55 min with three 10-minute blocks at threshold". The step list is the full accessible equivalent of the chart. Zone colours always come with zone labels.

### A8. Activity

`#/athlete/activity/:activityId` · Athlete shell, with Back · Reached from: Today, Week, Progress.

- **Purpose.** Show what was done, how it compares with the plan, and what Coach said.
- **Main question.** "How did that go?"
- **Data shown.**
  1. The result: sport, title, date and start time, the band against plan with its percentage ("On plan, 98% of planned"), and load with its method and confidence.
  2. Big numbers: duration, distance, average pace or average and weighted power, average heart rate.
  3. Kudos from Coach.
  4. The main chart (pace or power with heart rate) and a time-in-zones bar.
  5. Laps.
  6. Effort and notes, which the athlete can edit.
  7. The source ("From file (.FIT)", "Quick log" or "Device (simulated)"), the matched session, and a route trace for imported files that carry GPS. The trace is a plain line with no map tiles.
- **Primary action.** "Add effort and notes" when they are missing. Otherwise none.
- **Secondary actions.** Change the matched session. "Share to Strava", disabled with the same explanation as Me. Delete the activity, with an Undo toast.
- **States.**
  - Empty: not applicable.
  - Partial data: a quick log has no detail data, so the charts are replaced by "Quick logs have no detail data. Import the file to see charts." Without heart rate, zones use pace or power. Without a plan, the band reads "Unplanned".
  - Error: an unknown id shows item not found.
- **Responsive.** Big numbers sit in a 2 × 2 grid at 390 px. Charts are full width. The laps table scrolls inside its own container if it must.
- **Accessibility.** Charts have text summaries and tables. The laps table has row and column headers. The band is text, with its glyph.

### A9. AI consent sheet

A sheet over Me · Reached from: the "AI summaries" toggle.

- **Purpose.** Get explicit, informed consent from the athlete.
- **Main question.** "Do I want AI summaries, knowing what they use?"
- **Data shown.** What AI would do (a weekly recap for the athlete and Coach, a check-in summary for Coach, next-week suggestions for Coach). Which data it would use. The models the MVP would use: `claude-haiku-5-5` for summaries and `claude-sonnet-5-5` for plan proposals. That the prototype shows simulated output only. That Coach must also turn it on. How to turn it off.
- **Primary action.** "Turn on".
- **Secondary actions.** "Not now".
- **States.**
  - Partial data: if Coach is already on, the sheet adds "Coach has turned AI on. Turning it on here starts it for you."
  - Error: if the choice cannot be saved, the toggle stays off and a message says why.
- **Responsive.** As A2.
- **Accessibility.** As A2. The sheet's title is "Turn on AI summaries?"

### A10. Badge moment

An inline card at the top of Today · Appears after a log or a kudos earns a badge.

- **Purpose.** Mark a real milestone, once.
- **Main question.** "What did I just earn?"
- **Data shown.** The badge name, what earned it (for example "Your first 100 km week"), the date, and the finish-tape graphic.
- **Primary action.** "See your badges", which opens Progress.
- **Secondary actions.** Dismiss.
- **States.** If two badges arrive at once, they show one after the other. Nothing else varies.
- **Responsive.** Full column width.
- **Accessibility.** It is inline, not modal, so it never traps focus. It is announced politely. With reduced motion, the tape appears already broken, with no animation.

---

## Coach side

### C1. Overview

`#/coach/overview` (`#/coach` redirects here) · Coach shell · Reached from: the rail, `g` then `o`, the role picker and the switcher.

- **Purpose.** Start the coach's day with the state of the whole team.
- **Main question.** "Who needs me today?"
- **Data shown.**
  1. The status line: the date, open flags, check-ins missing today and sessions planned today.
  2. The roster table, one row per athlete:

     | Column | Content |
     |---|---|
     | Athlete | Name, and a flag glyph when a flag is open |
     | Next race | Name, priority letter, weeks to go |
     | Phase | This week's phase |
     | This week | Done against planned load, as a percentage, with a pace-light marker |
     | Today | The planned session and its state |
     | Check-in | Sleep, soreness, mood, and resting HR and HRV against baseline, or "No check-in" |
     | Fitness, Fatigue, Form, Ramp | Numbers in monospace. Form has its band glyph. Ramp shows a caution glyph above 8 a week. |
     | Flags | Count and the top rule |
     | Last activity | When, sport and band |

  3. Needs attention: open flags with rule and values, and key sessions missed in the last 7 days.
  4. Recent team activities from the last 48 hours, each with "Send kudos".
- **Primary action.** Open an athlete (C2).
- **Secondary actions.** Open a flag. Send kudos (C16). Sort the roster. Open an athlete's calendar from the row's actions.
- **States.**
  - Empty: the roster always has three athletes in the prototype. With no flags: "No open flags." With no recent activities: "No activities in the last 48 hours."
  - Partial data: a missing check-in reads "No check-in" with a hollow dot. Columns that need power show a dash for Danial, with the accessible label "No power data".
  - Error: if one athlete's data cannot be read, that row says so and the other rows still render.
- **Responsive.** At 1440 px every column shows. From 1024 to 1279 px, Fatigue and Last activity drop out; both remain on the athlete summary. Under 1024 px the roster becomes a read-only stack with one block per athlete, fields in the same order.
- **Accessibility.** A real table with a caption ("Team today"), column headers and the athlete name as the row header. `j` and `k` move between rows and Enter opens one. Sortable headers carry `aria-sort`. Units sit in the column headers, so each cell reads as a plain number.

### C2. Athlete summary

`#/coach/athlete/:athleteId` · Coach shell · Reached from: the rail, `g` then `1`, `2` or `3`, roster rows, flags.

- **Purpose.** Everything the coach needs about one athlete, on one page.
- **Main question.** "How is this athlete doing, and what needs changing?"
- **Data shown.**
  1. The header: name, focus, A race with date and weeks to go, this week's phase, and a thresholds line such as "FTP 255 W · Threshold 4:25 /km · CSS 1:48 /100 m · LTHR 166".
  2. Open flags: rule, values, explanation, raised day and state (C14).
  3. A strip of this week and the next 7 days: planned against done, by day.
  4. The fitness chart: Fitness, Fatigue and Form over the 16 weeks of history, projected to the A race, with race markers (A, B, C) and threshold changes marked.
  5. Volume against target, by week.
  6. Recent activities: date, sport, title, duration, distance, load and method, band, effort and kudos state.
  7. Check-ins for the last 14 days: sleep, soreness, mood, resting HR and HRV, with baseline lines.
  8. The weekly recap ("Simulated AI - prototype", `claude-haiku-5-5`), only when AI is active.
  9. Zones and thresholds with their history.
- **Primary action.** Open this athlete's Calendar.
- **Secondary actions.** Open Season or Analytics. Open or resolve a flag. See a check-in (C15). Send kudos, overall or on an activity (C16). Edit thresholds (C19). "View as Amir", which moves the prototype switcher.
- **States.**
  - Empty: with no open flags, "No open flags." With no activities in the last 30 days, a line says so.
  - Partial data: without an A race, the header says "No A race yet" and links to Season, and the projection is hidden. Missing check-ins leave gaps.
  - Error: an unknown athlete id shows "We can't find that athlete" with a link to Overview.
- **Responsive.** From 1280 px, two columns: charts and tables in the main column, with flags, check-ins and thresholds beside them. From 1024 to 1279 px, one column. Under 1024 px, a read-only stack.
- **Accessibility.** The `h1` is the athlete's name. Each section has an `h2`. The flag list states its count. Charts have text summaries and tables.

### C3. Calendar

`#/coach/calendar/:athleteId?` · Coach shell · Reached from: the rail, `g` then `c`, the athlete summary.

- **Purpose.** Plan and adjust one athlete's sessions, day by day.
- **Main question.** "What is planned, what was done, and what should move?"
- **Data shown.**
  1. The toolbar: athlete picker, Today, the visible range, Export .ics, a library panel toggle, and "Suggest next week" when AI is active.
  2. Week rows, Monday to Sunday. Each row shows its date range, phase, weeks to the A race, and a mark on down weeks.
  3. Day cells: planned sessions as chips (sport glyph, title, duration, load, key mark), the matched activity's band glyph, unplanned activities, a check-in mark and race markers.
  4. A weekly totals column: planned against done for hours, distance and load, and compliance.
  5. The library panel: search, filters and draggable workouts.
- **Primary action.** Move a session: drag it, or press `m`, choose a day with the arrow keys and press Enter.
- **Secondary actions.** Open a session (C4). Add a session with `n` or by dragging from the library. Copy and paste sessions. Delete a session, with Undo. Add a note to a week. Export a session or a week as .ics. Open an activity (C17). Suggest next week (C5).
- **States.**
  - Empty: with no sessions in range, "No sessions in these weeks. Drag workouts in from the library." with a button that opens the panel.
  - Partial data: past sessions without an activity show the Missed glyph. Activities without a plan show as Unplanned chips. Days without a check-in show a hollow mark.
  - Error: past days refuse new sessions, with a message: "Past days can't take new sessions." If a change cannot be saved, it is undone and a message says why.
- **Responsive.** From 1280 px the library panel docks on the right. From 1024 to 1279 px it opens as an overlay. Under 1024 px the calendar becomes a read-only list of one week at a time, with no drag.
- **Accessibility.** Days form a grid with arrow-key movement. Each chip is focusable. Every drag has the `m` keyboard path. Pick-up, each target day and the drop are announced, for example "Threshold run moved to Saturday 15 November." Totals cells are tied to their row and column headers.

### C4. Session editor

A drawer on Calendar · Reached from: Enter or a click on a session chip, or `n` on a day.

- **Purpose.** Edit one planned session without leaving the calendar.
- **Main question.** "What should this session be?"
- **Data shown.** Title, sport, day, planned duration and distance (computed from the steps when there are steps), the load estimate, the key-session toggle, Coach's note (shown to the athlete), the compact step editor, and the matched activity if there is one.
- **Primary action.** Save.
- **Secondary actions.** Save as library workout. Duplicate. Delete, with Undo. Open the matched activity. Export the session as .fit, .zwo or .ics.
- **States.**
  - Empty: a new session starts with a sport and a duration only.
  - Partial data: a session without steps is a free session.
  - Error: inline messages for a zero duration or an empty repeat block. Closing with unsaved changes asks first.
- **Responsive.** A right-hand drawer about 420 px wide. Under 1024 px it shows the same details with no edit controls.
- **Accessibility.** A dialog titled with the session name. Focus starts on the title field. Esc closes, asking first if there are unsaved changes. Focus returns to the chip.

### C5. Suggest next week

A drawer on Calendar · Only when AI is active for this athlete.

- **Purpose.** Show the simulated AI proposal as a change set the coach accepts or rejects.
- **Main question.** "Which suggested changes do I want?"
- **Data shown.** The label "Simulated AI - prototype" and the model the MVP would use, `claude-sonnet-5-5`. A one-paragraph reason drawn from the data. Each change (move, edit, add or remove) with before and after, and its effect on the week's load. Week totals before and after.
- **Primary action.** "Accept selected".
- **Secondary actions.** Accept or reject each change. Accept all. Reject all.
- **States.**
  - Empty: "No changes suggested for next week."
  - Partial data: a change that touches a session edited since the suggestion is marked "Out of date" and cannot be accepted.
  - Error: not applicable. The output comes from templates.
- **Responsive.** A drawer. Not offered under 1024 px.
- **Accessibility.** Each change is a checkbox whose label describes it in full words. The "Simulated AI - prototype" label is visible text, not an icon.

### C6. Season

`#/coach/season/:athleteId?` · Coach shell · Reached from: the rail, `g` then `s`, the athlete summary.

- **Purpose.** Shape the season: races, phases and weekly targets.
- **Main question.** "Is the season built to peak for the A race?"
- **Data shown.**
  1. The season timeline, from history week 1 to the end of the plan: the phase band (with text labels), race markers with priority letters, weekly target load against actual load, the Fitness line with its projection, the current week marker and the down weeks.
  2. Races: name, date, sport, distances, priority, goal and weeks to go.
  3. The phase slider, one thumb per boundary.
  4. Weekly targets: week, phase, target hours, target load and actual load.
- **Primary action.** "Add race" when there is no A race. Otherwise, adjust the phases.
- **Secondary actions.** Derive phases. Fill from library for the selected weeks (C8). Edit or delete a race (C7). Edit targets. Open the calendar at a week.
- **States.**
  - Empty: with no races, "No races yet. Add the A race first. Laree builds the phases back from it." With races but no phases, "Derive phases from Teluk Half".
  - Partial data: with only B or C races, phases cannot be derived and the page says "Add an A race to derive phases." Past weeks show actuals. Future weeks show targets only.
  - Error: the slider prevents overlapping phases. Invalid targets get inline messages.
- **Responsive.** From 1024 px the timeline runs full width with the races and targets below it. Under 1024 px, a read-only stack: phases as a list of week ranges, then races, then targets.
- **Accessibility.** Each slider thumb has a label, for example "End of Build, week of 1 December". The timeline has a table equivalent. Race priority is a letter plus text ("A race").

### C7. Race dialog

A dialog on Season · Reached from: "Add race", `n` on Season, or a race row.

- **Purpose.** Add or edit a race.
- **Main question.** "What is this race, and how much does it matter?"
- **Data shown.** Name, date, sport, distances (for a triathlon, swim, bike and run), climbing in metres, priority (A, B or C, each with a one-line meaning), goal time and a note.
- **Primary action.** Save.
- **Secondary actions.** Delete, with Undo. Cancel.
- **States.**
  - Empty: a new race starts blank, with priority B selected.
  - Partial data: distances and goal are optional.
  - Error: inline messages for a missing name or date. A second A race on the same day is refused.
- **Responsive.** A centred dialog. Not offered under 1024 px.
- **Accessibility.** Priority is a radio group with text meanings. The date field is a calendar picker with weeks starting on Monday.

### C8. Fill from library

A dialog on Season · Reached from: "Fill from library" with weeks selected.

- **Purpose.** Fill the selected weeks with library workouts that suit each phase and weekly target.
- **Main question.** "Which workouts fill these weeks?"
- **Data shown.** For each week: target load and hours, and a running total against target. For each day: the proposed workout, matched on phase tag, sport and load, with lighter proposals in down weeks. Proposals are rule-based, not AI.
- **Primary action.** Apply.
- **Secondary actions.** Swap a proposal. Remove one. Clear a week.
- **States.**
  - Empty: when no library workout fits a slot, the slot says "No library workout tagged for Build bike sessions." and stays empty.
  - Partial data: weeks can be applied below target. The shortfall is shown.
  - Error: not applicable.
- **Responsive.** A large dialog. Not offered under 1024 px.
- **Accessibility.** Laid out as a table with week rows and day columns. Each slot is labelled with its week and day.

### C9. Library

`#/coach/library` · Coach shell · Reached from: the rail, `g` then `l`.

- **Purpose.** Keep and find reusable workouts.
- **Main question.** "Which workout do I need?"
- **Data shown.**
  1. Search, filters (sport, phase tag, type tag, duration range) and sort (name, duration, load, last used).
  2. The workout table: name, sport, duration, distance, load estimate, intensity, tags, a small profile and when it was last used.
- **Primary action.** Open a workout in the builder (C10).
- **Secondary actions.** New workout (`n`). Duplicate. Delete, with Undo.
- **States.**
  - Empty: with no workouts, "No workouts yet. Build your first one." With no matches, "No workouts match these filters." and "Clear filters".
  - Partial data: workouts without tags show "Untagged".
  - Error: not applicable beyond the shared rules.
- **Responsive.** A table from 1024 px. Under 1024 px, a read-only list.
- **Accessibility.** Sortable headers carry `aria-sort`. The search field has a visible label. The result count is announced when filters change.

### C10. Workout builder

`#/coach/library/:workoutId` (`new` creates one) · Coach shell · Reached from: the library, `n` on Library.

- **Purpose.** Build or edit a library workout, and export it.
- **Main question.** "Is this workout right, and can I send it where it needs to go?"
- **Data shown.**
  1. Name, sport, description and tags.
  2. The profile chart: blocks coloured and labelled by zone. Totals: duration, distance, load estimate, intensity estimate and time in zones.
  3. The step list: each step's kind, duration or distance, target type and range, and a note. Repeat blocks show their count and steps.
  4. The target preview, with an athlete picker, showing personal targets. "Sweet spot 3 × 12" reads 224-237 W for Amir and 246-260 W for Irfan.
- **Primary action.** Save (Ctrl+S). On the first save of a new workout, the URL changes from `new` to its id.
- **Secondary actions.** Export as .zwo, .mrc, .erg or .fit. Add to calendar (C11). Duplicate. Delete, with Undo. Undo and redo.
- **States.**
  - Empty: a new workout starts with a warm-up, one steady step and a cool-down.
  - Partial data: when the previewed athlete lacks a needed threshold, the preview shows percentages only for that athlete.
  - Error: inline messages for an empty repeat block or a zero duration. A format that does not fit is disabled with the reason, for example ".erg needs a bike workout with power targets". Leaving with unsaved changes asks first.
- **Responsive.** From 1280 px, the profile runs full width on top, with the steps on the left and totals and preview on the right. From 1024 to 1279 px, one column. Under 1024 px, a read-only view of the profile and steps.
- **Accessibility.** The step list is a list. Steps reorder with Alt+Up and Alt+Down as well as with buttons. Every field has a label. The chart has a text summary. Disabled export items state why they are disabled.

### C11. Add to calendar

A dialog on the builder.

- **Purpose.** Place the workout on one athlete's day.
- **Main question.** "Which athlete and day get this workout?"
- **Data shown.** An athlete picker, a date picker with weeks starting on Monday, and the sessions already on the chosen day.
- **Primary action.** Add. The workout's steps are copied into a new session.
- **Secondary actions.** Cancel.
- **States.**
  - Empty: a day with no sessions says "Nothing planned on this day."
  - Partial data: not applicable.
  - Error: past dates cannot be chosen.
- **Responsive.** A centred dialog. Not offered under 1024 px.
- **Accessibility.** The date picker is a keyboard-operable calendar grid.

### C12. Analytics

`#/coach/analytics/:athleteId?` · Coach shell · Reached from: the rail, `g` then `a`, the athlete summary.

- **Purpose.** Read one athlete's load and performance trends in depth.
- **Main question.** "Is the training working, and is the load safe?"
- **Data shown.**
  1. A range control: 6 weeks, 12 weeks or the season.
  2. The fitness chart with race markers and threshold changes.
  3. Weekly load by sport against target.
  4. Ramp per week, with the caution line at 8 a week.
  5. Time in zones by week, on the heat ramp.
  6. Best-effort curves, season best against the last 6 weeks: power for Amir and Irfan, pace for Amir and Danial.
  7. A compliance heatmap of days by weeks, with band glyphs.
  8. Threshold history.
- **Primary action.** Change the range.
- **Secondary actions.** Switch athlete. Show any chart as a table. Open a week in the calendar from a chart.
- **States.**
  - Empty: not applicable. Every athlete has history.
  - Partial data: without power data, the power curve is replaced by a note. With under six weeks of data, a note explains the Fitness warm-up.
  - Error: a chart that fails shows an error tile in its place.
- **Responsive.** From 1280 px, a two-column chart grid. From 1024 to 1279 px, one column. Under 1024 px, a read-only stack.
- **Accessibility.** Each chart has a text summary and a table view. Series use line patterns or direct labels as well as colour.

### C13. Check-ins

`#/coach/check-ins` · Coach shell · Reached from: the rail, `g` then `i`, flag links.

- **Purpose.** Read the team's daily wellness, handle flags and give kudos.
- **Main question.** "Who isn't recovering, and who deserves praise?"
- **Data shown.**
  1. The flag inbox: athlete, rule, key values, raised day and state, with filters for open, acknowledged and resolved. The selected flag shows in a detail pane (C14).
  2. The team grid: rows are athletes, columns are the last 14 days. A metric picker switches between sleep, soreness, mood, resting HR and HRV. Cells show the value, with a glyph when it is outside baseline, and a hollow cell when there was no check-in.
  3. Kudos: activities from the last 7 days with "Send kudos", and kudos sent in the last 30 days.
  4. The check-in summary per athlete ("Simulated AI - prototype", `claude-haiku-5-5`), only when AI is active.
- **Primary action.** Open and resolve a flag (`r`).
- **Secondary actions.** Open a check-in from a grid cell (C15). Send kudos (C16). Change the grid metric. Page back 14 days. Open the athlete or the calendar from a flag.
- **States.**
  - Empty: with no flags, "No open flags. Every rule is within range." With no check-ins in range, the grid shows hollow cells and a line saying so. With no recent activities, the kudos panel says "No activities in the last 7 days."
  - Partial data: an athlete who skips HRV gets hollow cells for that metric only.
  - Error: not applicable beyond the shared rules.
- **Responsive.** From 1280 px, the inbox and its detail pane sit on the left, with the grid and kudos on the right. From 1024 to 1279 px, they stack: inbox, grid, kudos. Under 1024 px, a read-only stack.
- **Accessibility.** The inbox is a list with `j`, `k` and Enter. The grid is a table with athletes as row headers and dates as column headers. Values and flag states are text.

### C14. Flag detail

A pane on Check-ins, or a drawer on the athlete summary.

- **Purpose.** Explain one flag and close it out.
- **Main question.** "Why was this raised, and what do I do about it?"
- **Data shown.** The rule ("Resting HR 7 or more above baseline"), the values ("52 bpm, baseline 44, +8"), when it was raised, a plain explanation, the linked check-ins and activities, the state history and any resolution note. Opening the flag marks it acknowledged.
- **Primary action.** Resolve, with an optional note.
- **Secondary actions.** See the check-in (C15). Open the calendar. Open the athlete. Reopen a resolved flag.
- **States.**
  - Empty: not applicable. The pane only opens on a flag.
  - Partial data: a flag that cites a deleted activity shows "Activity no longer available" in its place.
  - Error: not applicable beyond the shared rules.
- **Responsive.** A pane from 1280 px, a drawer below that. Under 1024 px it is read-only, with no Resolve.
- **Accessibility.** As a drawer it is a dialog titled with the rule name. `r` resolves. The values are text, never only a chart.

### C15. Check-in detail

A drawer · Reached from: a grid cell, a flag, or the check-in strip on the athlete summary.

- **Purpose.** Show one athlete's check-in for one day, in context.
- **Main question.** "What did this athlete report that day?"
- **Data shown.** Every value against its baseline, the note, small charts of the previous 14 days, and any flags it triggered.
- **Primary action.** Close.
- **Secondary actions.** Open the athlete. Open the calendar.
- **States.**
  - Empty: "No check-in on Tuesday 11 November."
  - Partial data: blank metrics read "Not given".
  - Error: not applicable beyond the shared rules.
- **Responsive.** A right-hand drawer. Under 1024 px, a full-width read-only panel.
- **Accessibility.** A dialog titled with the athlete and date. The small charts have a table view.

### C16. Kudos composer

A popover · Reached from: any "Send kudos" button.

- **Purpose.** Send praise quickly.
- **Main question.** "What do I want to say?"
- **Data shown.** The athlete and, when there is one, the activity. A message field, optional, up to 140 characters.
- **Primary action.** Send. A toast confirms: "Kudos sent to Amir."
- **Secondary actions.** Cancel.
- **States.**
  - Empty: sending with no message is allowed.
  - Partial data: an activity that already has kudos shows "Kudos sent" with the message, and the button reads "Send more".
  - Error: if saving fails, the message stays in the field.
- **Responsive.** A popover anchored to its button. Not offered under 1024 px.
- **Accessibility.** A dialog popover. Enter sends, Esc cancels, and the character count is announced near the limit.

### C17. Activity

`#/coach/activity/:activityId` · Coach shell · Reached from: the athlete summary, Calendar, Overview, Check-ins.

- **Purpose.** Analyse one activity in detail and respond to it.
- **Main question.** "How did the athlete carry out this session?"
- **Data shown.**
  1. The header: athlete, sport, title, date and time, source and file type, the band against plan with planned and actual duration, distance and load, and the load method and confidence.
  2. The full metrics table: duration, moving time, distance, elevation gain, average and maximum heart rate, average power, weighted power, intensity, average pace or speed, cadence.
  3. Planned against actual, step by step, when the session had steps.
  4. Charts: power or pace, heart rate, elevation, cadence. Time in zones by power, pace or heart rate.
  5. Laps.
  6. The athlete's effort and notes, and that morning's check-in.
  7. Kudos (sent, or "Send kudos") and Coach's comment.
- **Primary action.** Send kudos.
- **Secondary actions.** Change the matched session. Open the athlete. Open the calendar at that day. Newer and older activity for the same athlete.
- **States.**
  - Empty: not applicable.
  - Partial data: a quick log has no charts. A .FIT file without power shows no power chart. A .GPX file without heart rate shows no heart-rate zones. Each gap is named.
  - Error: an unknown id shows item not found.
- **Responsive.** From 1280 px, two columns: charts on the left, metrics and notes on the right. Under 1024 px, a read-only stack without kudos.
- **Accessibility.** Tables have headers. Charts have text summaries and tables.

### C18. Settings

`#/coach/settings` · Coach shell · Reached from: the rail.

- **Purpose.** Hold the coach's preferences, AI consent and the prototype controls.
- **Main question.** "How is Laree set up for me?"
- **Data shown.**
  1. AI: the coach's toggle (C20), and a table with each athlete, their consent, Coach's consent and the result (Active, or Waiting for the athlete).
  2. Units and theme.
  3. Keyboard: single-key shortcuts on or off, and a link to the help overlay.
  4. Data in and sharing: file import, simulated device sync, and "Share to Strava", disabled, with the explanation that Strava shows data only to the athlete who owns it.
  5. Locale facts: weeks start on Monday, time zone Asia/Kuala_Lumpur.
  6. Prototype: Reset demo data, About, Brand board, UI kit.
- **Primary action.** None dominant.
- **Secondary actions.** Every control listed above.
- **States.**
  - Empty: not applicable.
  - Partial data: with Coach's AI on and no athlete consent yet, every row reads "Waiting for the athlete".
  - Error: a setting that cannot be saved reverts, with a message.
- **Responsive.** From 1024 px, a section index on the left and one column of settings. Under 1024 px, read-only.
- **Accessibility.** Switches have labels and descriptions. The consent table has headers. The section index uses buttons that scroll and move focus.

### C19. Edit thresholds

A dialog on the athlete summary.

- **Purpose.** Change an athlete's thresholds and keep the history.
- **Main question.** "What are this athlete's thresholds now?"
- **Data shown.** The current FTP, threshold pace, CSS and LTHR as they apply. For each change: the new value, the date it applies from (today by default) and the source (test or coach estimate). A preview of the zones before and after.
- **Primary action.** Save. Each change adds a history row. A higher FTP can earn the athlete the "new FTP" badge (rules in `docs/spec/gamification.md`).
- **Secondary actions.** Cancel.
- **States.**
  - Empty: a threshold never set shows "Not set".
  - Partial data: not applicable.
  - Error: values outside sensible ranges get an inline message.
- **Responsive.** A centred dialog. Not offered under 1024 px.
- **Accessibility.** Each field states its unit. The zone preview is a table.

### C20. Coach AI consent

A dialog on Settings · Reached from: the coach's AI toggle.

- **Purpose.** Get explicit, informed consent from the coach.
- **Main question.** "Do I want AI features for my athletes?"
- **Data shown.** The same facts as A9, plus that AI runs for an athlete only when that athlete has also turned it on, and that suggestions never change the plan without the coach's acceptance.
- **Primary action.** "Turn on".
- **Secondary actions.** "Not now".
- **States.**
  - Partial data: the dialog lists which athletes have already consented.
  - Error: if the choice cannot be saved, the toggle stays off and a message says why.
- **Responsive.** A centred dialog.
- **Accessibility.** A dialog titled "Turn on AI features?".

### C21. Jump to

A dialog · Reached from: `/` or the rail's "Jump to" field.

- **Purpose.** Get anywhere on the coach side by typing.
- **Main question.** "Where is the thing I'm thinking of?"
- **Data shown.** A search field. Results grouped as Athletes, Sections, Library workouts and Races.
- **Primary action.** Open the highlighted result with Enter.
- **Secondary actions.** Move through results with the arrow keys.
- **States.**
  - Empty: before typing, it lists the three athletes and every section.
  - Partial data: not applicable.
  - Error: "Nothing matches 'xyz'."
- **Responsive.** A centred dialog. Under 1024 px it opens from the top bar.
- **Accessibility.** A combobox with a listbox. The result count is announced.

### C22. Keyboard help

An overlay · Reached from: `?` or the rail footer.

- **Purpose.** List the shortcuts that work.
- **Main question.** "Which keys work here?"
- **Data shown.** Shortcuts for the current screen first, then global ones. Whether single-key shortcuts are on, with a link to Settings.
- **Primary action.** Close, with Esc or `?`.
- **Secondary actions.** Open Settings.
- **States.** With single-key shortcuts off, the overlay says so and lists only the Ctrl shortcuts as active.
- **Responsive.** A centred dialog.
- **Accessibility.** A dialog with a table of keys and actions. Keys are written out in text, for example "g then c".
