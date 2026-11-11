# Build tasks: Laree prototype (milestones M4 to M12)

Generated from: PLAN (master spec), `docs/ia/information-architecture.md` (sections 3 and 7), `docs/ia/screen-inventory.md` (screen list), and the spec docs in `docs/spec/`.
Date: 2026-11-08

## How to use this list

M0 (repo and tooling) and M1 (framing docs) are done. M2 (brand kit) and M3 (tokens, fonts, DESIGN.md) are in progress. Nothing below starts until M3 has landed `src/styles/` tokens and the brand SVGs exist in `brand/svg/`. The repo today holds the Vite, React and TypeScript scaffold, oxlint, vitest and the Pages workflow stub.

Each task is a vertical slice: structure, styling, behaviour and tests ship together. A task is done only when its acceptance criteria pass and the milestone gate below is still green.

**Milestone gate (every milestone ends with this).** Typecheck, `oxlint`, `vitest run`, `vite build` within budget (athlete JavaScript at most 160 KB gzipped) and `npx impeccable detect src` with no high-severity findings. Run them through context-mode. Then make a terse commit and push to `kidriqrif/laree` main. Do not ask first.

**Task fields.** Each task lists an id, a title, why it exists, acceptance criteria that someone can test, the files it owns, and what it depends on. "Owns" means no other task in the same parallel group may edit those files. Reuse is marked as _Reuses_, _Modifies_ or _New_.

**Language rules for all UI copy.** British spelling. Words: Load, Fitness, Fatigue, Form, Ramp, Weighted power, Intensity, Threshold. Never TSS, NP, IF, CTL, ATL or TSB. Never the taglines "Lari lah" or "Jom lari".

## Ground rules that keep parallel work safe

1. **Stub pages own their routes.** Task T4.1 creates one stub page file per route at a fixed path (listed in T4.1). Feature tasks replace the stub in their own folder and never edit `src/app/router.tsx`.
2. **Slots, not shared edits.** Where one screen hosts a part built by another task (for example the Suggest next week drawer on the calendar), the host task creates a small stub file for the part. The part's task replaces that stub file only.
3. **One folder per feature.** Athlete features live in `src/features/athlete/<name>/`, coach features in `src/features/coach/<name>/`, shared ones in `src/features/shared/<name>/`.
4. **Domain code is pure.** Nothing in `src/domain/` imports React, the store or the DOM. Tests sit beside the code.
5. **Dates are day offsets** from the runtime start (the Monday 16 weeks before the current week). Never call `new Date()` outside `src/domain/time.ts`.
6. **Reset safety.** Every task that adds state adds a migration case or a seed entry, and keeps `#/reset` working.

## Overview of order and parallel groups

| Milestone | Group | Tasks that can run at the same time | Must finish first |
|---|---|---|---|
| M4 | G4a | T4.1, T4.2 | M3 |
| M4 | G4b | T4.3 | T4.1, T4.2 |
| M5 | G5a | T5.1 (alone) | M4 |
| M5 | G5b | T5.2, T5.3, T5.4, T5.5, T5.6 | T5.1 |
| M5 | G5c | T5.7, T5.9 | T5.2, T5.3 (T5.9 also needs T5.4, T5.5) |
| M5 | G5d | T5.8 | T5.7 |
| M6 | G6a | T6.1, T6.2, T6.3, T6.4, T6.5 | M4 (T6.4, T6.5 also need T5.2) |
| M6 | G6b | T6.6, T6.7, T6.8 | G6a (T6.8 needs only T6.2) |
| M7 | G7a | T7.1 (import parsers) | M5 |
| M7 | G7b | T7.2, T7.3, T7.4, T7.5, T7.6, T7.7, T7.8 | M6 (T7.4 also needs T7.1; T7.3 and T7.4 need T7.2) |
| M8 | G8 | T8.1, T8.2, T8.3, T8.4 | M6, M5 |
| M9 | G9a | T9.1, T9.2, T9.3, T9.4, T9.5, T9.6 | M6, M5 |
| M9 | G9b | T9.7 | G9a |
| M10 | G10a | T10.1, T10.2, T10.3, T10.4 | M6, M5 |
| M10 | G10b | T10.5, T10.6 | T10.3 and the calendar from T9.1 |
| M11 | G11a | T11.1 to T11.5 (read-only reviews) | M10 |
| M11 | G11b | T11.6 then T11.7 (serial) | G11a |
| M12 | G12 | T12.1, T12.2, then T12.3 | M11 |

M7, M8 and M9 can also run side by side as milestones, because their feature folders are disjoint. Only start them together if T4.1's stubs are in place.

---

## M4: Bare app and first live URL

