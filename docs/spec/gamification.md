# Gamification

Build spec for `src/domain/gamification.ts`: the weekly streak, badges, the track lap and coach kudos. Compliance comes from [metrics](metrics.md) section 7 and is never recomputed here. The module is pure: the same stored items always give the same streak, badges and lap.

Related: [metrics](metrics.md), [check-ins and flags](checkins-flags.md), [screen inventory](../ia/screen-inventory.md) (Today, Week, Progress, badge moment A10, kudos composer C16) and the [design brief](../brief/design-brief.md).

**Contents:** 1. Principles · 2. Inputs and stored state · 3. The weekly streak · 4. Badges · 5. The track lap · 6. Coach kudos · 7. Guardrails against overtraining · 8. Test cases

## 1. Principles

1. **Earned, not gimmicky.** Every reward points to something real: a week carried out, a first brick, a new FTP. Nothing rewards opening the app. There are no points, levels or coins.
2. **Capped at the plan.** A session's credit stops at 100%, and distance badges count only planned distance. Doing more never earns more. Going over the plan shows a caution, never a reward.
3. **Rest days count.** A kept rest day is worth one seventh of the week. The streak counts weeks, not days.
4. **No shaming.** No copy says "you broke your streak", "don't lose it" or "at risk". Missed sessions look neutral.
5. **Quiet celebration.** One badge moment at a time, and a finish tape that breaks once. No confetti, sound, vibration or notifications.
6. **Rules, not AI.** Only the rules below award anything. AI never awards or removes a reward.

## 2. Inputs and stored state

The module works on one athlete at a time. It reads stored items and the outputs of `metrics.ts`: matches with `pct` and band, kept rest days and weekly compliance (WC). It stores nothing it computes.

```ts
interface GamificationInput {
  athleteId: string; today: number;          // day offset
  planned: PlannedWorkout[]; activities: Activity[];
  matches: Match[];                          // metrics.ts: plannedId, activityId, pct, band
  checkIns: CheckIn[]; kudos: Kudos[]; thresholds: ThresholdRow[];
  races: Race[]; phases: Phase[]; excuses: WeekExcuse[];
}
streak(input): StreakResult;   badges(input): BadgeAward[];
lap(input, week): LapState;    lapText(lap): { short: string; full: string[] };

interface WeekExcuse {                       // new stored item, set by Coach only
  athleteId: string; week: number;           // 1 = first history week
  reason: 'ill' | 'injured' | 'life';
  note: string;                              // up to 140 characters, coach side only
  day: number;                               // the day it was set
}
type BadgeSeen = Record<string, string[]>;   // stored: athleteId -> award ids already shown
```

## 3. The weekly streak

The streak counts weeks in a row with WC of 80% or better. WC (metrics.md 7.4) includes rest days and caps each session's credit at 100%.

### 3.1 Week status

| Week | Status | Effect on the streak |
|---|---|---|
| Ended, no planned workouts | No plan | Pauses it |
| Ended, excused by Coach | Excused | Pauses it, whatever its WC |
| Ended, `roundHalfAway(WC, 1)` ≥ 80.0 | Counted | Adds 1 |
| Ended, below 80.0 | Below 80% | Ends it; the next counted week starts a new one |
| The current week | In progress | None until it ends |

Checks run top to bottom. A week ends at local midnight after its Sunday. In the prototype, weeks 1 to 16 are scored and week 17 is in progress.

```ts
let current = 0, best = 0;
for (let w = 1; w < weekOf(today); w++) {
  const s = status(w);
  if (s === 'counted') { current += 1; best = Math.max(best, current); }
  else if (s === 'below') current = 0;
  // 'excused' and 'noPlan' leave current as it is
}
```

`StreakResult` holds `current`, `best`, each scored week's status and WC, and `soFar`: the current week's WC so far (metrics.md 7.4), or null before anything is due.

### 3.2 Rest days and recovery weeks

Rest days carry real weight. Take a week of three 60-load sessions and four rest days. Missing a whole session scores (3/7) × (120/180) + 4/7 = 85.7%, so the week counts. Doing every session and training on two rest days scores 5/7 = 71.4%, so it does not.

A recovery week counts like any other week. It is scored against its own smaller plan, so doing it as planned scores 100%, and its extra rest days carry more of the score. It is never skipped, doubled or given away. A week with no planned workouts, such as a rest week after a race, has no WC. It pauses the streak and never breaks it.

### 3.3 Excused weeks

