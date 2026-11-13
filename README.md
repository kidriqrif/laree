# Laree

**Every lane counts.**

Training planner for triathlon, running and cycling.

*Laree* (la-REE) is a play on the Malay word *lari*, "run".

Laree is for a coach and the athletes they train one-to-one. Athletes get a simple phone app: today's session, a quick log, a morning check-in and a lap that fills as the week goes. The coach gets a data-dense desktop tool: the whole team at a glance, flags from check-ins, a calendar, season plans, a workout builder and file exports.

**Status:** prototype, to be tagged v0.1.0-prototype at release. A clickable prototype on fictional mock data, with no accounts and no backend. What you change is saved in this browser's localStorage until the week ends. Each Monday the demo starts again from a fresh seed. If the browser will not save, changes last only for this visit.

## Live site

**https://kidriqrif.github.io/laree/**

- Install it from the browser: Add to Home Screen on a phone, or Install on a desktop browser.
- After the first load it works offline.
- The site redeploys each time app changes are merged to `main`. Pushes that change only docs skip the deploy.

## Five-minute demo

The demo follows the key flows in [docs/ia/information-architecture.md](docs/ia/information-architecture.md) (section 7), in this order: role picker, athlete on a phone-sized window, coach on a wide window, AI last, then reset. Start from a fresh browser profile, or reset first at `#/reset`.

The seed holds 16 weeks of history and 12 weeks of plan for three fictional athletes, dated to the current week. What is planned today depends on the weekday.

| Athlete | Trains for | A race |
|---|---|---|
| Amir | 70.3 triathlon | Teluk Half: 1.9 km swim, 90 km bike, 21.1 km run, in 10 weeks |
| Danial | Marathon | Kota Marathon: 42.2 km, goal 2:59, in 12 weeks |
| Irfan | Gran fondo | Cameron Gran Fondo: 160 km, 2,400 m of climbing, in 9 weeks |

### Start (IA 7.7)

1. Open the live site. `#/` shows the role picker, "Who are you today?", with a bib card each for Coach, Amir, Danial and Irfan.
2. Make the window phone-sized (about 390 px wide), or open the site on a phone. Press Amir's card. You land on `#/athlete/today`, viewing as Amir. The bar at the top is the prototype switcher. Below 600 px it is one button, "Prototype · viewing as Amir", that opens a list of people. Beside it, a chevron button ("More" on wider screens; a screen reader calls it "Prototype menu") holds Role picker, Brand board, UI kit and Reset demo data.

### Athlete, on a phone-sized window (IA 7.1, 7.2)

3. Today shows Amir's session as a bib card, with "Key session" and "Coach's note" where the plan has them. Amir's key sessions are on Wednesday, Saturday and Sunday. Coach's notes are on Saturday and Sunday. Press the card. `#/athlete/workout/:id` lists the steps at Amir's own targets. "← Back" returns to Today. On a rest day Today shows a "Rest day" bib instead, and the raised "Log" button in the bottom bar still works.
4. Press "Log it" under the bib, or the raised "Log" button. The "Log a session" sheet opens at `#/athlete/today?sheet=log`, with today's session chosen under "Which session?". On a Monday, a rest day, there is no "Log it", and the raised "Log" opens with "Not planned" chosen.
5. Pick a method:
   - "Quick log": duration, distance (optional), effort from 1 to 10 and a note. The sheet shows the load estimate. Press "Save".
   - "Import file": drop a .FIT, .GPX or .TCX file, then press "Save". The file marks today's session done only if it is the same sport and from today. Otherwise it saves as its own activity. A file dated in the future, from before the 16 weeks of history, or already saved is refused.
   - "Sync device" (**simulated**): no watch is connected. "Sync now" makes a realistic session from the plan, and the toast says "(simulated)".
6. Back on Today the session shows as done, with its result band and its Load, and "See activity" replaces "Log it". On a rest day, or when the log does not match the plan, it shows as an unplanned row instead. The "This week" lap fills in. Press "This week" to open Week.
7. Press "Today" in the bottom bar. Then switch to Danial: press "Prototype · viewing as Amir" and choose Danial. Switching keeps the section you are on, so you stay on Today. The strip on Today reads "Morning check-in", with "Not today" and "Check in". On a Monday Danial has already checked in, so the strip shows his values and "Edit" instead.
8. Press "Check in" ("Edit" on a Monday). "How am I this morning?" opens at `#/athlete/today?sheet=check-in`. Set "Sleep last night", "Soreness" and "Mood". Resting heart rate and HRV come "From your watch (simulated)" and can be changed. Press "Submit" ("Update" on a Monday). A toast says "Shared with Coach", and the strip reads, for example, "Checked in. Sleep 7 h. Soreness 2. Mood 4."

### Coach, on a wide window (IA 7.3, 7.4, 7.5)