- [x] **T4.1 Router, shells, role picker, prototype switcher, not-found.** _New._
  - Why: every later task needs routes, both layouts and a way to choose who is viewing. The role picker is also the start URL.
  - Acceptance:
    - A hash router serves every route in the route table of the information architecture (`#/`, `#/brand`, `#/kit`, `#/reset`, the six athlete routes, the nine coach routes). `#/coach` redirects to `#/coach/overview`. Any other address shows the not-found page (S6) in the right shell.
    - The athlete shell has the bottom bar: Today, Week, a raised Log button, Progress, Me. Targets are at least 44 px. Log opens `?sheet=log` on Today.
    - The coach shell has the left rail: Overview, Calendar, Season, Library, Analytics, Check-ins, Settings, with the last athlete viewed remembered for the optional-id routes.
    - The shell sets `data-register="athlete"` or `"coach"` so the M3 tokens switch. One token file, no per-page colours.
    - The "Prototype · viewing as" switcher (S2) shows on every route, lets the viewer change athlete or role, and keeps the choice in app state, never in an athlete URL.
    - The role picker (S1) offers Amir, Danial, Irfan and "Continue as Coach".
    - Works under a base path (tested in T4.3). All links are relative to the hash.
    - Stub page files exist at these paths, each rendering its screen id and name: `src/features/athlete/{today,week,progress,me,workout,activity}/*Page.tsx`, `src/features/coach/{overview,athlete,calendar,season,analytics,library,builder,check-ins,activity,settings}/*Page.tsx`, `src/features/shared/{brand,kit,reset}/*Page.tsx`.
    - Smoke tests: each route renders; unknown route renders not-found; coach redirect works.
  - Owns: `src/main.tsx`, `src/app/` except `keyboard/` and `pwa/` (router, shells, RoleSwitcher, RolePicker, NotFound), every stub page file listed above, `index.html`.
  - Depends on: M3 tokens.

- [x] **T4.2 PWA manifest, icons, shortcuts, update toast.** _New._
  - Why: the app must install on a phone and survive a reload with no network. Both are checked later in M11.
  - Acceptance:
    - `vite-plugin-pwa` generates a manifest with `start_url` and `scope` set to `./`, name "Laree", standard, maskable and monochrome icons from `brand/png/`, and the two shortcuts `./#/athlete/today?sheet=log` ("Log a session") and `./#/athlete/today` ("Today").
    - Favicons (32 px, 16 px, `.ico`) and `og.png` are in `public/` and linked in `index.html`.
    - A service worker precaches the app shell. When a new version waits, the update toast (S7) offers "Reload"; the page never reloads by itself.
    - The build passes a manifest check (script exits non-zero on a missing field).
  - Owns: `vite.config.ts`, `public/`, `src/app/pwa/` (UpdateToast and registration), `scripts/check-manifest.ts`.
  - Depends on: M2 icons, M3 tokens.

- [x] **T4.3 Pages deploy and base-path check.** _Modifies the existing workflow._
  - Why: the PLAN wants a first live URL at the end of M4, and the owner will rename the repo later.
  - Acceptance:
    - `.github/workflows/deploy.yml` runs checkout, setup-node (from `.nvmrc`), `npm ci`, typecheck, lint, test, build, configure-pages, upload-pages-artifact and deploy-pages.
    - `scripts/check-base-path.ts` serves `dist` under `/some/other/path/` and confirms the role picker, a deep link and a reload all work.
    - Vite uses `base: './'`. No absolute asset URL appears in `dist`.
    - After the owner turns on Pages (Settings, Pages, Source: GitHub Actions) the live URL loads the role picker. Ask the owner to do this step at the start of this task.
  - Owns: `.github/workflows/deploy.yml`, `scripts/check-base-path.ts`.
  - Depends on: T4.1, T4.2.

**M4 ends with the milestone gate and the first live URL.**

---

## M5: Metrics engine, seed generator, store

All of M5 is pure TypeScript. Target at least 90% coverage on `src/domain/`. Detail for each formula sits in `docs/spec/metrics.md`, `checkins-flags.md` and `gamification.md`.

- [x] **T5.1 Domain types and time model.** _New._
  - Why: all other M5 tasks share one vocabulary: Athlete, Coach, Race, Phase, PlannedWorkout, WorkoutTemplate, Step, Activity, CheckIn, Flag, Kudos, Badge, Zones and thresholds, Settings.
  - Acceptance:
    - `types.ts` defines every object in the object model, including Step targets (% FTP, % threshold pace, % LTHR, % CSS, RPE), Activity source (file, manual, simulated device) and load with method and confidence.
    - `time.ts` converts between day offsets and dates, gives week numbers and "This week / Last week / In 3 weeks" labels, and is the only file that reads the clock. Weeks start Monday. Time zone is Asia/Kuala_Lumpur.
    - Tests: week boundaries on a Sunday night and a Monday morning; label text for -1, 0, +1, +3.
  - Owns: `src/domain/types.ts`, `src/domain/time.ts`, `src/domain/time.test.ts`.
  - Depends on: M4.

- [x] **T5.2 Session load, Fitness, Fatigue, Form, Ramp.** _New._
  - Why: the numbers on every coach screen and the athlete's track lap come from here.
  - Acceptance:
    - Load uses the first method with data: power, pace, swim, heart rate, RPE, duration. Each result carries method and confidence.
    - One hour at threshold gives 100 load. Fitness is a 42-day average, Fatigue a 7-day average, Form is yesterday's Fitness minus yesterday's Fatigue, Ramp is the 7-day change in Fitness.
    - All test vectors in `docs/spec/metrics.md` section 10 pass. The one-day Form lag is tested.
  - Owns: `src/domain/metrics/load.ts`, `src/domain/metrics/fitness.ts` and their tests.
  - Depends on: T5.1.