Coach can excuse a week for illness, injury or life. An excused week pauses the streak: it cannot end it and cannot add to it. So training through an illness never earns streak credit.

- **Where.** "Excuse this week" in the week header of the coach calendar, with Ill, Injured or Life and an optional note. "Remove excuse" undoes it. Only ended weeks and the current week can be excused.
- **Prompt.** A week with 2 or more check-ins marked ill or injured shows "Danial reported ill on 4 days this week. Excuse it?" Nothing is excused automatically.
- **Athlete view.** "Excused by Coach. Your streak waited." The reason and the note stay on the coach side. Coach still sees the week's WC.

### 3.4 Streak copy

| Situation | Copy |
|---|---|
| Streak of 1 or more | "Streak: 5 weeks" ("1 week"), with "Best: 9 weeks" |
| Streak of 0 | "This week can start a new streak.", with the best |
| Current week | "So far: 86%. A week counts at 80% or better." |
| Past week | "Counted towards your streak", or "79% this week" in the normal text colour |
| Excused or no plan | "Excused by Coach. Your streak waited." / "No plan. Your streak waited." |
| A rest day on Today | "Rest days count towards your streak." |

Never use "You broke your streak", "Don't lose your streak", "Streak at risk", countdowns to Sunday, flame icons or red on the streak. While the athlete's latest check-in says ill or injured, Today and Week hide the streak lines.

## 4. Badges

### 4.1 How awards work

- **Derived.** `badges(input)` returns every award from day 0 to `today`, in earned-day order. Week badges look only at ended weeks.
- **Id.** `{athleteId}:{key}`. Repeating badges add `:{kind}:{effectiveFromDay}` (new threshold) or `:{raceId}` (race finisher).
- **Earned day.** The day the rule first became true: the day a weekly total crossed the line, or the week's Sunday (day `7w − 1`) for week badges.
- **Source.** The activity, check-in, kudos, threshold row, race or week behind it. Progress links to it.
- **Edits.** Removing the qualifying item removes the award, silently. The MVP keeps each award in its `badges` table once derived.
- **Seen.** A reset puts every seeded award into `BadgeSeen`, so a fresh demo shows no badge moments.

### 4.2 Shared definitions

- **Credited distance:** 0 for an activity that matched no planned workout; the full distance when its workout is unmeasured; otherwise `distance × min(1, 100 / pct)`. A ride done at 150% of plan credits two thirds of its distance.
- **Weekly credited distance:** one sport, Monday to Sunday, compared as displayed: km to 1 decimal place for bike and run, whole metres for swim (metrics.md 9). Indoor rides and treadmill runs count.
- **Down week:** marked as a down week in its phase's weekly targets, or inside a `recovery` phase.
- **No caution:** the week's lap (section 5) ends the week without a caution.
- **Kept rest day:** as in metrics.md 7.4, a day with no planned workouts and 25 load or less.

### 4.3 Catalogue

| Badge | Key | Earned when | Repeats |
|---|---|---|---|
| First brick | `first-brick` | On one day, a ride of 30 min or more is followed by a run of 10 min or more that starts within 15 min of the ride's end (start minute plus elapsed time). Both are matched to planned workouts. | No |
| 100 km bike week | `bike-100` | Weekly credited bike distance reaches 100.0 km. | No |
| 50 km run week | `run-50` | Weekly credited run distance reaches 50.0 km. | No |
| 5 km swim week | `swim-5` | Weekly credited swim distance reaches 5,000 m. | No |
| New threshold | `new-threshold` | An FTP, threshold run pace or CSS beats every earlier value of its kind, compared as displayed (whole watts, whole seconds). The first value of each kind is the baseline and never counts. The effective day must be today or earlier. LTHR and resting heart rate never count. | Each new best |
| Coach kudos | `coach-kudos` | The athlete receives kudos from Coach for the first time. | No |
| Seven mornings | `check-in-7` | Check-ins on 7 days in a row. Any check-in counts, including one marked ill or injured. | No |
| Full lap | `full-lap` | An ended, unexcused week in which every planned workout is On plan (80.0 to 120.0) or unmeasured, every rest day is kept and there is no caution. | No |
| Easy lap | `easy-lap` | An ended, unexcused down week that counts towards the streak, with every rest day kept and no caution. | No |
| Comeback | `comeback` | After one or more weeks excused as ill or injured, the first later week that both counts towards the streak and has no caution. | No |
| Race finisher | `race-finisher` | On a race's day, the athlete's activities cover at least 80% of every leg: swim, bike and run for a triathlon, one leg otherwise. A leg Coach sets to 0 km, such as a cancelled swim, is skipped. | Each race |

