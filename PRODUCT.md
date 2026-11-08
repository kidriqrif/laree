# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Set in the phase 1 plan that the product owner approved: a React and TypeScript prototype built with Vite, installable as a PWA and hosted on GitHub Pages. It has no backend and runs on seeded mock data. A hash router and relative asset paths let it run under any base path. Exact versions are pinned in `package.json`. The MVP plans a Supabase backend and server-side calls to the Claude API (see `docs/roadmap/mvp.md`).

## Users

**Athletes.** In the first trial, three amateur endurance athletes in triathlon, road running and cycling, each coached one-to-one. They are the product owner's brothers. They use a phone around training: before a session to see what to do, and after it to log how it went (inferred). Their jobs are to know what to do today, to tell the coach how it went with little effort, to know whether they are on track, and to feel progress.

**Coach.** One coach, who is also the product owner, looks after all three athletes. The UI calls them "Coach". They plan and review on a laptop or desktop (inferred). Their jobs are to see load, compliance and wellness for every athlete at a glance, to spot who needs attention, to plan seasons around races, to build workouts and send them to devices, to act on check-ins and flags, and to give kudos.

The real trial members are referred to as they/them, because their pronouns are not recorded. Self-coached athletes, larger coaching groups and clubs are possible later audiences, but none is confirmed.

## Product Purpose

Laree is a training planner for triathlon, running and cycling. It gives athletes a light, fun mobile app that answers "what do I do today?", and it gives their coach a dense desktop tool that shows load, compliance and wellness for every athlete at once. It exists because training planners feel generic: too dense for athletes and too shallow for coaches. It also exists because a coach cannot see their athletes' Strava data through the Strava API.

Phase 1 delivers design docs, a brand kit and a clickable prototype on mock data. The phase 1 trial succeeds when an athlete logs a session in under 20 s and completes a check-in in under 15 s, and when the coach spots who needs attention within 10 s of opening Overview. The MVP adds accounts, sync and a database.

## Positioning

Laree's claim is a combination that neighbouring products do not offer together. The athlete's "race day" view and the coach's "results sheet" view show the same numbers from one data model. Data arrives without Strava: through activity files, a quick manual log and device sync, with Strava used only for outbound sharing. The numbers are honest: every load value states its method and confidence, flags come from published rules, and AI is opt-in and never raises a flag. Rewards are earned: streaks count weeks, rest days count towards them, and nothing rewards training beyond the plan.

## Operating Context

- Athletes record on watches and bike computers that write .FIT files, and many also post to Strava (inferred). Laree reads files, not Strava.
- Each day brings a morning check-in and a log after each session. The coach scans the group daily and plans weekly (inferred).
- A season is built around races by priority (A, B or C), phases (base, build, peak, taper, race and recovery) and the key sessions the coach marks.
- Workouts leave Laree as .zwo, .mrc, .erg and .fit files, and the plan leaves as an .ics calendar.
- The locale is en-MY: weeks start on Monday, the time zone is Asia/Kuala_Lumpur, units are metric and spelling is British. Training happens in Malaysian heat and humidity (inferred).
- In phase 1, the four trial members use the live prototype on their own devices, and nothing is shared between devices. The repo is `kidriqrif/laree` (renamed from `kidriqrif/strelo`), and the app works under any base path so a rename never needs a code change.

## Capabilities and Constraints

**Confirmed for the prototype.** Athletes get Today, Week, Progress and Me, with log and check-in sheets and detail pages for workouts and activities. The coach gets Overview, an athlete page, a drag-and-drop calendar, a season planner, a workout library and builder with export, analytics, check-ins with a flag inbox and kudos, and settings. Data comes in by file import (.FIT, .GPX and .TCX, recognised by content), a quick manual log and simulated device sync. A "Prototype · viewing as" switcher moves between Coach and each athlete, and a reset page restores the demo.

**Vocabulary.** These terms are used everywhere, in the UI and in the docs. `docs/spec/metrics.md` holds the formulas.