- [x] **T5.3 Zones, compliance, best efforts.** _New._
  - Why: time in zones feeds Analytics, compliance bands feed the athlete's colour state and flags.
  - Acceptance:
    - Time in zones and the polarisation index follow `metrics.md` section 6.
    - Compliance bands: on plan (80 to 120% of plan), short, under, over, well over, missed, unplanned. Band edges at 79.9, 80, 120 and 120.1 are tested.
    - Best-effort power and pace curves are computed from a stream; a stream shorter than the window returns no value rather than zero.
  - Owns: `src/domain/metrics/zones.ts`, `compliance.ts`, `curves.ts` and tests.
  - Depends on: T5.1.

- [x] **T5.4 Check-in baselines and flag rules.** _New._
  - Why: flags are rule-based and must be explainable. AI never makes them.
  - Acceptance:
    - Each of the eight rules in the PLAN has a truth table test (fires, does not fire, edge value). Each fired flag carries rule id, the values seen and a plain explanation.
    - Lifecycle is open, acknowledged, resolved, with a resolve note. Rules run when a check-in or activity is saved, not on a timer.
    - Baselines (HRV, resting HR, sleep) are computed from history and fall back to the athlete's stored baseline when history is short.
  - Owns: `src/domain/flags.ts`, `src/domain/baselines.ts` and tests.
  - Depends on: T5.1, T5.2 (Form and Ramp inputs).

- [x] **T5.5 Streaks, badges, lap model.** _New._
  - Why: gamification must be earned and capped at the plan.
  - Acceptance:
    - Streak counts weeks at 80% compliance or better, with rest days counting. Badges: the eleven in the gamification catalogue, led by first 100 km week, new FTP, first brick and coach kudos.
    - The lap model returns per-sport lane fill, the pace light position (where the plan expects the athlete today) and a caution state above 120% of plan. Overshooting earns nothing (tested).
    - A text description function returns the screen-reader version of the lap.
    - Test cases in `docs/spec/gamification.md` section 8 pass.
  - Owns: `src/domain/gamification.ts` and tests.
  - Depends on: T5.1, T5.3.

- [x] **T5.6 Plan helpers: phases, weekly targets, target resolution.** _New._
  - Why: the season planner and the workout view both turn percentages into numbers for a given athlete.
  - Acceptance:
    - `derivePhases(race)` works back from the A race through taper, peak, build and base, with recovery after. B and C races never move phases.
    - Weekly targets follow three weeks up, one week down.
    - `resolveTarget(step, athlete)` gives watts, pace or heart rate. 88 to 93% of 255 W gives 224 to 237 W. 88 to 93% of 280 W gives 246 to 260 W. 95 to 100% of threshold pace 4:25 /km gives 4:25 to 4:39 /km.
    - Totals for a workout (duration, distance, planned load) are computed from steps, including repeat blocks.
  - Owns: `src/domain/plan.ts`, `src/domain/steps.ts` and tests.
  - Depends on: T5.1, T5.2.

- [x] **T5.7 Seed generator.** _New._
  - Why: the prototype is only convincing with believable data that always looks current.
  - Acceptance:
    - A fixed seed gives identical output on every run (snapshot test).
    - Three athletes with the facts in the shared brief: Amir (FTP 245 W raised to 255 W in history week 9, first brick in week 6), Danial (sick week 11), Irfan. 16 history weeks, 12 plan weeks, three weeks up and one down, about 85% compliance, some misses.
    - Races exist as specified (A, B, C priorities, week offsets). Check-ins exist for the history, with at least one open flag per the demo-coverage table in `checkins-flags.md`.
    - Only summaries are stored. A `streamFor(activityId)` function generates detailed streams on demand and deterministically.
    - A library of at least 12 workout templates across swim, bike, run and strength.
  - Owns: `src/data/seed/` (all files), `src/data/seed.test.ts`.
  - Depends on: T5.2, T5.3, T5.4, T5.5, T5.6.

- [x] **T5.8 Store, persistence, migrations, selectors.** _New._
  - Why: all screens read and write through one place that survives reload and can be reset.
  - Acceptance:
    - zustand store with `persist` under the key `laree:v1`, versioned, with a migration function and a test that migrates a fabricated v0 payload.
    - Actions for: log activity, edit planned workout, move workout (with undo), save template, save check-in, acknowledge and resolve flags, send kudos, change thresholds (keeping history), set AI consent per layer, set settings, reset.
    - Selectors for the athlete's day, week and progress, the coach's roster rows, and analytics series, memoised.
    - If storage is unavailable or full, the store still works in memory and sets a flag that shows the storage banner (S8).
    - Reset restores the seed exactly.
  - Owns: `src/data/store.ts`, `persist.ts`, `selectors.ts`, `migrations.ts`, `src/app/StorageBanner.tsx`, tests.
  - Depends on: T5.7.