Later full laps still show "Full lap" on their week's lap; only the first is a badge. The information architecture's "first 100 km week" is `bike-100`, and its "new FTP" is `new-threshold` of kind FTP.

### 4.4 Look and copy

Each badge is a race bib: a 4:3 card with a pin hole in each corner, a top band that holds a hand-drawn 24 px icon (2 px ink stroke, round caps) and a large face in Anybody, expanded italic. The band takes the sport colour for distance badges, infield for Full lap and Easy lap, and sun with ink for the rest.

| Badge | Face, then icon | Earned line |
|---|---|---|
| First brick | "T2"; a bike wheel and a running shoe joined by an arrow | "Your first brick: 1:30 on the bike, then 0:20 running." |
| 100 km bike week | "100"; a five-spoke wheel with a tick on the rim | "Your first 100 km bike week in Laree." |
| 50 km run week | "50"; a running shoe from the side | "Your first 50 km run week in Laree." |
| 5 km swim week | "5"; two wave lines under a lane rope | "Your first 5 km swim week in Laree." |
| New threshold | The new value ("255 W", "3:57", "1:46"); a line stepping up over a dashed level | Titled "New FTP", "New threshold pace" or "New CSS". "FTP up from 245 W to 255 W." |
| Coach kudos | A large whistle on a short cord | "Your first kudos from Coach.", then the message in quotes, if any |
| Seven mornings | "7"; a half sun on a horizon with three rays | "Seven check-ins in a row." |
| Full lap | A large track outline with a finish tick | "Every session on plan and every rest day kept." |
| Easy lap | A large track outline with a down chevron in the infield | "A recovery week done as planned, rest days and all." |
| Comeback | A large curved arrow turning back to a start line | "Back on plan after time off unwell." |
| Race finisher | "A", "B" or "C"; a finish tape broken in the middle | "Finished Tasik Olympic Tri." |

**Badge moment (A10).** When a log, check-in, kudos, threshold change or week end earns a badge, the next visit to Today shows one card at the top: "New badge", the name, the earned line and the date ("Sun 8 Nov"). A sun-yellow tape with ink edges crosses the bib and parts once, over 700 ms. With reduced motion it is already parted. "See your badges" opens Progress. "Close" shows the next queued award, ordered by earned day, then catalogue order. A card that has been shown is marked seen. A polite live region says "New badge: First brick." The card is not a dialog and does not take focus. The coach side has no badge moments.

Progress lists every award, newest first, with name, earned line and date. It shows no locked badges, no progress bars towards a badge and no "2 km to go" hints.

### 4.5 Seed targets

The seed must give exactly these awards by the start of week 17, and `gamification.test.ts` checks it. Down weeks are weeks 4, 8, 12 and 16 for all three athletes (3 weeks up, 1 down, from week 1). The seed excuses Danial's week 11 as ill. No seeded award falls in week 17.

| Badge | Amir | Danial | Irfan |
|---|---|---|---|
| 100 km bike week | Week 1 | – | Week 1 |
| 50 km run week | – | Week 1 | – |
| 5 km swim week | Week 2 | – | – |
| Seven mornings | Week 1 | Week 1 | Week 3 |
| Coach kudos | Week 6, on the first brick | Week 3 | – |
| Easy lap | Week 4 | Week 4 | Week 8 |
| First brick | Week 6 | – | – |
| New threshold | Week 9, FTP 245 → 255 W | – | – |
| Full lap | Week 10 | Week 7 | Week 14 |
| Comeback | – | Week 12 | – |
| Race finisher | – | – | – |
| **Awards** | **8** | **6** | **4** |
| **Weeks below 80%** | 5 and 13 | 2 (week 11 excused) | 6 and 15 |
| **Streak at week 17** | 3, best 7 | 13, best 13 | 1, best 8 |

- **Irfan's week 4** is a down week with about 135% of the planned bike load, ridden on training days. The lap showed its caution and the week still counted, but Easy lap waited until week 8. The screens get one overshoot to show.
- **Irfan has no seeded kudos,** which leaves one badge moment to show live: as Coach, send Irfan kudos, then switch to Irfan and open Today.
- **Danial's streak shows the pause:** weeks 3 to 10 and 12 to 16 make 13, with the excused week 11 between them.
- **No race falls in the history.** Race finisher first becomes possible at the Bukit Tinggi Hill Climb (Irfan, week +3).

