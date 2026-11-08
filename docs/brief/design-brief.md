# Design Brief: Laree, phase 1 prototype

Status: draft for milestone M1 (framing docs). Last updated 8 November 2026.

This brief follows the template of the design-brief skill. The interview step was skipped, because the product owner settled the decisions in four Q&A rounds. Those decisions are recorded in the phase 1 plan and are not reopened here. Where this brief decides something the plan does not settle, it says "(assumption)". The file lives in `docs/brief/` rather than the skill's default `.design/` folder, so later skills (information-architecture, brief-to-tasks and design-review) should read it from here.

Related documents: [PRODUCT.md](../../PRODUCT.md) (durable product truth), [DESIGN.md](../../DESIGN.md) (design system), [information architecture](../ia/information-architecture.md), [screen inventory](../ia/screen-inventory.md), [metrics](../spec/metrics.md), [gamification](../spec/gamification.md), [check-ins and flags](../spec/checkins-flags.md), [AI](../spec/ai.md), [import and export](../spec/io.md), [brand guide](../brand/brand-guide.md) and [MVP roadmap](../roadmap/mvp.md).

## Summary

Laree (said la-REE) is a training planner for triathlon, running and cycling. The name is coined from the Malay word "lari", which means run. This phase builds the design docs, the brand kit and a clickable prototype on mock data, hosted on GitHub Pages. There is no backend. The first trial group is one coach, who is also the product owner, and three athletes, who are the product owner's brothers.

One app serves two people with different needs. The athlete gets a fun, mobile-first app that answers "what do I do today?" at a glance. The coach gets a dense, keyboard-first desktop tool that shows load, compliance and wellness for every athlete at once. Both sides read the same numbers from the same data model, and both use one set of design tokens.

## Problem

### What athletes feel

Most training planners are built for coaches and then handed to athletes. An athlete opens the app after a long day and meets a calendar grid, a wall of charts and abbreviations borrowed from sports-science papers. The one thing they need, today's session, sits among twenty other things. Logging a session feels like filing a report, so they skip it. The morning check-in feels like a form, so they skip that too. Their coach then plans with half the picture.

Consumer fitness apps fail the other way. They are fun, but the fun is cheap: emoji streaks, confetti for opening the app and red warnings on rest days. A streak that punishes a rest day pushes people to train when they should recover. No coach wants that.

### What the coach feels

The coach in this trial looks after three athletes in three sports. Before the first coffee, they want to know whether anyone needs attention: who is overloaded, who is missing key sessions and who slept badly. Simple planners offer a calendar and a comment box, with no load maths at all. Serious analysis tools have the maths, but they hide it behind menus and abbreviations and are built for large rosters. Neither shows load, compliance and wellness for three people on one screen.

### The Strava data wall

Most amateur athletes record on a watch or a bike computer, and their sessions end up on Strava. It is natural to assume a coaching app can read them from there. It cannot. Strava's API only shows an activity to the athlete who owns it, so a coaching app cannot show an athlete's Strava data to their coach. The other routes are narrow too: Garmin's developer programme is paused, and Zwift works only with partners (see the [MVP roadmap](../roadmap/mvp.md)). A coaching tool has to bring data in another way.

### The opportunity

A planner that speaks two registers over one data model can serve both people without compromise: race-day energy for the athlete and results-sheet precision for the coach. Data comes in through the activity files that every device already writes (.FIT, .GPX and .TCX), through a quick manual log and, later, through direct device sync. The trial group is small and close at hand, so we can time real tasks with a stopwatch instead of guessing.

## Audiences and Jobs

Two audiences use Laree in this phase.

| | Athlete | Coach |
|---|---|---|
| In the trial | The product owner's three brothers: a triathlete, a road runner and a cyclist | The product owner, who coaches all three |
| In the mock data | Amir (70.3 triathlon), Danial (marathon) and Irfan (gran fondo), all fictional | Shown in the UI simply as "Coach" |
| Main device | A phone, held in one hand, often outdoors just after a session (assumption) | A laptop or desktop, for a morning scan and a weekly planning session (assumption) |
| First screen | Today | Overview |
| Register | Race day | Results sheet |

The real trial members are referred to as they/them, because their pronouns are not recorded here.

### Athlete jobs