- [x] **T5.9 Adversarial check of the formulas.** _Review task._
  - Why: the PLAN calls for a second pair of eyes on the maths before screens trust it.
  - Acceptance:
    - A reviewer who did not write T5.2 to T5.6 recomputes five spec test vectors by hand or with a throwaway script and compares.
    - Each mismatch becomes a failing test in the owning module's test file, then a fix.
    - Findings are written to `docs/qa/engine-check.md`.
  - Owns: `docs/qa/engine-check.md`. May add tests, and may edit the module under test only to fix a confirmed bug (note the bug in the file).
  - Depends on: T5.2, T5.3, T5.4, T5.5, T5.6.

**M5 ends with the milestone gate plus at least 90% coverage on `src/domain/`.**

---

## M6: UI building blocks, chart kit, `#/kit` and `#/brand`

Components must look right in both registers. The athlete register uses 17 px base text and race-bib cards; the coach register uses 14 px base text, hairlines and 28 px rows. Use react-aria-components for behaviour. No Tailwind, shadcn or lucide. CSS Modules with `@layer`. Icons are hand-drawn on a 24 px grid.

- [x] **T6.1 Core primitives and icon set.** _New._
  - Why: nearly every screen uses buttons, chips and cards.
  - Acceptance:
    - Button (primary, secondary, quiet, danger; ink label on track red), IconButton, Chip with glyph plus label for status, Badge medal, Card, BibCard (race-bib look), SportMark (swim, bike, run, strength), Tooltip, Skeleton, EmptyState.
    - Icon set of at least 40 icons covering every nav item and action named in the screen inventory.
    - Focus ring visible in both registers. Contrast of every text and background pair passes WCAG AA.
  - Owns: `src/ui/core/`, `src/ui/icons/`.
  - Depends on: M4.

- [x] **T6.2 Overlays.** _New._
  - Why: the log sheet, check-in sheet, drawers, dialogs, popovers and toasts are used by many features.
  - Acceptance:
    - Sheet (bottom, athlete), Drawer (right, coach), Dialog, ConfirmDialog, Popover, Toast region with an Undo action, all trapping focus and restoring it on close.
    - Escape closes. Sheets open from `?sheet=` search params through one helper hook `useSheetParam`.
    - `prefers-reduced-motion` removes slide animation.
  - Owns: `src/ui/overlay/`.
  - Depends on: M4.

- [x] **T6.3 Form and data controls.** _New._
  - Why: forms, tables and the planning grid need accessible parts.
  - Acceptance:
    - TextField, NumberField (with unit suffix), Select, SegmentedControl, RadioCards, Switch, Slider, multi-thumb PhaseSlider, Rating (1 to 5 and 1 to 10), DropZone, DataTable (sortable, keyboard row selection), DateStrip, GridList for drag and drop with a keyboard move mode.
    - Each control shows label, hint and error text in a consistent place.
  - Owns: `src/ui/form/`, `src/ui/data/`.
  - Depends on: M4.

- [x] **T6.4 Chart kit, part 1: scales and simple charts.** _New._
  - Why: roster rows, bars and zones appear on almost every coach screen.
  - Acceptance:
    - `scales.ts`, Axis, Sparkline, Bars (volume against target), ZoneBar, Bullet.
    - Every chart has an accessible text summary and a data table fallback. Colours come from tokens; sport colours are never the only cue.
    - Renders correctly with 0, 1 and 100 data points.
  - Owns: `src/charts/scales.ts`, `Axis.tsx`, `Sparkline.tsx`, `Bars.tsx`, `ZoneBar.tsx`, `Bullet.tsx`.
  - Depends on: T5.2 (types only), M4.

- [x] **T6.5 Chart kit, part 2: fitness chart, heatmap, curve, track lap.** _New._
  - Why: the Fitness, Fatigue and Form chart is the coach's main view and the track lap is the athlete's.
  - Acceptance:
    - PMC chart (Fitness, Fatigue, Form with a zero line and a race marker), Heatmap (check-in grid cells), Curve (best-effort), TrackLap with one lane per sport, the pace light, the caution state and a text version for screen readers.
    - The lap fill animates from the old to the new position and snaps instantly under reduced motion.
  - Owns: `src/charts/PMC.tsx`, `Heatmap.tsx`, `Curve.tsx`, `TrackLap.tsx`.
  - Depends on: T5.2, T5.5, M4.

- [x] **T6.8 Keyboard layer, Jump to, Keyboard help.** _New._
  - Why: the coach register is keyboard-first (screens C21, C22).
  - Acceptance:
    - A hotkey provider supports single keys and two-key sequences (`g` then `c`) and ignores keys typed in fields.
    - `g` then `o`, `c`, `s`, `l`, `a`, `i`, `t` go to Overview, Calendar, Season, Library, Analytics, Check-ins, Settings. `/` opens Jump to. `?` opens Keyboard help, which lists only keys that work on the current screen.
    - Pages register their own keys through a hook; the provider owns no page keys.
  - Owns: `src/app/keyboard/`.
  - Depends on: T6.2 (for the dialogs), T4.1.