## 5. The track lap

### 5.1 What it shows

One lap is the week's planned load, split into one lane per sport in the plan: swim, bike, run and strength, from the inside. A lane fills with the load done in its sport divided by the load planned for it, and stops at the finish line. A pace light in each lane marks where the plan expects the athlete to be by the end of today. As in a 400 m race run in lanes, the outer lanes start further round, so every lane runs the same distance: a full lane always means 100% of that sport's plan. Today shows the compact lap and Week the full one. The lap is athlete-only.

### 5.2 Numbers

For week `w` and each lane sport `s`:

| Value | Definition |
|---|---|
| `planned_s` | Planned load of the sport's workouts in the week |
| `done_s` | Load of all the sport's activities in the week up to today, matched or not, rest days included |
| `expected_s` | Planned load of the sport's workouts dated today or earlier |
| `pct_s` | `roundHalfAway(100 × done_s / planned_s, 1)` |
| `fill_s` | `min(pct_s, 100) / 100` |
| `light_s` | `expected_s / planned_s`, current week only |
| `over_s` | `pct_s > 120.0`, the edge of the Over band |

For the week, `lapPct = roundHalfAway(100 × Σ min(done_s, planned_s) / Σ planned_s, 1)` is the infield number, and `expectedPct` is the same ratio for `expected_s`. `totalPct` divides all activity load in the week, sports without a lane included, by `Σ planned_s`. `caution` is true when any lane is over or `totalPct > 120.0`.

A lane exists only when `planned_s > 0`. Sport `other` never gets a lane. Load in a sport without a lane counts in `totalPct` and is listed as "not in this week's plan". Percentages show as whole numbers, rounded away from 100 (metrics.md 7.3).

### 5.3 Geometry

| SVG units | Full (Week) | Compact (Today) |
|---|---|---|
| viewBox | `0 0 320 200` | `0 0 320 120` |
| Centre `cx, cy` | 160, 100 | 160, 60 |
| Straight `S` | 120 | 200 |
| Outer radius `R` | 96 | 56 |
| Lane width `w`, gap `g` | 12, 2 | 8, 2 |
| Pace light radius, ring | 5, 1.5 | 3.5, 1 |

With `N` lanes, lane `k` (1 = inside) has the centreline radius `r_k = R − (N − k)(w + g) − w/2`. With fewer lanes the infield grows. Each centreline is a closed path that starts on the finish line and runs anticlockwise, as athletes do:

```
M cx+S/2,cy+r  A r r 0 0 0 cx+S/2,cy−r  L cx−S/2,cy−r  A r r 0 0 0 cx−S/2,cy+r  Z
```

Its length is `P_k = 2S + 2π r_k`, and the lap length is `L = P_1`. Lane `k` starts `s_k = 2π (r_k − r_1)` along its path (the stagger) and runs to the finish line. To draw a fraction `f` of it, use `stroke-dasharray: f×L, P_k` and `stroke-dashoffset: −s_k`. Four lanes on the full preset give radii 48, 62, 76 and 90 and staggers 0, 88.0, 175.9 and 263.9.

### 5.4 Drawing, back to front

1. **Lane surface:** each lane's lap segment (`f = 1`) in paper-2 (DESIGN.md sets the dark value). The loop before a lane's start and the gaps between lanes stay background, like the lane lines in the logo.
2. **Start marks:** a 1.5-unit ink tick across each lane at `s_k`, square to the path.
3. **Fill:** `fill_s` in the sport colour token, butt caps, stroke width `w`.
4. **Over hatch:** on an over lane, ink lines at 45°, 1 unit wide and 4 apart, at 30% opacity, clipped to the fill.
5. **Finish line:** a 2-unit ink line at `x = cx + S/2` across all lanes.
6. **Pace light:** a sun disc with an ink ring on the centreline at `s_k + light_s × L`. It never blinks or pulses.
7. **Infield:** `lapPct` large ("62%"), then "of this week's plan" and, in the current week, "Plan by today 58%". The compact lap shows the number only.

Under the full lap, an HTML legend has one row per lane (swatch, sport, percentage), with the caution glyph and "More than planned" on an over lane. Sports without a lane follow, for example "Strength: not in this week's plan".

**Caution.** When `caution` is true, the caption under the lap reads "That's more than planned. Coach can see it.", beside the caution glyph in the status caution colour. The lane colour does not change, the fill stays at the finish line and nothing animates. Coach sees the same sessions as Over bands. The caution is information, not a flag.