1. **What do I do today?** When I wake up or get ready to train, I want to see today's session at a glance: the sport, how long, how hard and why. Then I can just go.
2. **Tell my coach how it went.** When I finish a session, I want to log it or drop in the file with a few taps, so my coach sees it without me writing a report.
3. **Check in.** Each morning, I want to report sleep, soreness and mood in seconds, plus resting heart rate and heart-rate variability if my watch gives them to me.
4. **Am I on track?** When I look at my week, I want a plain answer (ahead, on plan or behind) without reading a chart.
5. **Feel progress.** As the weeks build, I want to see that I am getting fitter and that my race is getting closer. I want the odd badge, but only one that means something.

### Coach jobs

1. **Who needs attention?** When I open Laree, I want one screen with load, compliance and wellness for all three athletes, with flags on top. Then I can act before a small problem becomes an injury or an illness.
2. **Is the load right?** When I review an athlete, I want their Fitness, Fatigue and Form over time, their volume against target and their recent sessions. I want to know how each number was worked out.
3. **Plan the season.** When I plan a block, I want to set races by priority (A, B or C), shape the phases (base, build, peak, taper, race and recovery), set weekly targets and move sessions around a calendar.
4. **Build and send workouts.** When I write a session, I want to build it from steps with clear targets and export it to the athlete's device or training app.
5. **Trust the flags.** When a flag appears, I want to see the rule, the values and a plain explanation, so I can decide what to do.
6. **Say well done.** When an athlete does something good, I want to send kudos in two clicks (assumption on the click count).

## Solution

Laree is one installable web app with two layouts.

The athlete opens it on **Today**. A race-bib card names today's session in big type: the sport, the duration and the effort, with the coach's note underneath. Below it sit two actions: log a session and check in. Both open as sheets over Today, so the athlete never loses their place. On a rest day, the card says so plainly and notes that rest counts towards the streak (assumption). **Week** shows the week as one lap of a running track. Each sport has a lane, and finished sessions fill their lane. A "pace light" shows where the plan expects the athlete to be by today. Going far past the plan shows a caution, not a reward. **Progress** shows Fitness in plain words, the weekly streak, earned badges and the countdown to the next race. **Me** holds thresholds, zones, settings and AI consent (assumption on the contents of Progress and Me). The bottom bar reads Today · Week · [+ Log] · Progress · Me.

The coach opens it on **Overview**: a results sheet with one row per athlete. Each row shows Form, Ramp, this week's Load against plan, compliance, the latest check-in and any open flags (assumption on the columns). From there the coach can open an athlete page (fitness chart, volume against target, flags and recent activities), a drag-and-drop calendar, a season planner, the workout library and builder, analytics, and the check-ins page (team grid, flag inbox and kudos). Everything works from the keyboard.

The prototype runs entirely in the browser on seeded mock data. A permanent "Prototype · viewing as" switcher lets anyone move between Coach and each athlete. A reset page puts the demo back to its starting state.

## Content and Mock Data

All people in the mock data are fictional. A fixed-seed generator produces 16 weeks of history and 12 weeks of plan for three athletes, so the same seed always gives the same data. History weeks are numbered 1 to 16, and the current week is week 17. When counting ahead, the current week is "week 0" and "+n" means n weeks after it. History follows a pattern of three weeks up and one week down, with about 85% compliance, so the data contains real misses.

| Athlete | Sport | A race | Other race | Thresholds | Story in the history |
|---|---|---|---|---|---|
| Amir | 70.3 triathlon | Teluk Half (1.9 km swim, 90 km bike, 21.1 km run), week +10 | B race: Tasik Olympic Tri (1.5 km swim, 40 km bike, 10 km run), week +4 | FTP 245 W, threshold run pace 4:25 /km, swim CSS 1:48 /100 m, LTHR 166, resting HR 48, HRV baseline 72 ms | First brick session in week 6. FTP rises to 255 W in week 9. |
| Danial | Marathon | Kota Marathon, week +12, goal 2:59 | B race: Bukit Half, week +6 | Threshold pace 3:58 /km, LTHR 173, resting HR 44, HRV baseline 88 ms | Sick week in week 11. |
| Irfan | Gran fondo | Cameron Gran Fondo (160 km, 2,400 m climbing), week +9 | C race: Bukit Tinggi Hill Climb, week +3 | FTP 280 W at 64 kg (4.4 W/kg), LTHR 168, resting HR 50, HRV baseline 65 ms | No special event beyond the normal misses. |

Dates are stored as day offsets from the runtime start, which is the Monday 16 weeks before the current week. The demo therefore always looks current. Only activity summaries are stored; detailed streams are generated when a screen needs them.