- [x] **T6.6 UI kit gallery at `#/kit`.** _Replaces stub._
  - Why: one place to check every component in both registers (S4), and the target for impeccable's rendered audits.
  - Acceptance:
    - Every component and chart from T6.1 to T6.5 appears with its states (default, hover, focus, disabled, error, empty) and a toggle for the two registers and for light and dark.
    - The page is lazy-loaded and does not count against the athlete bundle budget.
  - Owns: `src/features/shared/kit/`.
  - Depends on: T6.1 to T6.5, T6.8.

- [x] **T6.7 Brand board at `#/brand`.** _Replaces stub._
  - Why: S3 shows the logo, palette, type and downloads.
  - Acceptance:
    - Shows every logo variant from `brand/svg/`, the palette with hex values, the type specimens, usage rules and the tagline ("Every lane counts.").
    - Each file has a working download link that works under any base path.
  - Owns: `src/features/shared/brand/`.
  - Depends on: M2, T6.1.

**M6 ends with the milestone gate and a screenshot of `#/kit` in both registers.**

---

## M7: Athlete app

- [x] **T7.1 File import parsers (FIT, GPX, TCX).** _New._
  - Why: the log sheet needs to read real files without trusting their names.
  - Acceptance:
    - Format is detected from content. `@garmin/fitsdk` loads only when a FIT file is chosen.
    - Each parser returns a summary (start, duration, distance, average and maximum heart rate, power if present, laps) or a typed error naming the file and the reason.
    - Fixture files for each format, one corrupt file, one renamed file (a GPX named `.fit`) and one empty file are covered by tests. Nothing is stored when a parse fails.
  - Owns: `src/io/import/`, `src/io/import/__fixtures__/`.
  - Depends on: T5.1.

- [x] **T7.2 Today page.** _Replaces stub._
  - Why: the athlete's first screen. It must answer "what do I do today, and am I on track?" in one glance.
  - Acceptance:
    - Shows today's session as a bib card with title, duration, key-session mark and Coach's note, the track lap, the check-in strip and any new kudos.
    - States: rest day, session done (band and load shown), missed, nothing planned, loading skeleton, and first-time empty.
    - Tapping the card opens `#/athlete/workout/:id`; "Log it" opens the log sheet with the session pre-matched.
    - Kudos slot and check-in strip slot are stub files (`KudosSlot.tsx`, `CheckInStrip.tsx` in the same folder). The check-in strip is finished by T7.3 and the kudos slot by T10.2.
    - Works at 390 by 844 with no horizontal scroll.
  - Owns: `src/features/athlete/today/` (except `CheckInStrip.tsx` and `KudosSlot.tsx`).
  - Depends on: M6, T5.8.

- [x] **T7.3 Check-in sheet and strip.** _Replaces stub._
  - Why: the daily check-in feeds the flags.
  - Acceptance:
    - Sheet at `?sheet=check-in` with sleep hours, soreness 1 to 5, mood 1 to 5, resting heart rate and HRV prefilled "from your watch (simulated)", and an optional note.
    - Submit saves, closes, and the strip reads "Checked in. Sleep 7 h. Soreness 2. Mood 4." Values far from baseline are stated in neutral words with no alarm.
    - "Not today" is recorded as no check-in. Editing is allowed until midnight Malaysia time.
    - Saving runs the flag rules. A fired flag appears for the coach and not for the athlete.
  - Owns: `src/features/athlete/checkin/`, `src/features/athlete/today/CheckInStrip.tsx`.
  - Depends on: T7.2 (stub in place), T5.4, T5.8, T6.2.

- [x] **T7.4 Log sheet with quick log, import and simulated sync.** _Replaces stub._
  - Why: the main athlete action.
  - Acceptance:
    - Sheet at `?sheet=log` with "Which session?" defaulting to today's, with a "Not planned" option.
    - Quick log: duration, optional distance, effort 1 to 10, note, live load estimate with method and confidence.
    - Import file: drop zone, preview, clear error text that names the failing file, and the chosen match survives a failed import.
    - Sync device: one tap creates a realistic activity labelled "Simulated".
    - Save closes the sheet and the URL returns to `#/athlete/today`. The lap updates, and a badge moment (A10) shows if one is earned.
  - Owns: `src/features/athlete/log/`, `src/features/athlete/badge-moment/`.
  - Depends on: T7.1, T7.2, T5.5, T5.8, T6.2, T6.3.

- [x] **T7.5 Week page.** _Replaces stub._
  - Why: A4 shows this week and the next.
  - Acceptance:
    - Seven day rows with planned and done, week total against target, band chips, and the lap. `?w=-1` and `?w=1` show last and next week; labels read "Last week", "This week", "Next week".
    - Swipe or arrow buttons change week and update the URL.
  - Owns: `src/features/athlete/week/`.
  - Depends on: M6, T5.8.