### 5.5 States

| State | Lap |
|---|---|
| Current week | Fills, pace lights, infield number and "Plan by today" |
| Past week | Final fills, no lights. "Full lap" with a check glyph on a full-lap week; "Excused" on an excused week. |
| Future week | Empty lanes, no lights, "Planned" with the planned hours, for example "6:30 h" |
| No plan | The outer edge only, as a 1-unit hairline, and "No plan this week" |
| Rest day today | Unchanged lap; the rest-day card says "Rest days count towards your streak." |

### 5.6 Motion

After a save changes the lap, each changed fill moves from its old length to its new one over 600 ms, `cubic-bezier(0.2, 0.8, 0.2, 1)`. Nothing animates on a normal page load. With `prefers-reduced-motion`, fills jump to their end state.

### 5.7 Text version

The SVG is `aria-hidden`; the figure carries the text.

- **Short version,** the accessible name of the compact lap, also read by the polite live region after a save: `This week's lap: {lapPct}% of planned load done, plan by today {expectedPct}%. {Sport} {pct_s}%, {sport} {pct_s}%. {caution}`
- **Full version,** a visually hidden list under the full lap: one line per lane, `{Sport}: {pct_s}% of planned load, {done h:mm} of {planned h:mm}. Plan by today: {light_s}%.`, then `Rest days kept so far: {kept} of {ended}.` and `Weekly compliance so far: {soFar}%.`
- **Caution sentence:** `{Sport} is at {pct_s}% of plan. That's more than planned. Coach can see it.` For a sport without a lane: `{Sport} wasn't in this week's plan. That's more than planned. Coach can see it.`

Past and future weeks drop the "plan by today" parts. Example, Amir on a Wednesday: "This week's lap: 51% of planned load done, plan by today 53%. Swim 50%, bike 40%, run 70%."

## 6. Coach kudos

- **Who and what.** Only Coach sends kudos, to one athlete, on one activity or on the week as a whole. The message is optional, up to 140 characters of plain text (C16). Sending takes two clicks: "Send kudos", then "Send". Laree never sends kudos on its own.
- **Where from.** Overview's recent activities, the athlete summary, the coach activity page and the kudos panel on Check-ins, all with one composer.
- **Panel order.** The panel lists the last 7 days' activities: key sessions in the On plan band first, then the rest by date. Over and Well over sessions show their band and are never highlighted, so the list never steers praise towards doing more.
- **Praise restraint.** Kudos without an activity suit rest and good judgement: "Smart call taking Thursday off with that cold."
- **Athlete side.** The newest unseen kudos shows under "New from Coach" on Today, with its message and a link to its activity. Once shown it is marked seen, and Coach's sent list says "Seen". Each activity page keeps all its kudos.
- **Badge.** The first kudos earns Coach kudos. Later kudos earn nothing.
- **No counting.** No kudos totals, rankings or comparisons between athletes.
- **Data.** `Kudos { id, athleteId, activityId?, message?, day, seen }`. Sent kudos cannot be edited.

## 7. Guardrails against overtraining

| Risk | Guardrail |
|---|---|
| Extra sessions to fill a lane | Fills stop at the finish line. Above 120% the lap shows a caution. |
| Extra volume for a distance badge | Only planned distance counts, scaled back on over-plan sessions. Distance badges are firsts only; there is no "biggest week". |
| Training on rest days | A kept rest day is one seventh of WC. Training on two rest days can cost the week. |
| Training while ill to save the streak | Coach excuses the week, and an excused week never adds to the streak. |
| Rushing back after illness | Comeback needs a counted week with no caution. |
| Racing every easy day | No badges for single-session speed, power or pace. Personal bests are data on Progress. |
| Chasing a near miss | No locked badges, progress bars or "almost there" hints. |
| Daily pressure | Weeks, not days. No notifications, no countdowns. |
| Comparison between athletes | No leaderboards, shared totals or rankings. |
| Rewriting history | Deleting a missed session in an ended week asks Coach to confirm and offers "Excuse this week" instead. |

Sustained over-plan training also trips the rule-based flags for Ramp over 8 a week and Form below −30 (checkins-flags.md).

## 8. Test cases

All in `src/domain/gamification.test.ts`. WC values are full precision. Listed weeks have ended unless stated.

