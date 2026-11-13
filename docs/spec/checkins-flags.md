# Check-ins and flags

This spec defines the daily check-in, the baselines worked out from it, the eight flag rules, the flag lifecycle, the coach's flag inbox and what athletes see. It is the build spec for `src/domain/flags.ts`, the check-in sheet and the `#/coach/check-ins` page.

Related documents: [metrics](metrics.md) (Load, Fitness, Fatigue, Form, Ramp and compliance bands), [AI](ai.md), [import and export](io.md), [screen inventory](../ia/screen-inventory.md), [design brief](../brief/design-brief.md) and the [MVP roadmap](../roadmap/mvp.md).

## Summary

- Each athlete checks in once a day, in under 15 seconds, on one screen.
- Baselines for heart-rate variability (HRV) and resting heart rate come from the athlete's own last 28 days.
- Eight fixed rules turn check-ins and training numbers into flags for the coach. The rules are published here, word for word.
- Every flag shows its rule, the values that tripped it and a plain explanation. The coach acknowledges and resolves flags in the flag inbox.
- Flags are always rule-based. AI never creates, changes or resolves a flag.
- Athletes never see flags. They see "Shared with Coach" after each check-in and, if the coach allows it, one gentle note on Today.

## Notation

| Symbol | Meaning |
|---|---|
| `d` | The day being evaluated, as a day offset from the runtime start. In the app this is today. |
| `weekStart(d)` | The Monday of the week that contains `d`. Weeks run Monday to Sunday. |
| `B(metric, e)` | The baseline for a metric, taken from the 28 days before day `e`. See [Baselines](#baselines). |
| `fitness(x)`, `fatigue(x)` | Fitness and Fatigue at the end of day `x`, as defined in [metrics](metrics.md). |
| `form(d)` | `fitness(d − 1) − fatigue(d − 1)`: yesterday's Fitness minus yesterday's Fatigue. |
| `ramp(x)` | `fitness(x) − fitness(x − 7)`: the 7-day change in Fitness. |
| "two days running" | Check-ins exist for both `d` and `d − 1`, and both meet the condition. A day without a check-in breaks the run. |

Times are local to Asia/Kuala_Lumpur. A check-in belongs to the local date on which it is saved.

## The daily check-in

### Fields

| Field | Key | Values | Required | Default | Notes |
|---|---|---|---|---|---|
| Sleep | `sleepHours` | 0 to 16 h in 0.5 h steps | Yes | Yesterday's value | Hours slept last night |
| Sleep quality | `sleepQuality` | 1 to 5 | Yes | Yesterday's value | 1 is very poor, 5 is great |
| Soreness | `soreness` | 1 to 5 | Yes | Yesterday's value | 1 is none, 5 is extremely sore |
| Mood | `mood` | 1 to 5 | Yes | Yesterday's value | 1 is very low, 5 is great |
| HRV | `hrvMs` | Whole ms, 10 to 250 | No | From the device | Overnight or waking reading |
| Resting heart rate | `restingHr` | Whole bpm, 30 to 120 | No | From the device | Waking reading |
| Ill or injured | `unwell` | Off, or on with a kind | Yes (off by default) | Yesterday's state | A switch |
| Kind | `unwell.kind` | `ill` or `injured` | When the switch is on | Yesterday's kind | Two large chips |
| Note | `unwell.note` | Text, up to 200 characters | No | Empty, never carried | "What's going on?" |

Every scale shows its numbers and the words at each end, so the meaning never depends on colour or position alone.

| Value | Sleep quality | Soreness | Mood |
|---|---|---|---|
| 1 | Very poor | None | Very low |
| 2 | Poor | Slight | Low |
| 3 | OK | Sore | OK |
| 4 | Good | Very sore | Good |
| 5 | Great | Extremely sore | Great |

For sleep quality and mood, higher is better. For soreness, higher is worse. The rules below use the raw numbers.

### Record shape

```ts
export type Scale = 1 | 2 | 3 | 4 | 5;

export interface CheckIn {
  athleteId: string;
  day: number;                    // day offset from the runtime start; one check-in per athlete per day
  sleepHours: number;             // 0–16, a multiple of 0.5
  sleepQuality: Scale;
  soreness: Scale;
  mood: Scale;
  hrvMs: number | null;           // whole ms, 10–250
  restingHr: number | null;       // whole bpm, 30–120
  sources: {
    hrvMs?: 'device' | 'manual';
    restingHr?: 'device' | 'manual';
  };
  unwell: null | { kind: 'ill' | 'injured'; note: string };
  carried: Array<'sleepHours' | 'sleepQuality' | 'soreness' | 'mood' | 'unwell'>;
                                  // fields saved exactly as pre-filled from yesterday, untouched
  savedAt: string;                // ISO 8601 with offset, e.g. "2026-11-08T06:42:10+08:00"
}
```

A save is an upsert on (`athleteId`, `day`). Saving again on the same day replaces the record.

### The 15-second check-in

The target, from the design brief, is a median under 15 seconds from tapping the Today card to the confirmation.

**Where it opens.** The check-in card on Today opens the sheet at `#/athlete/today?sheet=check-in`. The card shows until the athlete checks in, then collapses to one line: "Checked in · 7.5 h sleep · mood 4".

**One screen.** Everything fits on a 390 × 844 screen without scrolling, in this order:

1. Title "Morning check-in" and the date, for example "Sun 8 Nov".
2. **Sleep.** A stepper: a 56 px "−" button, the value in large type ("7.5 h"), a 56 px "+" button. Each tap moves 0.5 h. Holding a button repeats every 150 ms.
3. **Sleep quality.** Five 56 × 56 px buttons, 1 to 5, with 8 px gaps (312 px wide in all), and the end words underneath.
4. **Soreness.** The same row of five buttons.
5. **Mood.** The same row of five buttons.
6. **Heart.** One line: "HRV 74 ms · Resting HR 47 bpm", with the source underneath ("From watch (simulated)") and an Edit button that opens two number fields in place.
7. **Ill or injured.** A switch. Turning it on shows the "Ill" and "Injured" chips and the note field. This is the only case in which the sheet may scroll.
8. **Done.** One full-width button, 56 px tall, fixed to the bottom of the sheet. There is no Next, no Back and no confirmation step.

The selected scale button is filled with ink and labelled in paper colour. Unselected buttons are outlined. Selection never relies on colour alone: the selected button also gets a heavier outline and is announced as selected.

**Defaults.** Each row starts with the athlete's most recent answer, so a normal morning is "check, maybe change one thing, Done".

- The defaults come from yesterday's check-in. If there is none, they come from the latest check-in in the last 7 days. If there is none of those either, the rows start empty and Done stays disabled until the four required answers are given.
- A pre-filled row shows a small "Same as yesterday" tag. The tag disappears when the athlete touches the row, even if they pick the same value again.
- Fields saved with the tag still showing are listed in `carried`. The coach's grid marks them, so a value the athlete confirmed is not confused with one they skipped past. This keeps the answers honest without slowing the athlete down.
- If yesterday's check-in had the ill-or-injured switch on, it stays on and its label reads "Still ill?" or "Still injured?", so the athlete sees it and can switch it off. The note is never carried.
- HRV and resting heart rate are never carried from yesterday. They come only from the device or from typing.

**Timing budget.**

| Step | Time |
|---|---|
| Tap the card; the sheet opens with defaults and device values | 1 s |
| Read the sheet and change up to two answers | 6 to 8 s |
| Tap Done | 1 s |
| Total on a typical morning | about 10 s |

QA times five runs at 390 × 844. The median must be under 15 s when two answers change, and under 5 s when nothing changes.

**On Done.**

1. The values are checked (see below). If they pass, the check-in is saved.
2. The sheet closes and a toast says "Shared with Coach". It is announced through the polite live region.
3. The flag rules run for that athlete (see [When rules run](#when-rules-run)).
4. Today shows the collapsed check-in line and, if one applies, a gentle note (see [What athletes see](#what-athletes-see)).

Closing the sheet without Done (swipe down, the close button or Esc) saves nothing and asks nothing.

**Changing a check-in.** Reopening the sheet on the same day shows that day's saved values with no tags, and Done replaces them. Only today's check-in can be added or changed. A missed day stays empty. There is no back-filling, and a missed day is never shamed.

**Keyboard and screen readers.** Each scale is a radio group named after its question, for example "Soreness, 1 none to 5 extremely sore". Arrow keys move within a group, the number keys 1 to 5 set the focused group, Tab moves between rows, and Enter on Done saves. A screen reader hears the selected value with its word ("4, very sore") and, while it shows, the "same as yesterday" tag.

**Checks and error messages.** Sleep and the three scales cannot go out of range, because the controls do not allow it. Typed heart values are checked when the field loses focus:

| Problem | Message under the field |
|---|---|
| HRV outside 10 to 250 | "HRV is usually between 10 and 250 ms. Check the number, or clear it." |
| Resting HR outside 30 to 120 | "Resting heart rate is usually between 30 and 120 bpm. Check the number, or clear it." |
| Not a whole number | "Use whole numbers only." |

Done stays disabled while a message is showing.

**Device values in the prototype.** When the sheet opens, the simulated device sync supplies today's HRV and resting heart rate from the seed, labelled "From watch (simulated)", with `sources` set to `device`. Editing a value changes its source to `manual`. Clearing it leaves it empty, and the rules that need it skip that day. In the MVP, the values come from a connected device when one exists, or are typed in.

HRV from different devices is not comparable. Some report RMSSD and the Apple Watch reports SDNN. In the MVP, when the HRV source changes, the HRV baseline starts again from zero readings.

### What the coach sees

**Check-in grid** on `#/coach/check-ins`:

- One row per athlete and one column per day for the last 14 days, oldest on the left, plus a "7-day average" column.
- A metric switcher above the grid: All, Sleep, Quality, Soreness, Mood, HRV, Resting HR. "All" shows sleep hours in each cell with three small numbers for quality, soreness and mood. The HRV and Resting HR views add the difference from baseline, for example "64 (−8)".
- An empty day shows "–". A carried value shows in a lighter weight, with "Same as yesterday" in its tooltip. An ill or injured day shows a glyph and the word "Ill" or "Injured".
- A cell whose values tripped a rule gets a hairline outline and the flag's severity glyph.
- Arrow keys move between cells, and Enter opens the day's full check-in in a popover.

**Athlete page** (`#/coach/athlete/:athleteId`): the latest check-in, a 14-day sparkline for each metric and that athlete's open flags.

**Overview roster:** a "Last check-in" column ("Today 06:42", "Yesterday" or "3 d ago") and an "Flags" column with the highest open severity glyph and a count.

Being ill or injured is not a flag. The athlete has said it directly, so it shows as a status on the roster row and in the grid instead of waiting for a rule.

The same page holds the kudos composer. Kudos and the coach-kudos badge are specified in [gamification](gamification.md).

## Baselines

HRV and resting heart rate are compared with each athlete's own recent normal, not with population norms.

**Definition.** `B(metric, e)` is the mean and standard deviation of that metric's readings on the 28 days before day `e`: days `e − 28` to `e − 1`.

- Days with the ill-or-injured switch on are left out. A sick week should not lower the athlete's normal range for the next month.
- At least 7 readings are needed. With fewer, the baseline does not exist yet, the rules that need it are not evaluated, and the UI says "Not enough readings yet: 5 of 7".
- The mean is the plain average. The standard deviation (SD) is the sample standard deviation, dividing by `n − 1`.
- Nothing is rounded until it is displayed.

```ts
export interface Baseline {
  mean: number;
  sd: number;
  n: number;        // readings used, at least 7
  fromDay: number;  // e − 28
  toDay: number;    // e − 1
}

export function baseline(readings: Array<{ day: number; value: number; unwell: boolean }>, e: number): Baseline | null;
```

**Each rule takes its baseline from before its own window.** The 7-day HRV rule uses `B(hrv, d − 6)`, the 28 days before its 7-day window. The two-day resting heart rate rule uses `B(restingHr, d − 1)`. A bad spell therefore never drags down the baseline it is compared with.

**Display.** Me and the coach's athlete page show the baseline as of today, `B(metric, d)`, as "Usual HRV 72 ms (most days 66 to 78)". The range shown is the mean plus or minus one SD, rounded to whole numbers. A flag card always shows the baseline its own rule used.

**Seed.** The seed's baselines are Amir 72 ms and 48 bpm, Danial 88 ms and 44 bpm, and Irfan 65 ms and 50 bpm. A day-to-day spread of about 7% of the mean for HRV and about 1.5 bpm for resting heart rate gives realistic flags (suggested values for the seed author).

## Flag rules

### Severity

| Severity | Meaning | Glyph | What the coach should do |
|---|---|---|---|
| Info | Worth knowing | Open circle and the word "Info" | Nothing unless it repeats |
| Watch | A pattern to keep an eye on | Half-filled circle and "Watch" | Consider a change if it lasts |
| Act | Needs a decision | Filled circle and "Act" | Talk to the athlete or change the plan within a day |

Status colours come from the status palette in [DESIGN.md](../../DESIGN.md), never from the brand colours, and always appear with the glyph and the word. Severity is fixed per rule and never escalates on its own.

### Rule table

| Id | Title | Condition (exact) | Window | Severity |
|---|---|---|---|---|
| `hrv-low` | HRV below usual | `mean(hrv[d−6 … d]) < B.mean − 0.5 × B.sd`, with `B = B(hrv, d − 6)`. Needs at least 4 HRV readings in the window. | 7 days | Watch |
| `rhr-high` | Resting HR up | `restingHr[d] − B.mean ≥ 7` and `restingHr[d − 1] − B.mean ≥ 7`, with `B = B(restingHr, d − 1)` | 2 days running | Watch |
| `sleep-short` | Short sleep | `sleepHours[d] < 6` and `sleepHours[d − 1] < 6` | 2 nights running | Info |
| `soreness-high` | Sore two days | `soreness[d] ≥ 4` and `soreness[d − 1] ≥ 4` | 2 days running | Watch |
| `mood-low-under-load` | Low mood, heavy load | `mood[d] ≤ 2` and `form(d) < −25` | 1 day | Act |
| `ramp-high` | Fast ramp | `ramp(d − 1) > 8` | 7 days to yesterday | Watch |
| `form-deep` | Deep fatigue | `form(d) < −30` | 1 day | Act |
| `key-missed` | Key sessions missed | At least 2 planned workouts with `isKey = true`, on days `weekStart(d)` to `d − 1`, have the compliance band `missed` | This Monday to yesterday | Watch |

Notes on the conditions:

- "Below", "above", "under" and "more than" are strict. "At least" and "or more" include the boundary. So sleep of exactly 6.0 h is not short, and a ramp of exactly 8.0 is not high.
- Load-based rules (`mood-low-under-load`, `ramp-high`, `form-deep`) use complete days only, up to the end of yesterday. This is the same convention as Form, and it stops a flag from appearing and vanishing while today's sessions are still being logged.
- `key-missed` counts only past days. Today's key session is not missed until the day is over. A session the coach moved to another day is not missed. A session with the band `short` or `under` is not missed. The bands are defined in [metrics](metrics.md).
- Values are compared unrounded. If rounding would make a value look equal to its threshold, the card shows one more decimal place, so "Form −30.0" never appears on a flag that fired at −30.04.
- Ramp, Form, Fitness and Fatigue need 42 days of training history before their rules are evaluated, because Fitness starts from zero and climbs fast at first. The seed has 112 days.

### Rule cards

Each card below gives the rule text the flag card shows, the values it shows, the explanation for the coach, the suggested action, the gentle note an athlete may see, and when the flag resolves itself. In the copy, `{name}` is the athlete's first name, and the athlete is "they".

#### hrv-low: HRV below usual

- **Rule text:** "7-day average HRV below usual (baseline minus half a standard deviation)"
- **Values shown:** the 7-day average HRV and how many readings it used; the baseline mean and SD; the line (mean − 0.5 SD); the seven daily readings as a sparkline over the baseline band. Example: "7-day average 66 ms (6 readings) · usual 72 ms ± 6 · line 69 ms".
- **Explanation:** "{name}'s heart-rate variability has averaged {avg7} ms over the last 7 days, below their usual {mean} ms. HRV usually dips when the body is short of recovery: hard training, short sleep, illness, heat, travel or stress. One low morning means little. A low weekly average is a pattern worth a look."
- **Suggested action:** "Look at the last week's load and sleep. If a hard session is due in the next two days, consider making it easy or moving it, and ask how they feel."
- **Athlete note:** "Your recovery numbers have been a little lower than usual this week. Easy sessions and good sleep usually bring them back."
- **Resolves itself:** when the 7-day average is at or above the line on 2 days running.

#### rhr-high: Resting HR up

- **Rule text:** "Resting heart rate at least 7 bpm above baseline, two mornings running"
- **Values shown:** resting heart rate this morning and yesterday; the baseline mean; the difference for each morning. Example: "56 bpm this morning, 55 bpm yesterday · baseline 48 bpm · +8 and +7".
- **Explanation:** "{name}'s resting heart rate has been at least 7 bpm above their baseline for two mornings. A raised resting heart rate often comes with fatigue, an illness starting, short sleep, dehydration or heat. Two mornings in a row makes a one-off reading less likely."
- **Suggested action:** "Ask how they feel. If they feel unwell, swap the next two days for rest or easy sessions."
- **Athlete note:** "Your resting heart rate has been a bit higher than usual for two mornings. Take it easy if you feel run-down, and tell Coach how you are."
- **Resolves itself:** when resting heart rate is less than 7 bpm above baseline on 2 mornings running.

#### sleep-short: Short sleep

- **Rule text:** "Under 6 hours' sleep, two nights running"
- **Values shown:** both nights' sleep and the 7-day average. Example: "5.5 h last night, 5.0 h the night before · 7-day average 6.4 h".
- **Explanation:** "{name} has slept under 6 hours for two nights. Short sleep slows recovery and makes hard sessions feel harder than they are."
- **Suggested action:** "Check whether a key session is due in the next two days and whether it can move. Ask if something is getting in the way of sleep."
- **Athlete note:** "Two short nights in a row. An early night will do more for your training than any session today."
- **Resolves itself:** after 2 nights running of 6 hours or more.

#### soreness-high: Sore two days

- **Rule text:** "Soreness 4 or more, two days running"
- **Values shown:** soreness on both days; the ill-or-injured note, if there is one; the load of the last 3 days. Example: "Soreness 4 today, 5 yesterday · last 3 days' load 312".
- **Explanation:** "{name} has rated soreness 4 or more for two days. That is more than the usual stiffness after training, and it can be the start of an injury."
- **Suggested action:** "Ask where it hurts and whether it is general muscle soreness or one sharp spot. Swap running for swimming or easy riding until it settles. If the pain is sharp, in a joint or getting worse, suggest they see a physiotherapist."
- **Athlete note:** "You've been quite sore two days running. Go easy today, and tell Coach where it's sore so they can adjust the plan."
- **Resolves itself:** after 2 days running at 3 or less.

#### mood-low-under-load: Low mood, heavy load

- **Rule text:** "Mood 2 or less while Form is below −25"
- **Values shown:** mood; Form, with Fitness and Fatigue; Ramp. Example: "Mood 2 today · Form −28 (Fitness 61, Fatigue 89) · Ramp +6.1".
- **Explanation:** "{name} rated their mood {mood} out of 5 while carrying heavy fatigue (Form {form}). Low mood has many causes, but low mood in a heavy block is one of the earliest signs of overreaching."
- **Suggested action:** "Talk to them today; don't rely on a plan change alone. Unless a race is close, plan two to three easy days."
- **Athlete note:** "Thanks for being honest about how you feel. You've been training hard, and that can weigh on anyone. Coach knows and may check in with you."
- **Resolves itself:** when mood is 3 or more, or Form is −25 or above, on 2 days running.

#### ramp-high: Fast ramp

- **Rule text:** "Fitness up more than 8 in 7 days"
- **Values shown:** Ramp; Fitness on the day before the check and 7 days earlier; the last 7 days' load. The rule reads Fitness up to yesterday, so the line is always dated by that day. Example: "Ramp +9 in the week to 12 Nov · Fitness 58.4, 49.2 a week before".
- **Explanation:** "{name}'s Fitness rose by {ramp} in the last 7 days. A rise of more than 8 a week means load is climbing fast. Held for several weeks, it raises the chance of illness and injury."
- **Suggested action:** "If the jump was planned, such as a camp week, acknowledge it. If not, trim next week's volume and keep the key sessions."
- **Athlete note:** "Your training has built up quickly this week. That's fine for a short while, and Coach is keeping an eye on it."
- **Resolves itself:** when Ramp is 8 or less on 2 days running.

#### form-deep: Deep fatigue

- **Rule text:** "Form below −30"
- **Values shown:** Form, with Fitness and Fatigue; how many days in a row Form has been below −30. Example: "Form −32 (Fitness 70, Fatigue 102) · 2nd day below −30".
- **Explanation:** "{name}'s Form is {form}: fatigue is far ahead of fitness. Short dips happen in hard blocks. Staying this low for long leads to staleness, illness or injury."
- **Suggested action:** "Put recovery days in now, and make sure the next key session doesn't land on top of this fatigue."
- **Athlete note:** "You're carrying a lot of tiredness right now. Rest days are part of the plan, not a break from it."
- **Resolves itself:** when Form is −30 or above on 2 days running.

#### key-missed: Key sessions missed

- **Rule text:** "2 or more key sessions missed this week"
- **Values shown:** each missed key session (day, sport and title); key sessions done and planned this week. Example: "Missed: Tue Run 6 x 1 km, Thu Run 3 x 3 km at threshold · 1 of 4 key sessions done".
- **Explanation:** "{name} has missed {count} key sessions this week. Key sessions carry the most training value in a week. Two misses usually mean the week was too full or something came up."
- **Suggested action:** "Ask what got in the way. Move one key session into next week or drop it, but don't stack both into the weekend."
- **Athlete note:** "A couple of key sessions didn't happen this week. That's okay. Coach will help reshuffle."
- **Resolves itself:** when the next week starts on Monday, or at once if the count drops below 2, for example when a late file import matches one of the sessions.

## When rules run

The rules are one pure function, so the same inputs always give the same flags.

```ts
export type FlagRuleId =
  | 'hrv-low' | 'rhr-high' | 'sleep-short' | 'soreness-high'
  | 'mood-low-under-load' | 'ramp-high' | 'form-deep' | 'key-missed';

export interface RuleResult {
  ruleId: FlagRuleId;
  state: 'true' | 'false' | 'no-data';
  values: Record<string, number | string>;   // the "values shown" for this rule
}

export function evaluateRules(athleteId: string, d: number, data: AthleteData): RuleResult[];
```

- `no-data` means an input is missing: no check-in on a needed day, no baseline yet, too few HRV readings, or too little training history. It neither opens a flag nor counts as a clear day.
- **Prototype.** The rules run for one athlete after a check-in is saved; after an activity is added, changed or removed; after a plan change (move, delete or key-session toggle); when the app starts; and at local midnight if the app is open. The seed replays the rules day by day through the 16 weeks of history, so the flag history and today's open flags come out of the same code.
- **MVP.** The nightly job applies the same table on the server, and the rules also run after each synced check-in or activity. See the [MVP roadmap](../roadmap/mvp.md).

## Flag lifecycle

A flag has three states: **open**, **acknowledged** and **resolved**.

| From | Event | To | By |
|---|---|---|---|
| None | The rule is true, the rule is armed, and no open or acknowledged flag exists for this athlete and rule | Open | Rules |
| Open | The coach acknowledges it | Acknowledged | Coach |
| Open or acknowledged | The rule is true again | Same state; the latest values are updated | Rules |
| Open or acknowledged | The rule's "resolves itself" condition is met | Resolved, reason `auto` | Rules |
| Open or acknowledged | The coach resolves it | Resolved, reason `coach` | Coach |
| Open or acknowledged | The rule has been `no-data` for 7 days in a row | Resolved, reason `no-data` | Rules |
| `key-missed`, open or acknowledged | The week ends | Resolved, reason `week-ended` | Rules |
| Resolved | None | Final. If the rule fires again, a new flag opens. | |

**One open flag per rule per athlete.** At most one flag per (athlete, rule) can be open or acknowledged. While one exists, the rules update its latest values instead of opening another. In the MVP a partial unique index on (`athlete_id`, `rule_id`) where the status is open or acknowledged enforces this.

**Acknowledged means seen.** It tells the coach's future self "I know about this". An acknowledged flag stays in the inbox, stops counting towards the badge on the left rail and still resolves itself.

**Resolving by hand.** The coach can resolve a flag whose condition is still true, for example after talking to the athlete. The rule then stays quiet for that athlete until its condition has been false at least once (the rule is re-armed). This stops a flag the coach has dealt with from coming straight back the next morning.

**Undo.** Acknowledge and resolve each show a toast with Undo for 5 seconds.

**Notes.** The coach can add notes of up to 280 characters to a flag in any state. Notes are visible only to the coach.

**Record shape.**

```ts
export type Severity = 'info' | 'watch' | 'act';
export type FlagStatus = 'open' | 'acknowledged' | 'resolved';

export interface Flag {
  id: string;                     // `${athleteId}:${ruleId}:${openedDay}`
  athleteId: string;
  ruleId: FlagRuleId;
  severity: Severity;             // copied from the rule table
  status: FlagStatus;
  openedDay: number;
  lastTrueDay: number;
  clearDays: number;              // consecutive evaluated days on which the rule was false
  noDataDays: number;             // consecutive days of no-data
  valuesAtOpen: Record<string, number | string>;
  valuesLatest: Record<string, number | string>;
  acknowledgedDay?: number;
  resolvedDay?: number;
  resolution?: 'auto' | 'coach' | 'no-data' | 'week-ended';
  notes: Array<{ day: number; text: string }>;
}

// Per athlete: rules resolved by hand while still true, waiting to be re-armed.
export type QuietRules = Partial<Record<FlagRuleId, true>>;
```

The flag card shows the latest values, with a line for the values at opening: "Opened Tue: 7-day average 67 ms".

## The coach's flag inbox

The inbox sits on `#/coach/check-ins`, beside the check-in grid. At 1440 px the grid takes about 60% of the width and the inbox about 40%, with the kudos composer under the inbox. Flags also appear on the athlete page and as a mark on the Overview row.

**Rows.** Each row is 28 px: severity glyph and word, athlete, flag title, the key value ("Form −32"), when it opened ("Tue" or "9 d") and the status.

**Order.** Open before acknowledged. Within each, Act, then Watch, then Info. Then the most recently opened first, then the athlete's name.

**Filters.** A segmented control: Open (open and acknowledged, the default), Resolved (the last 28 days) and All. An athlete filter: All, Amir, Danial, Irfan.

**Badge.** The Check-ins item in the left rail shows the number of open (not yet acknowledged) flags.

**Detail panel.** Enter or a click opens the flag in a side panel within the page:

- title, severity glyph and word, and status;
- the rule text and the values shown, with a small chart: the readings against the baseline band for heart and sleep rules, or 14 days of Form or Fitness for load rules;
- the explanation and the suggested action;
- context: the last 3 check-ins, the athlete's ill-or-injured note if there is one, and their other open flags;
- history: "This rule fired 2 times in the last 28 days";
- actions: Acknowledge, Resolve, Add note, and Open calendar (to `#/coach/calendar/:athleteId`).

**Keyboard.**

| Key | Action |
|---|---|
| ↑ / ↓ or J / K | Move between rows |
| Enter | Open the detail panel |
| A | Acknowledge |
| R | Resolve |
| N | Add a note |
| C | Open the athlete's calendar |
| Esc | Close the panel and return focus to the row |
| ? | Show all shortcuts |

**Empty states.** Open: "Nothing needs attention right now." Resolved: "No flags resolved in the last 28 days."

If AI is on for an athlete at both consent layers, the simulated check-in summary appears above the grid (see [AI](ai.md)). The inbox itself never contains AI output.

## What athletes see

Flags are a coach tool. Athletes never see the word "flag", a rule id, a severity word or colour, a warning icon, a counter, a dot on the tab bar, a notification or a sound because of a flag.

What they do see:

1. **After every check-in,** the toast "Shared with Coach". It tells the athlete plainly who sees their answers.
2. **One gentle note on Today,** when the coach setting "Gentle notes for athletes" is on (Settings; on by default in the prototype). The note is the "athlete note" copy from the rule card of the athlete's most important open or acknowledged flag: highest severity first, then the most recently opened. It sits below the day's session card, looks like a quiet paper note (raised paper surface, ink text, no icon) and has a "Thanks" button that hides it until a different flag opens. Hiding it changes nothing for the coach.
3. **If the athlete has switched on "Ill or injured",** the note is replaced by "Rest up. Coach knows you're not well and will adjust your plan." and no other note shows.

The copy never diagnoses, never tells the athlete to train more and never uses alarm words. Where a body signal is involved, it points the athlete to Coach.

With "Gentle notes for athletes" off, athletes see only "Shared with Coach". Whether athletes should see anything at all is open question 2 in the [design brief](../brief/design-brief.md); the setting lets the trial try both answers.

## Flags never come from AI

- The rules live in `src/domain/flags.ts` as plain code with truth-table tests. They run with no network and no model.
- The AI features read open flags (rule id, values and status) as input and may mention them, quoting their rule text. No AI output has a field that can open, change or resolve a flag.
- An oxlint `no-restricted-imports` rule stops anything under `src/ai/` from importing the flag store's write actions.
- In the MVP, the AI Edge Functions have no write access to the `flags` table.

## Tests

Truth tables, one per rule, with the boundary cases. Baseline examples assume `B.mean = 72`, `B.sd = 6` for HRV (line 69) and `B.mean = 48` for resting heart rate.

| Rule | Input | Expected |
|---|---|---|
| `hrv-low` | 7-day average 69.0 ms from 7 readings | false |
| `hrv-low` | 7-day average 68.9 ms from 7 readings | true |
| `hrv-low` | 7-day average 60 ms from 3 readings | no-data |
| `hrv-low` | Baseline from 6 readings | no-data |
| `hrv-low` | Baseline window includes 5 ill days; 9 readings remain | evaluated on the 9 |
| `rhr-high` | 55 bpm today, 55 bpm yesterday | true (+7, +7) |
| `rhr-high` | 55 bpm today, 54 bpm yesterday | false |
| `rhr-high` | 60 bpm today, no reading yesterday | no-data |
| `sleep-short` | 5.5 h, 5.5 h | true |
| `sleep-short` | 6.0 h, 5.0 h | false |
| `sleep-short` | 5.0 h today, no check-in yesterday | no-data |
| `soreness-high` | 4, 4 | true |
| `soreness-high` | 5, 3 | false |
| `mood-low-under-load` | Mood 2, Form −25.1 | true |
| `mood-low-under-load` | Mood 2, Form −25.0 | false |
| `mood-low-under-load` | Mood 3, Form −40 | false |
| `ramp-high` | Ramp 8.0 | false |
| `ramp-high` | Ramp 8.01 | true |
| `form-deep` | Form −30.0 | false |
| `form-deep` | Form −30.01 | true |
| `key-missed` | 2 key sessions missed on past days | true |
| `key-missed` | 1 missed and 1 partial | false |
| `key-missed` | 1 missed yesterday and today's key session not done yet | false |
| `ramp-high` | Ramp 12 with 30 days of history | no-data |

Lifecycle cases:

| Case | Expected |
|---|---|
| Rule true on 3 days in a row | One flag, opened on day 1, `lastTrueDay` day 3 |
| Open flag, rule false on 1 day, then true | Same flag stays open; `clearDays` resets to 0 |
| Open flag, rule false on 2 days running | Resolved, reason `auto` |
| Coach resolves while still true; rule true the next day | No new flag |
| Coach resolves while still true; rule false one day, then true | New flag opens |
| Rule `no-data` for 7 days | Resolved, reason `no-data` |
| `key-missed` open on Sunday; Monday arrives | Resolved, reason `week-ended` |
| Same seed, run twice | Identical flag lists |

## Demo coverage

The seed should make every rule fire at least once in the 16 weeks of history, and leave the current week with at least one open flag of each severity and one acknowledged flag, so the inbox shows its range. Suggested placements for the seed author:

- **Danial, week 11 (sick week):** `rhr-high` and `hrv-low` open mid-week and resolve themselves in week 12; `key-missed` resolves when week 12 starts.
- **Amir:** `ramp-high` in the first build week after a recovery week; an acknowledged `sleep-short` in the current week, with a coach note.
- **Irfan:** `form-deep` (Act) open in the current week, during the climbing block before the hill climb in week +3.

## MVP notes

- The rule table, the copy and the lifecycle carry over unchanged. Only where the rules run changes (see [When rules run](#when-rules-run)).
- Check-ins saved offline go through the outbox and are evaluated when they sync.
- Flag notifications, if any, go to the coach only, are opt-in and cover Act flags only, at most once a day. Athletes get no flag notifications. Notifications are specified in the [MVP roadmap](../roadmap/mvp.md).
