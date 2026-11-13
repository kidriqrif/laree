# Coach screen QA (T11.3)

Two passes on the production build:

1. **Review.** Reviewer agents walked every coach screen at 1440 × 900, with a spot check at 768, and ran the dashboard-design sign-off on Overview, the Athlete page and Analytics.
2. **Re-check after the fixes.** I checked each screen in the built-in browser at 1440, at 800 with a mouse, and at 375 with touch emulation.

## Pass table

| Screen | 1440 | 800, mouse | 375, touch |
|---|---|---|---|
| Overview | Pass: header reads "Ramp /wk"; no console errors | Not checked | Pass: fits |
| Athlete page | Pass: title names the athlete | Not checked | Pass after NEW-2 |
| Calendar | Pass | Pass: editable, 9 drag handles | Pass after NEW-2: totals table scrolls in its own box |
| Season | Pass. REV-1 was fixed after this check and is covered by tests. | Not checked | Pass: fits |
| Library | Pass | Not checked | Pass after NEW-2 |
| Builder | Pass | Not checked | Pass: fits |
| Analytics | Pass: the last week reads "Week of 9 Nov, so far: 71%"; plain polarisation caption | Not checked | Pass: fits |
| Check-ins | Pass | Not checked | Pass after NEW-2 |
| Settings | Pass | Not checked | Pass: fits |

The 800 px check confirms the read-only switch: it uses the Calendar, the screen with the most editing. At 375 with touch, coach screens are read-only by design. A narrow window with a mouse stays editable.

## Findings

| ID | Severity | Finding | Outcome |
|---|---|---|---|
| F1 | High | The compliance heatmap's Week row used thresholds that did not match its legend. | **Fixed.** Rows and legend share one status scale. |
| F2 | High | The Form band tints covered the whole Fitness chart and read as data. | **Fixed.** The chart is two panels: Fitness and Fatigue above, Form with its bands below. |
| F3 | High | Compliance cells used the intensity ramp, so "well over" was track red. | **Fixed.** The heatmap uses the status scale, with a hatch on "over" so colour is not the only cue. |
| F4 | Medium | The roster Flags column drew the same icon for Act, Watch and Info. | **Fixed.** Each severity has its own glyph. |
| F5 | Medium | Daily compliance cells had no accessible label. | **Fixed.** Each cell names its day, value and status. |
| F6 | Medium | Watch flags were marked only by a low-contrast yellow bar. | **Fixed.** |
| F7 | Medium | Coach tables and charts used 11 px text. | **Fixed.** 12 px minimum, in rem. |
| F8 | Medium | Overview and Analytics applied the Ramp caution differently. | **Fixed.** Same rule on both; the unit is shown as "/wk". |
| F9 | Medium | Analytics ranges (4, 8, 16 weeks and Plan) do not match IA C12 (6, 12 weeks or season). | **Deferred** to the MVP: the ranges need a decision with real season lengths. |
| F10 | Medium | The Athlete page is missing C2 items: recent check-ins, time in zones, notes. | **Partial.** Empty states fixed; the missing sections are deferred to the MVP. |
| F11 | Medium | Overview has no Last activity column and no team activity list with Send kudos. | **Partial.** The Ramp unit is fixed; the column and list are deferred to the MVP. |
| F12 | Medium | Weekly volume and Load bars drew the unfinished week as finished. | **Fixed.** This week reads "so far" and is left out of the target count. |
| F13 | Low | KPI tiles used the wrong radius and spacing for the coach register. | **Fixed.** |
| F14 | Low | Threshold history left-aligned its numbers. | **Fixed.** Numbers are right-aligned in monospace. |
| Q5 | Low | Calendar totals showed a zero duration as a number. | **Fixed.** |
| Q6 | Low | Calendar cards were cramped at 1440 with seven columns. | **Fixed.** |
| Q7 | Low | The Check-ins kudos list was ragged. | **Fixed.** |
| Q8 | Low | Library swim durations showed seconds. | **Fixed.** |
| Q9 | Medium | The Sleep heatmap made long nights hot and short nights pale. | **Fixed.** Short nights are the warning end. |
| Q10 | Low | The Polarisation tile gave a verdict next to a dash. | **Fixed.** It says what is missing instead. |
| Q11 | Low | A Settings link was below the target size. | **Fixed.** |
| Q12, A12 | Low | Detail screens shared one document title. | **Fixed.** Titles name the athlete or session. |
| Q13 | Low | Library row links were 20 px tall. | **Fixed.** Full-width rows, 28 px minimum. |
| REV-1 | Medium | Season's weekly Load chart drew future weeks as 0 against their target. | **Fixed.** This week and later weeks read "so far" and are left out of the target count. |
| REV-2 | Low | Analytics counted this week's compliance as final. | **Fixed.** It reads "so far" and stays out of the mean. |
| REV-3 | Low | The kit page's compliance specimen still uses the intensity ramp. | **Deferred:** the kit page is a reference screen, not part of a coach flow. |
| NEW-2 | Medium | At 375, Library, Check-ins, Calendar and the Athlete page were wider than the screen. | **Fixed.** Page grids have one shrinkable track; the Calendar totals table scrolls inside its own box. |