| Id | Input | Expected |
|---|---|---|
| S1 | WC 85, 90, 82 | Current 3, best 3 |
| S2 | WC 85, 79.94, 90 | 79.94 rounds to 79.9: current 1, best 1 |
| S3 | WC 85, 79.95, 90 | 79.95 rounds to 80.0: current 3 |
| S4 | WC 85, excused (WC 31), 88 | Current 2, best 2 |
| S5 | WC 85, excused (WC 95), 88 | Current 2; an excused week never adds |
| S6 | WC 85, no plan, 88 | Current 2 |
| S7 | Metrics 7.4 worked week, all done plus a 45 min run on Monday | WC 85.7, counted |
| S8 | The same week, extra training on both rest days | WC 71.4, streak ends |
| S9 | Down week of 3 × 60 load and 4 rest days, one session missed | WC 85.7, counted |
| S10 | Weeks 1 to 16 counted; week 17 so far 40% | Current 16; week 17 in progress |
| B1 | Rides planned by distance: 40, 35, 30 km on Tue, Thu, Sat, done exactly | `bike-100` on Saturday, source that ride |
| B2 | Rides planned 30, 30, 30 km; done 30, 30, 45 km (`pct` 150.0) | Credited 90.0 km, no award |
| B3 | One unplanned 110 km ride | Credited 0, no award |
| B4 | A 100 km planned ride done as 99.96 km; or 99.94 km | 100.0, award; 99.9, none |
| B5 | Matched swims of 2,400 and 2,600 m, `pct` 100 or less | `swim-5` on the second swim's day |
| B6 | Ride 07:00 to 08:30, run 08:40 for 20 min, both matched | `first-brick`, source the run |
| B7 | B6 with the run at 08:46; or a 9 min run; or a 29 min ride; or an unplanned run | No award each time |
| B8 | FTP rows 245 W (seed), then 255 W | One award: "FTP up from 245 W to 255 W." |
| B9 | FTP rows 245, 255, 250, 255; and 245, 255, 250, 260 | One award; two awards (255, 260) |
| B10 | Threshold pace 3:58 then 3:57 /km; CSS 1:48 then 1:48 | Award for pace; none for CSS |
| B11 | FTP 260 W effective tomorrow | No award until that day |
| B12 | Kudos on days 40 and 45 | `coach-kudos` on day 40 only |
| B13 | Check-ins on days 0 to 5 and 7 to 13, two marked ill | `check-in-7` on day 13 |
| B14 | Two weeks, every session On plan, rest days kept, no caution | `full-lap` once, on the first Sunday |
| B15 | B14 with one session at 79.9%; or at 120.1%; or an unplanned ride taking bike to 125% | No award each time |
| B16 | Down week, WC 85.7, rest days kept, no caution | `easy-lap` on its Sunday |
| B17 | B16 with the bike lane at 135% | No `easy-lap`; the week still counts |
| B18 | Week 11 excused (ill); week 12 WC 88, no caution | `comeback` on day 83 |
| B19 | Week 11 excused (ill); week 12 WC 75; week 13 WC 90, no caution | `comeback` on day 90 |
| B20 | Week 11 excused (life); week 12 WC 90 | No `comeback` |
| B21 | Olympic tri 1.5 / 40 / 10 km; swim 1.45, bike 40.3, run 9.9 km | `race-finisher` |
| B22 | B21 with a 1.10 km swim; then with the swim leg set to 0 km | None; award |
| B23 | Half marathon 21.1 km; run 16.8 km, or 16.9 km | None; award |
| B24 | `badges(seed)` at the start of week 17 | The table in 4.5 exactly; after a reset, every id is in `BadgeSeen` |
| L1 | Run planned 300, done 240 | `pct` 80.0, fill 0.8, no caution |
| L2 | Run planned 300, done 360; or 361 | 120.0, no caution; 120.3, caution; fill 1.0 both |
| L3 | Run 300 planned and done; unplanned bike load 70 | `totalPct` 123.3, caution, "Bike wasn't in this week's plan" |
| L4 | Run planned Mon 50, Wed 100, Sat 150; today Wednesday | `light` 0.5 |
| L5 | Swim 150 done of 100; run 150 done of 300 | `lapPct` 62.5, shown "62%"; swim over, caution |
| L6 | Full preset, 4 lanes | Radii 48, 62, 76, 90; staggers 0, 88.0, 175.9, 263.9; `L` 541.6 |
| L7 | Swim 60 of 120, bike 120 of 300, run 140 of 200; expected 60, 150, 120 | The 5.7 example, word for word |
