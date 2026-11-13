# Athlete screen QA (T11.2)

Two passes on the production build:

1. **Review.** Reviewer agents walked every athlete route and sheet at 390 × 844, with a spot check at 768, as Amir, Danial and Irfan, against DESIGN.md and the screen inventory.
2. **Re-check after the fixes.** I measured each route in the built-in browser at 375 and 320 wide (touch emulation): page width, document title, and the items below.

## Pass table

| Screen | Review at 390 | Re-check at 375 and 320 | Spot check at 768 |
|---|---|---|---|
| Role picker (`#/`) | Findings A-10, A-14 | Pass: fits, title "Role picker · Laree" | Reviewed |
| Today | Findings A-01, A-11, Q14 | Pass: fits; nav labels 12 px; switcher 44 px; one polite live region | Reviewed |
| Week | Findings A-06, A-13, Q2 | Pass: fits; day headings are h2 | Reviewed |
| Progress | Findings A-02, A-04, A-05, A-07, Q3 | Pass after the badge shelf fix; this week's bar reads "so far" | Reviewed |
| Me | Finding M1 | Pass: fits | Reviewed |
| Log sheet | Finding R3 | Pass: sheet is 320 wide at 320 | Finding A-09 |
| Check-in sheet | No findings | Pass: sheet is 320 wide at 320 | Finding A-09 |
| Workout detail | No findings | Pass: fits; title names the session | Reviewed |
| Activity detail | No findings | Pass: fits; title names the session | Reviewed |
| Badge moment | Findings A-01, A-03 | Not re-measured: no unseen badge in the re-check data | Reviewed |

## Findings

| ID | Severity | Finding | Outcome |
|---|---|---|---|
| A-01 | High | The badge moment never appeared at the top of Today. | **Fixed.** Today loads the badge moment when a badge is unseen, and only then. "See your badges" is a secondary button, so the session bib's Log stays the one primary action. |
| A-02 | Medium | "Still to earn" listed badges from sports the athlete does not do. | **Fixed.** The shelf follows the athlete's sports. |
| A-03 | Medium | The finish-tape label failed contrast in dark mode. | **Fixed.** |
| A-04 | Medium | The Fitness chart has no "Show as table" and stops at today instead of race day. | **Deferred** to the MVP. The chart has a text summary for screen readers; the table view and the planned line need the plan projection the MVP adds. |
| A-05 | Medium | Progress has no personal bests or threshold milestones. | **Deferred** to the MVP: it needs best-effort data from real files. |
| A-06 | Medium | An unplanned future week said only "Coach hasn't planned this week yet." | **Fixed.** Open days from today on say "Not planned yet". |
| A-07 | Medium | Progress added its own side padding inside the shell gutter. | **Fixed.** The shell column sets the gutter, as on Today and Week. |
| A-08, A11 | Medium | Role switcher targets were 36 px on the phone. | **Fixed.** 44 px. |
| A-09 | Low | At 768 the sheets were wider than the athlete column. | **Fixed.** |
| A-10 | Low | The role picker's hover state lost its inner rules in dark mode. | **Fixed.** |
| A-11 | Low | Today has no "Coach's note for the week". | **Deferred** to the MVP: coach notes are not in the prototype data model. |
| A-12, A8 | Low | Bottom bar labels were 11 px. | **Fixed.** 12 px, the DESIGN.md minimum. |
| A-13 | Low | The Week heading was a 33 px line holding both the label and the dates. | **Fixed.** |
| A-14 | Low | Athlete role cards show no race and weeks-to-go line. | **Deferred:** the picker is a prototype-only screen. |
| M1 | Low | The Strava row printed the same words twice. | **Fixed.** |
| Q1 | Low | A flow test still expected the old session title format. | **Fixed.** |
| Q2 | Medium | Week headings skipped a level (h1 to h3). | **Fixed.** Day headings are h2. |
| Q3 | Low | Progress race-day copy overstated the trend. | **Fixed.** It now says "rises to" or "holds near". |
| Q14 | Low | The Today lap link drew its own focus ring. | **Fixed.** It uses the standard ring. |
| R3 | Medium | Closing the log sheet mid-read could still start the file worker. | **Fixed.** Closing the sheet cancels the read and ends the worker. |
| F12 (athlete) | Medium | Progress drew this week's hours as finished, against the full target. | **Fixed.** The bar reads "so far" and is left out of the target count. |
| NEW-1 | Medium | At 375 the badge shelf pushed its second column off the screen. | **Fixed.** Shelf tracks are at least 16 rem or the full width. |