Real content in this phase is limited to the brand, the copy and the formulas. Every athlete, number and race in the mock data is placeholder content. Files that a trial athlete imports are real, but they stay in that athlete's browser.

## Goals and Non-goals

### Goals for this phase

1. **Prove the two registers.** The athlete side should feel like race day and the coach side should read like a results sheet. Both should still look like one product, built from one token set.
2. **Ship a working prototype.** It is clickable, runs on seeded mock data, installs as a PWA, works offline after the first visit and runs under any base path, because the repo will be renamed.
3. **Write the framing docs.** The brief, PRODUCT.md, information architecture, screen inventory, specs, brand guide, DESIGN.md and roadmap should be complete enough for the MVP build to start from them.
4. **Build an honest metrics engine.** Load, Fitness, Fatigue, Form, Ramp, compliance, zones and flags live in pure TypeScript with at least 90% test coverage. Every Load value carries its method and a confidence level.
5. **Handle real files.** The prototype imports .FIT, .GPX and .TCX files. It exports workouts as .zwo, .mrc, .erg and .fit, and the calendar as .ics.
6. **Run the trial tasks.** The four trial members can complete the task script below on their own devices, and we can time them.

### Non-goals for this phase

1. **No backend.** There are no accounts, no sign-in, no sync and no database. The coach and the athletes do not share data between devices.
2. **No live integrations.** Device sync is simulated. Strava appears only as an outbound "Share to Strava" button, which is disabled and says why.
3. **No real AI.** AI panels show template output labelled "Simulated AI - prototype". The MVP will call the Claude API from a server.
4. **No native apps.** The PWA is the app on every device.
5. **No business model.** Pricing, billing and multi-coach teams wait for a later phase (assumption).

## Success Criteria

The trial runs on the live prototype (assumption on the protocol). Each athlete uses their own phone and views the prototype as the mock athlete closest to their own sport. The coach uses their own laptop. A moderator gives each person a short task script, times each task with a stopwatch from the first tap or key press to the saved state, and notes every wrong turn. Repeatable tasks run twice and the second attempt counts, so we measure the design rather than first-time surprise. Tasks A3 and C1 count on the first attempt, because on a second try the person already knows the answer. With four people the results are directional: they tell us what to fix, not whether the product will succeed.

### Athlete tasks

| # | Task | Target | Pass rule |
|---|---|---|---|
| A1 | Log a session with the quick manual log, starting from Today | Under 20 s | Median of the three athletes |
| A2 | Complete the morning check-in | Under 15 s | Median of the three athletes |
| A3 | Say what today's session is (sport, duration and effort) after opening the app | Within 5 s, without scrolling (assumption) | 3 of 3 athletes |
| A4 | Say whether you are ahead of, on or behind plan this week, using Week | Within 10 s (assumption) | 3 of 3 answers correct |
| A5 | Import a .FIT file and open the matched activity | Under 30 s (assumption) | Median of the three athletes |
| A6 | Finish each task without a wrong turn | 4 of 5 tasks with no back-tracking (assumption) | Each athlete |

### Coach tasks

| # | Task | Target | Pass rule |
|---|---|---|---|
| C1 | Open Overview and name the athlete who needs attention, and why | Within 10 s of opening Overview | Right name and right reason |
| C2 | Move a planned session to another day on the calendar | Under 10 s, by mouse and by keyboard (assumption) | Both methods work |
| C3 | Build a five-step interval session from a blank workout and export it as .zwo | Under 2 minutes (assumption) | The file opens in a trainer app |
| C4 | Review last week for all three athletes: Load against plan, compliance and check-ins | Under 3 minutes (assumption) | The coach names one action per athlete |
| C5 | Explain why a flag fired, using only what the flag shows | No outside help | The flag shows the rule, the values and the explanation |

### Quality gates

These come from the phase plan and apply at every milestone.

- The athlete JavaScript stays at or under 160 KB gzipped.
- `npx impeccable detect src` reports no high-severity findings.
- The metrics engine has at least 90% test coverage and passes known-answer tests. For example, one hour at threshold gives a Load of 100.
- The app installs, reloads with the network off and survives a reload on any deep link.
- The built app still works when it is served under a different base path.
- Keyboard-only use, 200% zoom and reduced motion all pass on both registers.

## Experience Principles

