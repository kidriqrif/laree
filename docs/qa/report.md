# QA report (M11)

Laree prototype, `agent-staging` after the M11 fix pass, 13 November 2026. The detail for each area is in `docs/qa/parts/`; this page sums them up.

## Result

The milestone gate is green: typecheck, lint (no errors), 1297 tests, build, manifest, base path, bundle budget (Today 155.9 KB of 160 KB) and the design detector.

| Area | Part | Fixed | Partial | Deferred | Rejected |
|---|---|---|---|---|---|
| Automated audit | [automated.md](parts/automated.md) | 2 | 0 | 2 | 1 |
| Athlete screens | [athlete.md](parts/athlete.md) | 18 | 0 | 4 | 0 |
| Coach screens | [coach.md](parts/coach.md) | 23 | 2 | 2 | 0 |
| Keyboard, zoom, motion, contrast | [accessibility.md](parts/accessibility.md) | 20 | 0 | 2 | 0 |
| PWA and rename safety | [pwa.md](parts/pwa.md) | 0 | 0 | 2 | 0 |
| Data and AI consent (code review) | Below | 4 | 0 | 0 | 0 |
| **Total** | | **67** | **2** | **12** | **1** |

Every high-severity finding is fixed. Counts are per table row; a row can carry two IDs that named the same problem.

## Pass tables

| Screen | Phone (375 and 320) | Desk (1440) |
|---|---|---|
| Role picker | Pass | Not in scope |
| Athlete: Today, Week, Progress, Me | Pass | Not in scope |
| Athlete: Log and Check-in sheets | Pass | Not in scope |
| Athlete: Workout and Activity detail | Pass | Not in scope |
| Coach: Overview, Season, Builder, Analytics, Settings | Pass (read-only on touch) | Pass |
| Coach: Athlete page, Calendar, Library, Check-ins | Pass after the phone overflow fix | Pass |

The per-screen tables, with the 768 and 800 checks, are in `athlete.md` and `coach.md`.

## Data and AI consent

These came from code review of the AI consent work and were fixed in this milestone.

| ID | Finding | Outcome |
|---|---|---|
| R1 | When both saves failed, the coach consent dialog gave no way forward. | **Fixed.** It offers "Try saving again". |
| R2 | One owner's successful save cleared another owner's unsaved warning. | **Fixed.** Unsaved withdrawals are tracked per owner, so a screen warns only about its own choice. |
| R4 | `docs/spec/ai.md` contradicted itself on whether names are sent. | **Fixed.** The spec matches the disclosure. |
| R5 | If both saves failed, a reload could bring back the earlier saved state with AI consent on. | **Fixed.** A withdrawal note, kept in local storage or else session storage, wins over the saved state on reload. A note only in session storage still warns, because closing the browser drops it. |

## Deferred, with reasons

| ID | What | Why |
|---|---|---|
| B2, B3 | Seed generator and flag engine load on first paint. | Budget met; both are replaced by the MVP data layer. |
| A-04 | Progress Fitness chart: no table view, stops at today. | Needs the MVP's plan projection. |
| A-05 | No personal bests or threshold milestones. | Needs best efforts from real files. |
| A-11 | No Coach's note for the week on Today. | Not in the prototype data model. |
| A-14 | Role cards show no race line. | Prototype-only screen. |
| F9 | Analytics ranges differ from IA C12. | Decide with real season lengths in the MVP. |
| F10 (part) | Athlete page: recent check-ins, time in zones, notes. | MVP. |
| F11 (part) | Overview: Last activity column, team activity with kudos. | MVP. |
| REV-3 | Kit compliance specimen uses the intensity ramp. | Reference screen only. |
| A9 | Three toast regions at one edge. | One queue with the MVP's notifications. |
| A10 | Short Season phases clip their names. | Full name is in the table and the label. |
| P1 | Relative `og:image`. | Absolute URL breaks rename safety. |
| P2 | Light-only manifest background. | Manifests take one colour. |

## Not verified this round

- 200% zoom, reduced motion and colour blindness were first passed on their rules alone. They have since been checked in the browser (T11.4b), which found and fixed ten zoom problems (Z1 to Z10 in [accessibility.md](parts/accessibility.md)).
- Offline reload and app install were not re-tested. Offline reload has since passed in the M12 check ([live-check.md](live-check.md)). Install needs a phone and the merged live site.
- Rejected: DET-1, the detector's stripe advisory on Analytics. The stripes are the "over plan" hatch, which carries meaning without colour.