| Term | Meaning |
|---|---|
| Load | How hard one session was, as one number; one hour at threshold scores 100. It comes from the first data available, in this order: power, pace, swim pace, heart rate, session effort (RPE), duration. Each value carries its method and a confidence level. |
| Fitness | 42-day moving average of daily Load |
| Fatigue | 7-day moving average of daily Load |
| Form | Yesterday's Fitness minus yesterday's Fatigue |
| Ramp | 7-day change in Fitness |
| Weighted power | An average of power that gives hard surges extra weight, so it reflects the real cost of a ride better than plain average power |
| Intensity | Weighted power divided by FTP |
| Threshold | The athlete's sustainable limit in each sport: FTP for power, threshold pace for running, CSS for swimming and LTHR for heart rate |
| Compliance band | How a session compares with its plan: on plan (80 to 120% of plan), short, under, over, well over, missed or unplanned |
| Key session | A planned workout that the coach marks as one of the week's most important |
| Flag | A warning from a fixed rule table, shown with its rule, its values and an explanation |

**Constraints.**

- Strava's API only shows data to the athlete who owns it, so Strava is never the coach's data source. In the prototype, "Share to Strava" is disabled and says why.
- The UI never uses TrainingPeaks' trademarked metric names. `docs/spec/metrics.md` explains the equivalence once, in a footnote.
- Check-ins and heart data are health data, which Malaysia's Personal Data Protection Act 2010 (PDPA) treats as sensitive personal data. In phase 1 nothing leaves the browser: data sits under a prefixed, versioned storage key, and imported files are never uploaded.
- There is no backend in phase 1: no accounts, no sync and no database.
- AI is opt-in per user and off by default, with two consent layers (athlete and coach). The prototype shows only template output labelled "Simulated AI - prototype". The MVP plans `claude-haiku-5-5` for summaries and `claude-sonnet-5-5` for plan proposals, called from a server. Flags are always rule-based.
- All rights reserved. The code is not open source.

**Undecided.** The tagline ("Lap by lap." or "Every lane counts."), whether athletes see their own flags, who edits thresholds, a Bahasa Melayu interface, notifications, pricing, and the order of device integrations in the MVP.

## Brand Commitments

- **Name:** Laree, said la-REE, coined from the Malay "lari" (run). Never use "Lari lah" or "Jom lari" as taglines, because the apps "Lari La" and JomRun exist.
- **Logo and palette:** the L is drawn as a 400 m track corner with lane lines, followed by "aree", and the palette is called "hot track". Both are locked. `DESIGN.md` and `docs/brand/` hold the details.
- **Two registers, one token set:** the athlete side is very fun, dead easy to navigate and mobile-first. The coach side is a precision instrument for the desktop.
- **Crafted, not generic:** the product owner rejects a "vibecoded" look.
- **Voice:** plain English, short sentences, concrete numbers and British spelling. No hype words and no emoji.
- **Gamification:** earned, not gimmicky.

## Evidence on Hand

- The product owner's decisions from four Q&A rounds, recorded in the phase 1 plan, which is kept outside the repo.
- A repo scaffold, with dependencies pinned in `package.json`.
- Fictional mock athletes for the prototype: Amir (70.3 triathlon), Danial (marathon) and Irfan (gran fondo), described in `docs/brief/design-brief.md`.

There is no user research beyond the owner's answers, no real athlete data in the repo and no trial result yet. There are no testimonials, customers, press, benchmarks, pricing, partnerships or real AI output. Future work must not invent any of these.

## Product Principles

1. **Same numbers, two registers.** The athlete sees the sentence and the coach sees the table, but a value never differs between them.
2. **Earned, not gimmicky.** Celebrate what was done and never shame rest. Rewards stop at the plan.
3. **Rules flag, people decide.** Flags explain themselves. AI only proposes, and the coach accepts or rejects.
4. **Show the method.** Every estimate says how it was made and how sure it is.
5. **The athlete's data stays theirs.** Sharing and AI need consent, and in phase 1 nothing leaves the device.

## Accessibility & Inclusion

- The target is WCAG 2.2 level AA (inferred). Keyboard-only use, 200% zoom and reduced motion must pass on both sides.
- Colour is never the only signal: every status has a glyph or a label, and every chart has a text version.
- Athletes often use the app outdoors, in bright light and with one hand (inferred).
- Copy is plain English, and every metric is explained in words where it first appears.
- Rest days and illness are never shamed. Body weight is used only for power-to-weight figures and is never a goal (inferred).