1. **Same numbers, two registers.** The athlete sees the sentence and the coach sees the table. A value never differs between the two sides; only its presentation does. This resolves the tension between simplicity for athletes and depth for the coach.
2. **Earned, not gimmicky.** Laree celebrates what the athlete did and never shames what they did not do. Rewards are capped at the plan, so overshooting earns a caution, not a badge. Streaks count weeks, not days, and rest days count towards them. This resolves the tension between fun and healthy training.
3. **Rules flag, people decide.** Flags come from a fixed rule table and always show the rule, the values and an explanation. AI is opt-in, clearly labelled and only proposes; the coach accepts or rejects each change. Every Load value shows its method and confidence. This resolves the tension between automation and trust.

## The Two Registers

One token set serves both sides. The shell sets `data-register="athlete"` or `data-register="coach"`, and the components adapt.

| | Athlete: "race day" | Coach: "results sheet" |
|---|---|---|
| Feeling | Race morning: energy, colour and a clear start line | The results board after the race: calm, exact and complete |
| Reference viewport | 390 × 844 phone | 1440 × 900 desktop |
| Base text size | 17 px | 14 px |
| Display type | Anybody, expanded and italic | Anybody, condensed |
| Numbers | Big, in the display face (assumption) | Atkinson Hyperlegible Mono, tabular and right-aligned |
| Surfaces | Race-bib cards | Ruled sections with hairlines instead of cards |
| Hit areas | 44 px touch targets | 28 px table rows |
| Navigation | Bottom bar: Today · Week · [+ Log] · Progress · Me | Left rail, keyboard-first |
| Motion | Playful: the track lap fills and badges get a finish tape | Quiet: short state changes only (assumption) |
| One screen holds | One main idea | Many athletes and many numbers |
| Voice | Second person, warm and short: "Nice one. That's 4 of 5 sessions done." | Labels and values: "4/5 sessions · 92% of planned load" |

The registers share the palette, the icons, the spacing scale, the data model and the vocabulary. A coach who opens the athlete app sees the same Form value they saw on Overview.

## Aesthetic Direction

- **Philosophy: stadium print.** Laree borrows the graphic design that athletics already has: track markings, race bibs, results sheets and scoreboards. These things are painted and printed, and they exist to be read at a glance by tired people. The interface should feel as if it belongs in a stadium, not in a software template.
- **Tone.** For athletes: energetic, warm and encouraging, never preachy. For the coach: calm, exact and quietly confident.
- **Palette: "hot track".** Track red-orange, sunshine yellow and ink on warm off-white paper, with infield green for "on plan". The exact values and usage rules live in [DESIGN.md](../../DESIGN.md).
- **Type.** Anybody for display, Atkinson Hyperlegible Next for interface and body text, and Atkinson Hyperlegible Mono for data. Anybody's width axis is the switch between the two registers.

### Reference points

Each reference is a real object. The table says what Laree takes from it.

| Artefact | What it is | What Laree takes from it |
|---|---|---|
| Athletics track lanes and stagger lines | A 400 m track with painted lane lines. On the bends the outer lanes start further ahead: in a one-lap race, lane 8 starts about 53 m ahead of lane 1, yet every runner covers exactly 400 m. | The logo, where the L is a track corner with lane lines and a real stagger. The weekly track lap, with one lane per sport. Hairline lane lines as dividers. The idea behind the brand: every lane runs the same distance. |
| Race bibs with safety-pin holes | Tear-resistant paper numbers fixed with four safety pins, with a big number, a band with the race name and sometimes a tear-off tab | The athlete's race-bib cards: four pin holes at the corners, one big number, and a coloured band for the sport |
| Results sheets and timing printouts | Results pinned to a board after a race, and the narrow paper strips from the timing tent. They list position, bib, name, category, splits and time in ruled rows with fixed-width figures. | The coach register: ruled rows, hairlines, monospaced tabular figures, right-aligned times and rank order. Dense, but calm. |
| Stadium scoreboards | Big, high-contrast numerals that can be read from the far stand, and the lap board that counts down the laps to go | Big numbers on the athlete side, such as today's minutes and the weeks to race day. Ink on sunshine yellow for the loudest moments. |

### Anti-references

Laree should never look or behave like these.

- **Generic shadcn dashboards:** grey rounded cards with soft shadows, a row of four KPI boxes and one line chart.
- **Purple gradients,** gradient text and sparkle icons that signal "AI".
- **Glassmorphism:** frosted, blurred panels.
- **Glow and neon:** glowing edges, neon accents and dark "cyber sport" themes.
- **Emoji-heavy fitness apps:** fire-emoji streaks, confetti for everything and trophies for opening the app.
- **Streak-shaming:** "You broke your streak!", red alerts on rest days and guilt-trip notifications.
- **Stock fitness imagery:** photos of posed athletes and heartbeat-line clip art (assumption).