- [x] **T7.6 Workout and Activity pages (athlete and shared detail).** _Replaces two stubs, creates a shared view._
  - Why: A7 and A8, and the coach's activity page (T8.4) reuses the shared view.
  - Acceptance:
    - Workout shows steps with the athlete's own targets ("10 min at 95-100% threshold, 4:25-4:39 /km") and a profile chart. Back returns to Today.
    - Activity shows summary metrics, load with method and confidence, RPE, notes, matched plan, compliance band, kudos if any, and a disabled "Share to Strava" with an explanation that Strava is outbound only.
    - `ActivityDetail` lives in `src/features/shared/activity/` and takes a `viewer` prop.
  - Owns: `src/features/athlete/workout/`, `src/features/athlete/activity/`, `src/features/shared/activity/`.
  - Depends on: M6, T5.6, T5.8.

- [x] **T7.7 Progress page.** _Replaces stub._
  - Why: A5 answers "Am I getting fitter for my race?"
  - Acceptance:
    - Race countdown, Fitness trend for 16 weeks in plain words, volume against target, streak, and the badge shelf with finish tape.
    - Never shows Fatigue or Form in athlete copy unless explained in one sentence.
  - Owns: `src/features/athlete/progress/`.
  - Depends on: M6, T5.5, T5.8.