Widen the window to at least 1024 px. Narrower, the rail becomes a top bar with a "Sections" button, and on a narrow touch screen every coach screen is read-only. Press `/` for "Jump to" and `?` for the keyboard list. Settings can turn single-key shortcuts off; Ctrl shortcuts always work.

9. Choose Coach in the switcher. `#/coach/overview` opens. The status line counts open flags, missing check-ins and sessions today. "Team today" sorts by flags, so Irfan, with the most open flags (three on most days, two at the weekend), is first. "Needs attention" lists each flag.
10. Press `j` twice to reach Danial's row in "Team today" (the first press focuses Irfan), then Enter, or click the row. `#/coach/athlete/danial` opens. Under "Flags" is his soreness flag.
11. Press "Open flag". The drawer shows "The rule" and "Why it was raised". Opening an open flag acknowledges it, and a toast says "Flag acknowledged", with Undo.
12. Press `g` then `c`. `#/coach/calendar/danial` opens on this week. The subline gives the dates of the week, the phase and the weeks to Kota Marathon.
13. Move a session: drag it to another day, or focus its "Move" button (or the session, then `m`), choose a day with the arrow keys and press Enter. Escape cancels. A toast says "{session} moved to {day}.", with Undo. On a day that already has a session, a dialog offers "Cancel", "Keep both" and "Swap". Ctrl+Z also undoes. Sessions only move to today or later. Late in the week, press `.` for next week first.
14. Edit a session: click its title, or focus it and press `e`. Change "Duration" or the "Coach's note" and press "Save session". A toast says "Saved {title}.", with Undo.
15. Press `g` then `i`. `#/coach/check-ins` shows the "Last 14 days" grid and the "Flags" inbox. Move to Danial's flag with `j` or `k` and press `r`. Fill in "Resolution note (required)" and press "Resolve flag". A toast says "Flag resolved".
16. In the "Kudos" panel, press "Send kudos" beside one of Amir's recent activities. In "Kudos for Amir", add a "Message (optional)" and press "Send". A toast says "Kudos sent to Amir." To see it, switch to Amir: "New from Coach" shows once on Today, and "Kudos from Coach" stays on that activity. Then switch back to Coach.
17. Optional, season (IA 7.4): press `g` then `s` and choose Irfan. `#/coach/season/irfan` shows "Season for Irfan": the phase band with an "A" marker for Cameron Gran Fondo and a "C" marker for Bukit Tinggi Hill Climb, the "Phase lengths" slider, "Weekly Load against target", and the "Races" and "Weekly targets" tables. "Add race" opens the race dialog. To try "Fill from library", choose Danial: Irfan's plan is already full, so the fill finds almost nothing to add for him. Select weeks from this week on in "Weekly targets", press "Fill from library", then "Apply". A note says how many sessions were added, with "Undo" and "Open the calendar".
18. Build a workout: press `g` then `l` for `#/coach/library`, then `n` or "New workout". `#/coach/library/new` opens with a warm-up, a steady step and a cool-down, on Bike. Type a "Name", such as "Sweet spot 3 x 12". Press "Add repeat block" and set "Repeats". The "Workout profile" chart and "Totals" update.
19. The "Targets for …" panel shows each step at one athlete's targets: in watts for an athlete with an FTP, as a percentage for one without. It opens on the athlete you last viewed. Danial, a runner, has no FTP, so his stay in percentages. Under "Preview for athlete", press Amir, then Irfan, to compare Amir (FTP 255 W) with Irfan (FTP 280 W). Switching keeps your unsaved edits; only leaving the page asks first.
20. Press Ctrl+S. A toast says `Saved "Sweet spot 3 x 12".` and the address changes from `new` to the workout's id.
21. Press "Export". "Export for {athlete}" offers .zwo, .fit, .mrc and .erg, each with "Download". A format that does not fit the workout is disabled, with the reason.
22. Press "Add to calendar". "Athlete" starts on the one you previewed. Pick a "Day" and press "Add". A toast says "Added {workout} to {athlete}'s plan on {date}.", with Undo. In that athlete's calendar, "Export week (.ics)" saves the week as a calendar file.

### AI, last (IA 7.6)

AI is off for everyone by default. It runs for an athlete only once that athlete and Coach have both turned it on. All AI output in the prototype is **simulated** on the device and labelled "Simulated AI - prototype", with the model the MVP would use: `claude-haiku-5-5` for summaries and `claude-sonnet-5-5` for plan suggestions.