The phase plan also bans some fonts (Inter, Geist, Space Grotesk, DM Sans, Manrope, Poppins and Bricolage) and some libraries (Tailwind, shadcn and lucide). Styles are plain CSS Modules in `@layer`, and the 24 px icons are drawn by hand.

## Existing Patterns

The repo holds a fresh scaffold: Vite, React and TypeScript, with oxlint, vitest and a GitHub Pages deploy workflow that runs typecheck, lint, tests and build before it deploys. The app itself is a placeholder page. Vite builds with `base: './'`, and `index.html` already declares `lang="en-MY"`. The visual system is only starting, so this brief sets the starting vocabulary rather than extending an old one.

- **Typography:** the three font families are installed as self-hosted packages (`@fontsource-variable/anybody`, `@fontsource-variable/atkinson-hyperlegible-next` and `@fontsource-variable/atkinson-hyperlegible-mono`). They are wired into styles in milestone M3.
- **Colours:** a first draft of `src/styles/tokens.css` holds the "hot track" primitives, light and dark semantic colours, and the heat-ramp colours for intensity zones. It is still being refined, and DESIGN.md is the authority once it lands.
- **Spacing:** no scale exists yet. DESIGN.md defines it in M3.
- **Components:** none yet. The prototype builds its primitives on react-aria-components, its charts on d3-scale, d3-shape and d3-array drawn in plain SVG, and its state on zustand. All versions are pinned in `package.json`.

## Component Inventory

Every component is new in this phase. The building-block milestone (M6) shows each one on the `#/kit` page in both registers.

| Component | Register | Status | Notes |
|---|---|---|---|
| App shells | Both | New | Set `data-register` and hold the switcher |
| "Prototype · viewing as" switcher | Both | New | Always visible. Coach, Amir, Danial or Irfan, kept in app state, not in the URL |
| Role picker | Both | New | The `#/` route |
| Buttons, toggles, text and number fields, selects | Both | New | react-aria-components; the register sets the size |
| Sheet | Both | New | Bottom sheet on phones, side panel on wider screens (assumption) |
| Toast | Both | New | Saves, undo and the PWA update prompt |
| Icon set | Both | New | Hand-drawn at 24 px, including sport glyphs for swim, bike, run and strength |
| Status chip | Both | New | Compliance bands and flag states, each with a glyph and a label |
| Load readout | Both | New | Shows the value, its method and its confidence |
| Flag detail | Both | New | Rule, values, explanation and lifecycle state; a ruled entry on the coach side |
| Simulated AI panel | Both | New | Labelled "Simulated AI - prototype", names the MVP model, shows consent state |
| Brand board, UI kit, reset and not-found pages | Shared | New | `#/brand`, `#/kit`, `#/reset` and any unknown route |
| Bottom bar | Athlete | New | Today · Week · [+ Log] · Progress · Me |
| Race-bib card | Athlete | New | Today's session, race countdown and badges |
| Log sheet | Athlete | New | Quick manual log, file drop zone and simulated device sync |
| Check-in sheet | Athlete | New | Sleep, soreness and mood, plus optional resting heart rate and heart-rate variability |
| Track lap | Athlete | New | One lap per week, one lane per sport, a pace light, an overshoot caution and a text version |
| Workout and activity detail | Athlete | New | Step profile, summary metrics, compliance band and a disabled "Share to Strava" |
| Badge with finish tape | Athlete | New | Four badges in this phase |
| Left rail | Coach | New | Overview, Calendar, Season, Library, Analytics, Check-ins and Settings |
| Results-sheet table | Coach | New | react-aria table, sortable, with keyboard movement between cells |
| Fitness chart | Coach | New | Fitness, Fatigue and Form over time |
| Bullet, bars, heatmap, curve, zone bar and sparkline charts | Both | New | Shared chart kit; the athlete side uses fewer and simpler forms |
| Calendar with drag and drop | Coach | New | react-aria drag-and-drop grid list, with keyboard moves |
| Season planner | Coach | New | Races by priority and a multi-thumb phase slider |
| Workout builder | Coach | New | Step editor, repeat blocks, target picker, profile preview and export menu |
| Check-in grid, flag inbox and kudos composer | Coach | New | The `#/coach/check-ins` page |
| Change-set review | Coach | New | "Suggest next week": accept or reject each proposed change |