- [x] **T7.8 Me page.** _Replaces stub._
  - Why: A6 holds profile, thresholds, data in, AI consent and preferences.
  - Acceptance:
    - Shows thresholds with history (Amir's FTP 245 to 255 W), data-in options with Strava outbound-only note, units, theme, and a reset link to `#/reset`.
    - The "AI summaries" section is a stub component (`AiSection.tsx`) finished by T10.3.
  - Owns: `src/features/athlete/me/` (except `AiSection.tsx`), `src/features/shared/reset/`.
  - Depends on: M6, T5.8.

**M7 ends with the milestone gate and an athlete walk-through at 390 by 844 for Amir, Danial and Irfan.**

---

## M8: Coach roster, athlete page, analytics

- [x] **T8.1 Overview roster.** _Replaces stub._
  - Why: C1, "Who needs me today?"
  - Acceptance:
    - Dense results-sheet table: one row per athlete with next race, week compliance, Fitness, Form, Ramp, last check-in and flag glyph. Sorting, `j`/`k` row focus, Enter to open.
    - A status line states counts of open flags, missing check-ins and sessions today.
  - Owns: `src/features/coach/overview/`.
  - Depends on: M6, T5.8, T6.8.

- [x] **T8.2 Athlete summary and thresholds dialog.** _Replaces stub._
  - Why: C2 and C19.
  - Acceptance:
    - Fitness chart, volume against target, flags at the top with the rule and values, recent activities.
    - The thresholds dialog edits FTP, threshold pace, CSS, LTHR, and keeps the old value in history with a date.
    - Flag detail drawer (C14) is mounted from `FlagDrawerSlot.tsx`, a stub finished by T10.1.
  - Owns: `src/features/coach/athlete/` (except `FlagDrawerSlot.tsx`).
  - Depends on: M6, T5.8.

- [x] **T8.3 Analytics page.** _Replaces stub._
  - Why: C12, "Is the training working, and is the load safe?"
  - Acceptance:
    - Fitness, Fatigue, Form with Ramp, weekly load, time in zones with polarisation, best-effort curves, compliance by week. Period selector.
    - Defaults to the last athlete viewed when the optional id is missing.
  - Owns: `src/features/coach/analytics/`.
  - Depends on: M6, T5.8.

- [x] **T8.4 Coach activity page.** _Replaces stub._
  - Why: C17.
  - Acceptance:
    - Renders the shared `ActivityDetail` with the coach viewer, adding "Send kudos" via `KudosButtonSlot.tsx` (stub finished by T10.2) and the coach note field.
  - Owns: `src/features/coach/activity/`.
  - Depends on: T7.6.

**M8 ends with the milestone gate and a screenshot at 1440 by 900.**

---

## M9: Calendar, season planner, builder, exports

- [x] **T9.1 Calendar and session editor.** _Replaces stub._
  - Why: C3 and C4. The hardest interaction in the coach app, so it starts early.
  - Acceptance:
    - Week grid for the chosen athlete with planned and done. Drag a session to another day; or focus it, press `m`, move with arrows, press Enter. Totals update and a toast offers Undo.
    - The session editor drawer changes sport, title, steps summary, duration and note.
    - Stub files `CalendarExport.tsx` (finished by T9.7) and `SuggestSlot.tsx` (finished by T10.5) sit in the calendar folder.
    - Moving to a day that already has a session asks what to do instead of overwriting.
  - Owns: `src/features/coach/calendar/` (except the two stub files).
  - Depends on: M6, T5.8, T6.8.

- [x] **T9.2 Season planner, race dialog, fill from library.** _Replaces stub._
  - Why: C6, C7, C8.
  - Acceptance:
    - Race list, phase band, phase slider with arrow keys, weekly target bars.
    - Empty season text: "No races yet. Add the A race first. Laree builds the phases back from it."
    - Adding the A race offers "Derive phases". B and C races add markers and move nothing.
    - "Fill from library" proposes workouts per day matching phase and weekly load, with a lighter down week, lets the coach swap one, applies, and offers Undo and a link to the calendar.
  - Owns: `src/features/coach/season/`.
  - Depends on: M6, T5.6, T5.8.

- [x] **T9.3 Library and workout builder.** _Replaces two stubs._
  - Why: C9, C10.
  - Acceptance:
    - Library with sport and duration filters and search. `n` starts a new workout at `#/coach/library/new`.
    - Builder: step list with warm-up, steady, interval, recovery, cool-down and repeat blocks; target types as in the object model; profile chart; totals; target preview for a chosen athlete (224-237 W at 255 W). `Ctrl+S` saves and the URL changes from `new` to the id.
    - The Export menu and Add to calendar are stub files (`ExportSlot.tsx`, `AddToCalendarSlot.tsx`) finished by T9.7.
  - Owns: `src/features/coach/library/`, `src/features/coach/builder/` (except the two stub files).
  - Depends on: M6, T5.6, T5.8, T6.8.

- [x] **T9.4 Workout exporters: .zwo, .mrc, .erg.** _New._
  - Why: coaches send workouts to trainers.
  - Acceptance:
    - Output follows `docs/spec/io.md` sections 3 to 5, with snapshot tests for a steady, an interval and a repeat-block workout.
    - `.mrc` and `.erg` are refused for non-power workouts with a reason.
  - Owns: `src/io/export/zwo.ts`, `mrc.ts`, `erg.ts`, their tests.
  - Depends on: T5.6.

- [x] **T9.5 FIT workout exporter.** _New._
  - Why: Garmin and Wahoo devices read FIT workouts.
  - Acceptance:
    - Output is built with `@garmin/fitsdk`, loaded only on export.
    - A test decodes the file again and checks the integrity check (CRC), the step count and the target values.
  - Owns: `src/io/export/fit.ts` and test.
  - Depends on: T5.6.

- [x] **T9.6 Calendar exporter (.ics).** _New._
  - Why: coaches and athletes want the plan in their calendar app.
  - Acceptance:
    - RFC 5545 output with `Asia/Kuala_Lumpur`, lines folded at 75 octets, escaped text, stable UIDs.
    - The description holds a step summary. A snapshot test covers one session and a full week.
  - Owns: `src/io/export/ics.ts` and test.
  - Depends on: T5.6.

- [x] **T9.7 Export menu and Add to calendar.** _Fills three stubs._
  - Why: ties exporters to screens (C11 and the flow in section 7.5).
  - Acceptance:
    - Builder Export menu downloads .zwo, .fit, .mrc and .erg with unsuitable formats disabled and the reason shown.
    - Add to calendar dialog picks athlete and day and copies the session into the plan.
    - Calendar can export the selected session or whole week as .ics.
    - Filenames are readable and contain no spaces.
  - Owns: `ExportSlot.tsx`, `AddToCalendarSlot.tsx`, `src/features/coach/calendar/CalendarExport.tsx`.
  - Depends on: T9.1, T9.3, T9.4, T9.5, T9.6.

**M9 ends with the milestone gate and a round-trip test: build, export, decode.**

---

## M10: Check-ins, flags, kudos, simulated AI, settings

- [ ] **T10.1 Check-ins page, flag inbox, flag and check-in detail.** _Replaces stub._
  - Why: C13, C14, C15.
  - Acceptance:
    - Team grid (athletes by 14 days, heatmap cells), flag inbox with open, acknowledged and resolved filters.
    - Flag detail shows the rule, values, explanation and baseline; opening acknowledges; resolving needs a note.
    - Check-in detail drawer shows the day's values against baseline plus the last 14 days.
    - Also fills `FlagDrawerSlot.tsx` on the athlete summary.
  - Owns: `src/features/coach/check-ins/`, `src/features/coach/athlete/FlagDrawerSlot.tsx`.
  - Depends on: M8 (T8.2), T5.4, T5.8, T6.5.

- [ ] **T10.2 Kudos.** _New._
  - Why: C16 and the athlete's kudos card.
  - Acceptance:
    - Popover composer from any "Send kudos" with an optional linked activity, a text field and a sent toast.
    - The athlete sees kudos on Today and on the activity. Sending kudos can earn the "coach kudos" badge.
  - Owns: `src/features/shared/kudos/`, `src/features/athlete/today/KudosSlot.tsx`, `src/features/coach/activity/KudosButtonSlot.tsx`.
  - Depends on: T7.2, T8.4, T5.5.

- [ ] **T10.3 AI consent and simulated output engine.** _New._
  - Why: AI is opt-in on two layers and off by default.
  - Acceptance:
    - `consent.ts` returns active only when athlete and coach both consent. Coach cannot enable AI for an athlete.
    - `simulate.ts` produces template text for the weekly recap, check-in summary and suggest-next-week change set, deterministically from data.
    - Every output carries the label "Simulated AI - prototype" and the model the MVP would use (`claude-haiku-5-5` for summaries, `claude-sonnet-5-5` for plan proposals).
    - Athlete consent sheet (A9) in `AiSection.tsx` and coach consent dialog (C20) are built here. The athlete states match section 7.6 of the flow.
  - Owns: `src/ai/`, `src/features/athlete/me/AiSection.tsx`, `src/features/coach/settings/AiConsentDialog.tsx`.
  - Depends on: T7.8, T5.8, T6.2.

- [ ] **T10.4 Coach settings page.** _Replaces stub._
  - Why: C18.
  - Acceptance:
    - Units, theme, keyboard help link, the athlete consent table (active, waiting for athlete) with the coach toggle that opens the consent dialog, and the reset link.
  - Owns: `src/features/coach/settings/` (except `AiConsentDialog.tsx`).
  - Depends on: M6, T5.8.

- [ ] **T10.5 AI panels on athlete and coach screens.** _Fills slots._
  - Why: shows what AI would do, only when consent is active.
  - Acceptance:
    - Weekly recap on Week, check-in summary on the check-in detail drawer, "Suggest next week" drawer (C5) listing changes the coach accepts or rejects one by one, then applies with Undo.
    - Nothing renders when consent is not active. Flags are untouched.
  - Owns: `src/features/coach/calendar/SuggestSlot.tsx`, `src/features/shared/ai-panels/`.
  - Depends on: T10.3, T9.1, T10.1.

- [ ] **T10.6 Seed and flow coverage test.** _Test task._
  - Why: the demo script depends on specific seeded cases.
  - Acceptance:
    - An integration test walks the flows of sections 7.1 to 7.6 against the store without a browser and passes.
    - The seed has at least one open flag, one missing check-in and one kudos-eligible activity.
  - Owns: `src/features/__flows__/`.
  - Depends on: M7, M8, M9, T10.1 to T10.4.

**M10 ends with the milestone gate and a full coach walk-through.**

---

## M11: QA and polish

Reviews in G11a only read and write notes. Fixes happen in G11b, one at a time, because they touch many files.

- [ ] **T11.1 Automated audit.** Run `npx impeccable detect` on `src` and on the preview URL, `impeccable audit`, and the bundle budget check. Acceptance: zero high-severity findings are left open; findings are written to `docs/qa/parts/automated.md`. Owns: that file.
- [ ] **T11.2 Athlete screenshot QA.** At 390 by 844, with a spot check at 768. Check every athlete route and sheet for Amir, Danial and Irfan against `DESIGN.md`. Owns: `docs/qa/parts/athlete.md`.
- [ ] **T11.3 Coach screenshot QA.** At 1440 by 900, with a spot check at 768. Run the dashboard-design sign-off on Overview, Athlete summary and Analytics. Owns: `docs/qa/parts/coach.md`.
- [ ] **T11.4 Keyboard, zoom, motion, contrast.** Keyboard only through both flows; 200% zoom; reduced motion; colour-blind simulation on the status chips and the lap. Also run web-design-guidelines and design-review. Owns: `docs/qa/parts/accessibility.md`.
- [ ] **T11.5 PWA and rename safety.** Install check, reload with the network off, `dist` served under another base path, shortcuts open the right sheet. Owns: `docs/qa/parts/pwa.md`.
- [ ] **T11.6 Fix pass.** Work through every open finding by severity. Acceptance: each finding in `docs/qa/parts/*.md` is marked fixed, deferred with a reason, or rejected with a reason; the milestone gate is green. Owns: any source file a fix needs. Depends on: T11.1 to T11.5.
- [ ] **T11.7 QA report.** Merge the parts into `docs/qa/report.md` with a pass table per route and viewport. Re-run the screenshot checks for fixed items. Owns: `docs/qa/report.md`. Depends on: T11.6.

**M11 ends with the milestone gate and a signed-off QA report.**

---

## M12: Release

- [ ] **T12.1 README and demo script.** _Modifies README._ Overview, live link, a five-minute demo script following sections 7.1 to 7.6, dev commands, the all-rights-reserved notice and a note that the prototype is fictional data. Acceptance: following the script on the live site reaches each step without a dead end. Owns: `README.md`, `THIRD_PARTY_NOTICES.md` (refreshed from `package.json`).
- [ ] **T12.2 Live-site check.** In the built-in browser at `https://kidriqrif.github.io/laree/` (or whichever URL Pages serves): deep links reload, no console errors, role switch and reset work, the manifest loads. Findings are fixed before tagging. Owns: `docs/qa/live-check.md`.
- [ ] **T12.3 Tag `v0.1.0-prototype`.** Acceptance: the tag points at a commit whose Pages deploy succeeded, and the push of commit and tag is done without asking. Owns: git tag only. Depends on: T12.1, T12.2.

---

## Open items for the owner

- Turn on GitHub Pages (Settings, Pages, Source: GitHub Actions) when T4.3 starts.
- Sign in to Git Credential Manager at the first push if not done yet.
- Tagline: decided in November 2026. It is "Every lane counts."
- After release, the repo rename is safe because of the base-path check in T4.3 and T11.5.