23. Switch to Amir and press "Me". Turn on the "AI summaries" switch. "Turn on AI summaries?" opens. Press "Turn on". Me now says "On for you. Coach hasn't turned AI on yet." Switch to Irfan, who opens on Me too, and do the same.
24. Switch to Coach. You return to the coach screen you left. Press `g` then `t`, or "Settings" in the rail. Under "AI consent", turn on the "Coach AI for the team" switch, then press "Turn on" in "Turn on AI features?". The table now reads "Active" for Amir and Irfan, and "Waiting for the athlete" for Danial.
25. Press `g` then `c` and choose Irfan, on this week. Press "Suggest next week". "Suggest next week for Irfan" lists two changes, each with "Accept" and "Reject". His open flags call for an easier week. Press "Accept" on at least one change, then "Apply 1 change" or "Apply 2 changes". The toast offers Undo. Nothing changes until Coach presses Apply. Amir's numbers sit inside the limits on most days, so his suggestion usually says "No changes suggested for next week."
26. Press `g` then `i`, and press one of Amir's check-ins in the "Last 14 days" grid. The check-in drawer shows a "Check-in summary" panel.
27. Switch to Amir, press "Week", then "Previous week". A "Weekly recap" panel shows under the past week. Turning either switch off removes every AI panel for Amir at once.

### Reset (IA 7.8)

28. Open the prototype menu ("More" in the switcher, or the chevron beside the picker on a narrow window) and choose "Reset demo data". Me, Settings and the role picker link to it too. `#/reset` lists "What goes" and "What comes back". Press "Reset demo data", then "Reset demo data" again in the dialog, or "Keep my changes" to back out. The page says "Demo data reset." with a "Choose who to view as" link, and the switcher is back to its first state.

## Run it locally

Needs Node 24 (see `.nvmrc`).

```sh
npm ci
npm run dev
```

| Script | What it does |
|---|---|
| `npm run dev` | Starts the Vite dev server with hot reload. |
| `npm run build` | Builds the app, service worker and manifest into `dist/`. |
| `npm run preview` | Serves `dist/` locally, to try the build, install and offline mode. |
| `npm run check` | Runs typecheck, lint and tests in turn. |
| `npm test` | Runs the Vitest suite once. |
| `npm run typecheck` | Type-checks with TypeScript, without writing files. |
| `npm run lint` | Lints with oxlint. |
| `npm run check:base` | Serves `dist/` under a different sub-path. Checks that index.html, the manifest, its icons and the service worker all load from there, and that no built file points at `/assets/`. Run after `build`. |
| `npm run check:manifest` | Checks the fields in `dist/manifest.webmanifest`. Run after `build`. |
| `npm run brand` | Rebuilds the logo SVGs in `brand/svg/` and `public/favicon.svg`, then the PNGs in `brand/png/`, and the app icons, `og.png` and `favicon.ico` in `public/`. It does not rebuild `favicon-16.png` or `favicon-32.png`. |

Every screen is a hash route, such as `#/athlete/today`, and the build uses a relative base (`./`). So the app works under any path or repo name, and a reload or deep link never needs a server rewrite.

## Where things are

| Path | What is there |
|---|---|
| `docs/` | Design brief, task list, information architecture and screen inventory, specs, brand guide and logo construction, MVP roadmap, QA reports and developer notes. |
| `brand/` | Logo source, SVG and PNG exports, and early explorations. |
| `src/app` | Router, role picker, prototype switcher, athlete and coach shells, keyboard layer and PWA wiring. |
| `src/features` | Screens, in `athlete/`, `coach/` and `shared/`. |
| `src/domain` | Training logic with no UI: load and fitness metrics, baselines and flags, plans, workout steps and rewards. |
| `src/data` | Seeded mock data, the store, selectors, saving to localStorage and migrations. |
| `src/charts` | Charts: the track lap, the Fitness chart, bars, bullet, best-effort curve, heatmap, zone bar and sparkline. |
| `src/io` | File import (.FIT, .GPX, .TCX) and export (.zwo, .fit, .mrc, .erg, .ics). |
| `src/ai` | AI consent rules and the simulated AI output. |
| `src/ui` | Shared components: core, form, data, overlay, icons and brand. |
| `src/styles` | Design tokens, base styles and the athlete and coach registers. |

Start with these:

- [PRODUCT.md](PRODUCT.md): who Laree is for, what it does and how it differs.
- [DESIGN.md](DESIGN.md): the visual system.
- [docs/qa/report.md](docs/qa/report.md): the QA report for this release.
- [docs/roadmap/mvp.md](docs/roadmap/mvp.md): what the MVP adds, such as accounts, sync and a database.
- [docs/spec/](docs/spec/): specs for metrics, check-ins and flags, rewards, AI, and file import and export.

## Data and privacy

- Every person, race and number in the demo is fictional.
- Nothing you enter leaves the device. There is no backend and no account. The site is static files on GitHub Pages, and the browser fetches only those files and app updates.
- The data lives in this browser's storage, under keys that start with `laree:`. Most of it is in localStorage. A few small notes go in sessionStorage.
- AI is off by default. The prototype never calls a model: it shows only simulated output, made on the device and labelled "Simulated AI - prototype".
- `#/reset` puts the seeded demo back and clears every change, AI consent included.

## Licence

Copyright (c) 2026 kidriqrif. All rights reserved. See [LICENSE](LICENSE).

Third-party licences are listed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