## Key Interactions

**Log a session.** The athlete taps + Log in the bottom bar, or the "Log a session" shortcut on the home-screen icon. The log sheet opens over Today (`#/athlete/today?sheet=log`). It offers three ways in: a quick log, a file import and a simulated device sync. The quick log starts with today's planned sport and duration filled in (assumption). A typical log is: confirm the sport, adjust the minutes, set the effort (RPE, 1 to 10) and save. On save, Laree matches the activity to the planned workout, works out its Load and says how it did so, for example "estimated from effort". The Today card turns to done, the track lap fills, and a toast offers Undo for 5 seconds (assumption).

**Import a file.** The athlete drops or picks a .FIT, .GPX or .TCX file. Laree recognises the format from the content, not the extension, and reads it in the browser. The file is never uploaded. The FIT reader loads only at this moment, which keeps the first load small. A summary appears for the athlete to confirm, with the matched planned workout.

**Morning check-in.** The check-in sheet opens from Today (`#/athlete/today?sheet=check-in`). One screen asks for hours slept, soreness and mood on short numbered scales, plus resting heart rate and heart-rate variability when the athlete has them. Wellness answers start blank, so they stay honest (assumption). Saving closes the sheet and says "Shared with Coach". In this phase athletes do not see flag labels (assumption, see open questions).

**Week and the track lap.** Week opens on the current week. Arrow buttons and swipes move to last week (`?w=-1`) and next week (`?w=1`). The track lap draws the week as one lap, with a lane for each sport. Completed training fills each lane from the start line. The pace light, a small marker on the lap, shows where the plan expects the athlete to be by the end of today. When a lane goes past 120% of its plan, it shows a caution mark instead of more fill (assumption: 120% matches the edge of the "on plan" compliance band). Screen readers get a sentence for each lane instead of the drawing.

**Earn a badge.** The catalogue in the gamification spec has eleven badges. Four lead it: first 100 km week, new FTP, first brick and coach kudos. When the athlete earns one, Today shows it with a finish tape that breaks once. With reduced motion, the tape is already broken. There is no sound and no confetti.

**Miss a session.** A missed session is marked "missed" in Week, with a glyph and a label in a neutral tone (assumption). Nothing on the athlete side scolds. The coach sees the miss in compliance, and missing two or more key sessions raises a flag.

**Scan Overview.** Overview lists the athletes in a results-sheet table. Athletes with open flags sort to the top (assumption). Each row shows the name, the next race and weeks to go, Form, Ramp, this week's Load against plan, compliance, the last check-in and open flags. Arrow keys move between rows and cells, and Enter opens the athlete page. The ? key opens a list of shortcuts (assumption).

**Move a session.** On the calendar, the coach drags a planned workout to another day. The week's load total and its target bar update while the card moves. Dropping saves the change, and a toast offers Undo. Keyboard users can pick up, move and drop a workout without a mouse.

**Shape a season.** Races carry a priority of A, B or C. A multi-thumb slider sets where each phase starts and ends. Weekly targets follow the phases, and the season view shows planned Load week by week next to the athlete's Fitness.

**Build a workout.** The coach builds a session from steps: warm-up, steady, interval, recovery, cool-down and repeat blocks. Each step has a duration or a distance, and a target as % FTP, % threshold pace, % LTHR, % CSS or RPE. A profile chart redraws as the steps change, and so do the planned duration, distance and Load. Export offers .zwo, .mrc, .erg and .fit files. The calendar exports .ics.

**Act on a flag.** Flags show in the flag inbox on the check-ins page, on the athlete page and as a mark on the Overview row. Each flag shows the rule ("resting heart rate 7 bpm above baseline"), the values ("56 bpm this morning, baseline 48 bpm") and a plain explanation. The rule table has eight rules in this phase, from resting heart rate to missed key sessions. The coach moves the flag through its lifecycle, as defined in the [check-ins and flags spec](../spec/checkins-flags.md).

**Send kudos.** From the check-ins page or any activity, the coach sends kudos with an optional short note. The athlete sees it on Today. The first kudos also earns the coach-kudos badge.

**Use simulated AI.** AI is off by default for everyone. It turns on only when both layers agree: the athlete opts in under Me, and the coach opts in under Settings. Panels then show template output labelled "Simulated AI - prototype", with the model the MVP would use: `claude-haiku-5-5` for weekly recaps and check-in summaries, and `claude-sonnet-5-5` for "Suggest next week". That feature shows a change set, and the coach accepts or rejects each change. Nothing reaches the plan until they do. AI never raises a flag.

**Share to Strava.** Activity pages show a "Share to Strava" button in a disabled state, with one line of explanation: sharing needs an account, and the prototype has none (assumption on the wording).

**Switch role and reset.** The "Prototype · viewing as" switcher stays on screen. Choosing an athlete opens their Today, and choosing Coach opens Overview (assumption). The reset page (`#/reset`) asks before it restores the seeded demo.

**Update the app.** When a new version is ready, a toast offers to reload. The app never reloads on its own.

## Responsive Behaviour

The athlete side is designed at 390 × 844 and the coach side at 1440 × 900. QA adds a spot check at 768 px.

| Width | Athlete | Coach |
|---|---|---|
| 320 to 767 px | The main layout: one column and the bottom bar | Readable, not the main target: Overview becomes a stacked list and the calendar a day list (assumption) |
| 768 to 1279 px | One centred column with a maximum width; the bottom bar stays (assumption) | The rail shrinks to icons with tooltips. Tables scroll sideways inside their frame, with the name column fixed (assumption) |
| 1280 px and up | Same as at 768 px | The full layout |

Some components change behaviour, not only size:

- **Sheet:** a bottom sheet on phones and a side panel from 768 px (assumption).
- **Calendar:** a week grid from 768 px and a list of days below it.
- **Coach tables:** a fixed first column and sideways scrolling below 1280 px.
- **Workout builder and season planner:** they work on small screens, but they are designed for a desk (assumption).

## Accessibility Requirements

The floor is WCAG 2.2 level AA (assumption: the plan names the checks, not the standard).

- **Contrast.** Body text needs 4.5:1, and large text and graphics need 3:1. Track red-orange reaches about 3.4:1 on the paper background, so it is used only for large type and graphics. Red text uses the darker track-ink, at about 5.5:1. Sunshine yellow always sits with ink, at about 11.5:1. Ink on paper is about 16.6:1.
- **Colour is never the only signal.** Sports have glyphs, compliance bands and flags have a glyph and a label, and intensity zones are labelled.
- **Keyboard.** Every action works from the keyboard, with a visible focus ring and a logical order. Each page has a skip link. Drag and drop has a keyboard alternative. Sheets hold focus while open and return it to their trigger when they close.
- **Screen readers.** Pages use real headings and landmarks, and tables use table markup. Each chart has a text summary, and the track lap has a full text version. Toasts and saves are announced through a polite live region.
- **Motion.** With `prefers-reduced-motion`, the track lap and the finish tape show their end state without animation. Nothing flashes more than three times a second.
- **Zoom and reflow.** Content survives 200% zoom. The athlete side reflows at 320 CSS px without sideways scrolling.
- **Target size.** Athlete controls are at least 44 px. Coach rows are 28 px, above the WCAG 2.2 minimum of 24 px.
- **Language.** The page language is en-MY. Copy is plain English, every metric is explained in words where it first appears, and every number carries its unit.
- **Forms.** Every field has a visible label, errors are written out in text, and nothing times out.

## Constraints

| Constraint | Where it comes from | What it means for the design |
|---|---|---|
| Strava shows data only to the athlete who owns it | Strava's API agreement | No "connect Strava" import. Strava appears only as an outbound "Share to Strava", disabled in the prototype with an explanation. Import copy explains why files are the way in. |
| Device programmes are restricted | Garmin's developer programme is paused; Zwift is partner-only | File import and simulated device sync now. The roadmap ranks the integrations. |
| Trademarked metric names | TrainingPeaks owns the names of several common metrics | The UI says Load, Fitness, Fatigue, Form, Ramp, Weighted power, Intensity and Threshold. The trademarked names appear only in one footnote of the metrics spec. |
| Health data and Malaysian law | The Personal Data Protection Act 2010 (PDPA) | Check-ins and heart data are health data, which the PDPA treats as sensitive personal data that needs explicit consent. In the prototype everything stays in the browser, files are read on the device and never uploaded, and there are no analytics (assumption). The MVP design is in the roadmap. |
| No backend in this phase | The phase plan | No accounts and no sharing between devices. Demo data lives in browser storage under the key `laree:v1`. The key is prefixed and versioned, because every GitHub Pages site on one account shares the same storage. |
| Any base path | The repo will be renamed | Hash routes, relative asset paths and a PWA scope of `./` |
| Bundle budget | The phase plan | Athlete JavaScript at or under 160 KB gzipped. The FIT library loads only when a file is imported or exported. |
| Fonts and libraries | The phase plan | OFL fonts, self-hosted. The banned fonts and libraries are listed under Anti-references. |
| Locale | The phase plan | en-MY, weeks start on Monday, time zone Asia/Kuala_Lumpur, metric units (km, m, W, bpm, deg C) and British spelling |
| Licence | The product owner | All rights reserved. Third-party licences are listed in THIRD_PARTY_NOTICES.md. |

## Risks

| Risk | What could happen | Mitigation |
|---|---|---|
| The registers drift apart | Two styles that feel like two products | One token set, a register switch on the shell, shared components with register variants, and the `#/kit` page showing both side by side |
| Fun tips into gimmick | Athletes stop trusting rewards, or chase them | Four badges only, no confetti, rewards capped at the plan |
| Gamification pushes overtraining | An athlete adds sessions to fill a lane | Overshoot shows a caution, not a reward. Streaks count weeks at 80% compliance or better, and rest days count. |
| The look slides towards generic AI output | The prototype looks "vibecoded" | Concrete artefact references, banned fonts and libraries, `impeccable detect` gates and a critique at each milestone |
| Brand colours read as status | Red-orange is mistaken for "bad"; colour-blind users miss states | A separate status palette, with a glyph and a label on every status |
| Estimated Load looks exact | The coach over-trusts a Load estimated from effort or duration | Method and confidence on every Load value |
| The mock data is too tidy | Trial users judge a world without misses | About 85% compliance, a sick week, an FTP rise and a first brick in the seed |
| The trial is small and friendly | Four family members are kind and few | Timed tasks and observed wrong turns count for more than opinions. Results are treated as directional. |
| The prototype is mistaken for a product | Someone relies on browser storage and loses data | The permanent "Prototype · viewing as" switcher, a reset page, and a note at import that data stays on this device |
| Simulated AI is mistaken for real AI | People judge the MVP on template text | Every panel says "Simulated AI - prototype" and names the model the MVP would use |
| Health data and the PDPA | A future build mishandles sensitive data | Nothing leaves the device in this phase; consent and storage are designed in the roadmap |
| A very new toolchain blocks the build | A dependency breaks during scaffold or build | Exact versions are pinned, with a fallback of one major version |

## Open Questions

Each question has a default for the prototype, so the build is not blocked.

1. **Which tagline?** The candidates are "Lap by lap." and "Every lane counts." "Lari lah" and "Jom lari" are ruled out, because the apps "Lari La" and JomRun exist. Default: the brand guide recommends one and the product owner confirms it.
2. **Should athletes see their own flags?** Default: flags are a coach tool. The athlete's check-in confirmation says what was shared (assumption).
3. **How does the trial run?** The coach is both the product owner and a participant, so someone else should time the coach's tasks. Default: one of the athletes moderates the coach session, and the coach moderates the athlete sessions (assumption).
4. **Who edits thresholds?** Default: the coach edits FTP, threshold pace, CSS and LTHR, and the athlete sees the history on Me (assumption).
5. **Should the MVP offer Bahasa Melayu?** Default: English only in this phase.
6. **Which notifications does the MVP need?** Default: none in this phase.
7. **Should heat and humidity count?** Malaysian training happens in heat. Default: show the temperature from an imported file when it is there, and change nothing else (assumption).
8. **How far does the dark theme go?** Settings offers a theme choice. Default: DESIGN.md defines the dark values, and QA checks both themes at the three QA widths.

## Out of Scope

These are not built in this phase:

- accounts, sign-in, sync, a database and sharing between devices (the MVP, described in the roadmap);
- live device sync, a real Strava connection and real AI calls;
- recording a session inside the app, such as GPS tracking;
- chat or comment threads; coach notes on workouts and kudos are the only messages from coach to athlete (assumption);
- push or email notifications;
- payments, pricing and teams with more than one coach;
- nutrition, sleep tracking beyond the check-in, and detailed strength programming;
- any interface language other than English.

This brief also does not specify the details that other documents own: exact tokens and component styling ([DESIGN.md](../../DESIGN.md)), the logo geometry ([logo construction](../brand/logo-construction.md)), the formulas ([metrics](../spec/metrics.md)), the flag thresholds and lifecycle ([check-ins and flags](../spec/checkins-flags.md)), the file formats ([import and export](../spec/io.md)) and each screen's states ([screen inventory](../ia/screen-inventory.md)).
