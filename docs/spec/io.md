# Import and export

Build spec for `src/io`. It defines every file Laree writes (.zwo, .mrc, .erg, .fit workouts and .ics calendars) and every file it reads (.FIT, .GPX and .TCX activities). For each one it gives the exact format, how Laree's step model maps onto it, and what people see when something goes wrong. It also defines how an imported file becomes an activity with a Load. An engineer should be able to build and test `src/io` from this page alone. The example outputs in sections 4 to 7 are the golden files for the export tests.

Related documents: [metrics](metrics.md) (Load, zones, compliance and matching), [information architecture](../ia/information-architecture.md) (object model and routes), [screen inventory](../ia/screen-inventory.md) (the log sheet, the workout builder and the calendar), [check-ins and flags](checkins-flags.md) and the [MVP roadmap](../roadmap/mvp.md).

## Contents

1. Scope
2. Principles
3. Shared export rules
4. Zwift .zwo
5. .mrc and .erg
6. .fit workout
7. .ics calendar
8. Import pipeline and detection
9. Reading files
10. From file to activity
11. Privacy
12. Errors and notices
13. Tests

## 1. Scope

| Direction | Format | What it carries | Where it starts |
|---|---|---|---|
| Out | .zwo | A bike workout for Zwift and apps that read Zwift files | Workout builder, calendar session |
| Out | .mrc | A bike workout as minutes against % FTP, for ERG-mode trainer apps | Workout builder |
| Out | .erg | The same workout as minutes against watts | Workout builder |
| Out | .fit | A structured workout for a Garmin watch or bike computer | Workout builder, calendar session |
| Out | .ics | Planned sessions (and races) as calendar events | Calendar toolbar, calendar session |
| In | .FIT | A recorded activity from a watch, bike computer or app | Log sheet, "Import file" |
| In | .GPX | A recorded track with times, and heart rate, cadence and power where present | Log sheet, "Import file" |
| In | .TCX | A recorded activity with laps, heart rate and power | Log sheet, "Import file" |

Not covered here:

- **Strava.** Laree never reads from Strava. Strava's API shows an activity only to the athlete who owns it, so it could never feed a coach view. Strava appears only as an outbound "Share to Strava" button on activity pages and on Me. In the prototype it is disabled and explains why. In the MVP it would upload the activity's file for an athlete who has connected their own Strava account (see the roadmap).
- **Device sync.** "Sync device (simulated)" creates an activity from the plan with source `device` and generated detail data. No file is involved, so nothing on this page applies to it.
- **Other files.** .zip archives, .FIT workout and course files, .KML and .CSV are recognised only so that the error message can name them (section 12).

## 2. Principles

1. **Files never leave the device in the prototype.** Exports are built in the browser and handed to the browser as downloads. Imports are read in the browser. Laree makes no network request with file contents.
2. **Content decides, not the file name.** An import is recognised from its bytes. A GPX file named `ride.fit` is read as GPX.
3. **Deterministic output.** Every exporter is a pure function of the workout, the athlete's thresholds and an injected clock (`now`). The same inputs give the same bytes, which is what makes golden-file tests possible.
4. **One source of truth for targets.** Exports resolve targets with the same rules the builder's profile chart and planned Load use (section 3.3 and `docs/spec/metrics.md` section 3). What the coach sees is what the device gets.
5. **Check before handing over.** A .fit file is decoded again and checked before it is downloaded (section 6.6).
6. **The FIT library loads only when needed.** `@garmin/fitsdk` is about 1 MB of source, most of it the profile. It is loaded with a dynamic `import()` when a .fit export starts or a file import begins, never in the first load.
7. **Plain English when things fail.** Every error names the file, says what is wrong and says what to do next (section 12).

Code layout:

| Module | Contents |
|---|---|
| `src/io/export/resolve.ts` | Resolves a workout for one athlete: expands defaults, turns percentages into watts, pace or heart rate, decides ramps |
| `src/io/export/text.ts` | `asciiSafe`, `slug`, file names, duration and target labels, the step summary |
| `src/io/export/zwo.ts`, `mrc-erg.ts`, `fit.ts`, `ics.ts` | One writer per format |
| `src/io/export/fit-verify.ts` | Decodes a written .fit file and compares it with the input |
| `src/io/import/detect.ts` | Recognises the format from the bytes |
| `src/io/import/fit.ts`, `gpx.ts`, `tcx.ts` | One reader per format, each returning a `ParsedActivity` |
| `src/io/import/xml.ts` | A small streaming XML reader for GPX and TCX |
| `src/io/import/streams.ts` | Builds 1 Hz streams over timer time |
| `src/io/import/worker.ts` | The module worker that runs detection and reading |
| `src/io/store-streams.ts` | Saves and loads streams in IndexedDB |

## 3. Shared export rules

### 3.1 Which formats fit which workouts

Export menus list every format. A format that does not fit is disabled, and the menu item states the reason (screen inventory, C10).

| Format | Needs | Reason shown when disabled |
|---|---|---|
| .zwo | Bike workout, power basis | "Zwift files need a bike workout with power targets." |
| .mrc | Bike workout, power basis | ".mrc needs a bike workout with power targets." |
| .erg | Bike workout, power basis, and an FTP for the chosen athlete | ".erg needs a bike workout with power targets." or "Amir has no FTP yet. Add one in Zones and thresholds." |
| .fit | At least one step, at most 50 FIT steps, and the threshold the basis needs | "This workout has no steps to send to a watch." or "This workout needs 54 watch steps. Garmin watches take up to 50." or "Danial has no LTHR yet. Add one in Zones and thresholds." |
| .ics | A planned session (it has a day). Library templates have no day, so the builder offers "Add to calendar" instead | Not listed in the builder |
| Any | A valid workout | "Fix the steps first: the repeat block is empty." (or the builder's other inline error) |

The limit of 50 FIT steps is a common Garmin device limit [verify]. Repeat blocks are not expanded in a .fit file, so the count is the plain steps plus one per repeat block.

Exports always target one athlete. On a calendar session that is the session's athlete. In the builder it is the athlete chosen in the target preview, which defaults to the last athlete viewed. .zwo and .mrc are relative, so the athlete changes only their description line.

### 3.2 Repeat blocks

A repeat block holds plain steps and never nests (information architecture, rule 7). It repeats all of its children, so `4 × (8 min on + 3 min easy)` contains four easy spells, and the last one runs into the next step. This matches `docs/spec/metrics.md` section 3.1, Zwift's `IntervalsT` and FIT repeat steps. Writers that cannot express repeats (.mrc, .erg and the .ics step summary aside) expand them.

### 3.3 Resolving targets

`resolve.ts` turns each step into a resolved step before any writer runs.

1. **Thresholds.** Use the athlete's threshold in force on the session's day (metrics section 1.4). A library template exported from the builder uses today's value.
2. **Defaults.** A step with no target takes the default for its kind and the workout's basis (metrics section 3.1). For example, a warm-up on the power basis becomes 60% FTP.
3. **Ramps.** A warm-up or cool-down whose target is a range (low below high) is a ramp. A warm-up rises from low to high; a cool-down falls from high to low. Every other step, and any step with a single value, is flat. The builder's profile chart draws the same ramps, so the export matches the picture.
4. **One number or a range.** Formats that hold one value per moment (.zwo, .mrc, .erg) use the midpoint of a flat step's range, the same midpoint the planned Load uses. Formats that hold a range (.fit, and the text in .ics) keep the range. A single value exported as a range to .fit becomes the value minus 2 to the value plus 2 percentage points, so the watch does not alert on every wobble.
5. **Absolute values.** Multiply before dividing and round half away from zero (metrics section 1.5):

| Basis | Absolute value | Example |
|---|---|---|
| Power (% FTP) | watts = `round(pct × FTP / 100)` | 95% of 255 W = 242.25, so 242 W |
| Heart rate (% LTHR) | bpm = `round(pct × LTHR / 100)` | 90% of 166 = 149.4, so 149 bpm |
| Pace (% threshold speed) | speed in m/s = `pct / 100 × 1000 / thresholdPace`; pace shown = `round(thresholdPace / (pct / 100))` s per km | 100% for Danial (238 s/km) = 4.2017 m/s, shown 3:58 /km |
| Swim (% CSS speed) | pace shown = `round(CSS / (pct / 100))` s per 100 m | 105% for Amir (108 s) = 102.9, so 1:43 /100 m |
| Effort (RPE) | No absolute value. Carried as text, for example "RPE 7" | |

A higher percentage is always harder. For pace and swim targets that means faster, so the low end of a range is the slower pace.

### 3.4 Text, names and file names

- **`asciiSafe(text)`** is used for every text field in .mrc, .erg and .fit, because trainer apps and watch fonts are limited. It applies Unicode NFKD, removes combining marks, maps `×` to `x`, en and em dashes to `-`, curly quotes to straight ones, `·` to `-` and `…` to `...`, drops any other non-ASCII character and collapses runs of spaces. .zwo and .ics are UTF-8 and keep the original text.
- **`slug(text)`**: `asciiSafe`, then `4 × 8` style pairs become `4x8`, then lower case, then every run of characters other than `a-z` and `0-9` becomes one `-`, trimmed of leading and trailing `-`, cut to 40 characters.
- **File names**: a planned session is `laree-{athleteId}-{yyyy-mm-dd}-{slug(title)}.{ext}`; a library template is `laree-{athleteId}-{slug(name)}.{ext}`; a week of sessions is `laree-{athleteId}-week-{yyyy-mm-dd of the Monday}.ics`. Dates are local dates in Asia/Kuala_Lumpur.
- **Duration labels**: `45 s`, `8 min`, `2 min 30 s`, `1 h 09 min`. **Target labels**: `242-255 W`, `141-149 bpm`, `4:11-4:25 /km`, `1:43-1:48 /100 m`, `RPE 7`, all with a plain hyphen.
- **The step summary** has one line per top-level step or repeat block:
  - a flat step: `{duration} {kind} at {target}`, for example `8 min interval at 242-255 W`;
  - a ramp: `{duration} {kind} from {start} to {end} {unit}`, for example `15 min warm-up from 128 to 191 W`;
  - a repeat block: `{n} × ({child} + {child})`.

### 3.5 Encoding, line endings and delivery

| Format | MIME type | Encoding | Line endings |
|---|---|---|---|
| .zwo | `application/xml` | UTF-8, no byte-order mark | LF |
| .mrc, .erg | `text/plain` | ASCII | CRLF |
| .fit | `application/vnd.ant.fit` | binary | none |
| .ics | `text/calendar; charset=utf-8` | UTF-8, no byte-order mark | CRLF |

Every exporter returns `{ fileName, mimeType, bytes }`. The UI wraps the bytes in a `Blob`, creates an object URL, clicks a temporary `<a download>` and revokes the URL 10 seconds later. The export button shows a busy state until the download starts (information architecture, section 8). A toast confirms with the file name. On a phone, when `navigator.canShare({ files })` is true, the menu also offers "Share", which opens the system share sheet (Files, Mail, Calendar).

### 3.6 The sample workout

Every example output on this page comes from this one session. The dates assume the runtime start is Monday 13 July 2026, so day 120 is Tuesday 10 November 2026, in week +1. The export clock reads Sunday 8 November 2026, 10:00 in Kuala Lumpur (02:00 UTC).

| Field | Value |
|---|---|
| Athlete | Amir, FTP 255 W (raised from 245 W in history week 9) |
| Session | id `pw-amir-120-1` (an example id; the seed sets the real format), day 120, no start time, key session, copied from the library template "Threshold 4 × 8" tagged `build` and `threshold` |
| Title | Threshold 4 × 8 |
| Sport and basis | Bike, power (% FTP) |
| Coach note | Even pacing. If interval 4 drops below 242 W, stop there. |

| # | Step | Duration | Target | Resolved for Amir |
|---|---|---|---|---|
| 1 | Warm-up | 15 min | 50–75% FTP | Ramp from 128 W to 191 W |
| 2 | Repeat 4 × | | | |
| 2a | Interval, note "Seated. Cadence 90 or more." | 8 min | 95–100% FTP | 242–255 W, midpoint 97.5% = 249 W |
| 2b | Recovery | 3 min | 50–60% FTP | 128–153 W, midpoint 55% = 140 W |
| 3 | Cool-down | 10 min | 45–65% FTP | Ramp from 166 W down to 115 W |

Totals: 15 + 4 × (8 + 3) + 10 = 69 min (4,140 s). Using the step midpoints (warm-up 0.625, intervals 0.975, recoveries and cool-down 0.55), the planned intensity is `I_w` = 0.8330, a planned weighted power of 212.4 W, and the planned Load is 1.15 × 0.8330² × 100 = 79.79, shown as **80**.

## 4. Zwift .zwo

Zwift reads workout files from `Documents/Zwift/Workouts/{Zwift user id}/`. Zwift publishes no schema; this section follows the files Zwift itself ships and the community reference at `github.com/h4l/zwift-workout-file-reference`.

### 4.1 Structure

```xml
<?xml version="1.0" encoding="UTF-8"?>
<workout_file>
    <author>…</author>
    <name>…</name>
    <description>…</description>
    <sportType>bike</sportType>
    <tags>
        <tag name="…"/>
    </tags>
    <workout>
        … one element per segment …
    </workout>
</workout_file>
```

- `author` is always `Coach`. `name` is the workout title. `description` is the coach note (or the template description), then one sentence: `Planned in Laree for {athlete} at FTP {ftp} W. Zwift scales targets to the FTP set in Zwift.`
- `tags` holds the source template's tags, in their stored order. With no tags it is written as `<tags/>`.
- Text and attribute values are XML-escaped: `&` `<` `>` `"` and `'` become `&amp;` `&lt;` `&gt;` `&quot;` and `&apos;`.
- Indentation is four spaces. The file ends with a line feed.

### 4.2 Mapping steps to segments

Durations are whole seconds. Power is a fraction of FTP, written with up to three decimals and no trailing zeros (95% is `0.95`, 97.5% is `0.975`, 50% is `0.5`).

| Laree step | Zwift element | Attributes |
|---|---|---|
| A ramp that is the first segment | `Warmup` | `Duration`, `PowerLow` = start, `PowerHigh` = end |
| A ramp that is the last segment | `Cooldown` | `Duration`, `PowerLow` = start, `PowerHigh` = end |
| A ramp anywhere else | `Ramp` | `Duration`, `PowerLow` = start, `PowerHigh` = end |
| A flat step | `SteadyState` | `Duration`, `Power` = midpoint |
| A repeat block of exactly two flat steps | `IntervalsT` | `Repeat`, `OnDuration`, `OffDuration`, `OnPower`, `OffPower`; the first child is "On" |
| Any other repeat block | Expanded | Its children, written `n` times with the rules above |

- **Start and end, not low and high.** Zwift reads `PowerLow` as the power at the start of a ramp and `PowerHigh` as the power at the end. A falling cool-down therefore has `PowerLow` above `PowerHigh`, as in Zwift's own files.
- **Over-unders work.** `IntervalsT` does not require "On" to be harder than "Off", so a block of 2 min at 105% then 2 min at 95% maps to it.
- **Step notes** become `<textevent timeoffset="0" message="…"/>` inside the segment, so Zwift shows them on screen as the segment starts. A note on the second child of an `IntervalsT` uses `timeoffset` = `OnDuration`. Inside `IntervalsT` a note appears in the first repetition only.
- Laree does not write `FreeRide`, `MaxEffort`, cadence attributes or `pace`. Every step on the power basis has a target once defaults are applied, so no free segment is needed.

### 4.3 Example output

`laree-amir-2026-11-10-threshold-4x8.zwo`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<workout_file>
    <author>Coach</author>
    <name>Threshold 4 × 8</name>
    <description>Even pacing. If interval 4 drops below 242 W, stop there. Planned in Laree for Amir at FTP 255 W. Zwift scales targets to the FTP set in Zwift.</description>
    <sportType>bike</sportType>
    <tags>
        <tag name="build"/>
        <tag name="threshold"/>
    </tags>
    <workout>
        <Warmup Duration="900" PowerLow="0.5" PowerHigh="0.75"/>
        <IntervalsT Repeat="4" OnDuration="480" OffDuration="180" OnPower="0.975" OffPower="0.55">
            <textevent timeoffset="0" message="Seated. Cadence 90 or more."/>
        </IntervalsT>
        <Cooldown Duration="600" PowerLow="0.65" PowerHigh="0.45"/>
    </workout>
</workout_file>
```

## 5. .mrc and .erg

These are the plain-text course files that ERG-mode trainer apps have read since the CompuTrainer days. .mrc gives power as a percentage of FTP, so the rider's own app scales it. .erg gives absolute watts for one athlete.

### 5.1 Structure

```
[COURSE HEADER]
VERSION = 2
UNITS = ENGLISH
DESCRIPTION = {asciiSafe(title)} for {athlete}, FTP {ftp} W
FILE NAME = {file name}
FTP = {ftp}                      (.erg only)
MINUTES PERCENT                  (.mrc)  or  MINUTES WATTS  (.erg)
[END COURSE HEADER]
[COURSE DATA]
{minutes}<TAB>{value}
…
[END COURSE DATA]
```

- `UNITS` describes distance units in course files. These files hold only minutes and power, so it has no effect. Laree writes `ENGLISH` because that is what trainer apps write and expect.
- Every step writes two rows: one at its start and one at its end. A flat step has the same value in both rows. A ramp has its start value, then its end value, and the app draws a straight line between them. Where one step ends and the next begins, two rows share the same time; that is how these formats draw a vertical edge. Rows are never merged.
- Repeat blocks are expanded.
- Minutes are cumulative from the start, computed from whole seconds and written with exactly two decimals. Rounding never accumulates, because each row is computed from the running total of seconds.
- .mrc values are percentages with two decimals. .erg values are whole watts.
- Columns are separated by one tab. Lines end with CRLF, including the last one. Step notes are not carried; the export menu says so in one line.

### 5.2 Example output: .mrc

`laree-amir-2026-11-10-threshold-4x8.mrc` (columns separated by a tab):

```
[COURSE HEADER]
VERSION = 2
UNITS = ENGLISH
DESCRIPTION = Threshold 4 x 8 for Amir, FTP 255 W
FILE NAME = laree-amir-2026-11-10-threshold-4x8.mrc
MINUTES PERCENT
[END COURSE HEADER]
[COURSE DATA]
0.00	50.00
15.00	75.00
15.00	97.50
23.00	97.50
23.00	55.00
26.00	55.00
26.00	97.50
34.00	97.50
34.00	55.00
37.00	55.00
37.00	97.50
45.00	97.50
45.00	55.00
48.00	55.00
48.00	97.50
56.00	97.50
56.00	55.00
59.00	55.00
59.00	65.00
69.00	45.00
[END COURSE DATA]
```

### 5.3 Example output: .erg

`laree-amir-2026-11-10-threshold-4x8.erg`:

```
[COURSE HEADER]
VERSION = 2
UNITS = ENGLISH
DESCRIPTION = Threshold 4 x 8 for Amir, FTP 255 W
FILE NAME = laree-amir-2026-11-10-threshold-4x8.erg
FTP = 255
MINUTES WATTS
[END COURSE HEADER]
[COURSE DATA]
0.00	128
15.00	191
15.00	249
23.00	249
23.00	140
26.00	140
26.00	249
34.00	249
34.00	140
37.00	140
37.00	249
45.00	249
45.00	140
48.00	140
48.00	249
56.00	249
56.00	140
59.00	140
59.00	166
69.00	115
[END COURSE DATA]
```

## 6. .fit workout

A FIT workout file is a structured workout a Garmin watch or bike computer can follow step by step, with alerts when the athlete drifts off target. Laree writes it with the `Encoder` from `@garmin/fitsdk` 21.221.0.

### 6.1 The Encoder API

The SDK's public API, checked against `node_modules/@garmin/fitsdk/src/index.d.ts`:

- `new Encoder()` creates an encoder. `writeMesg(mesg)` takes a message object that includes `mesgNum`; `onMesg(mesgNum, mesg)` is the same with the number passed separately. `close()` returns the finished file as a `Uint8Array`, with the 14-byte header and both CRCs written.
- Field names are camelCase, as the `Decoder` returns them. Enum fields take the profile's string values (`'workout'`, `'cycling'`, `'repeatUntilStepsCmplt'`).
- **The Encoder ignores subfields.** It writes only main fields. So Laree writes `durationValue`, `targetValue`, `customTargetValueLow` and `customTargetValueHigh` with raw numbers, never `durationTime` or `customTargetPowerLow`. Unknown fields are ignored too, so a typo fails silently; the check in section 6.6 catches it.
- `Profile.MesgNum.FILE_ID` is 0, `WORKOUT` is 26 and `WORKOUT_STEP` is 27.

```ts
export async function writeWorkoutFit(w: ResolvedWorkout, now: Date): Promise<Uint8Array> {
  const { Encoder, Profile } = await import('@garmin/fitsdk');
  const N = Profile.MesgNum;
  const enc = new Encoder();
  enc.writeMesg({ mesgNum: N.FILE_ID, type: 'workout', manufacturer: 'development',
                  product: 0, serialNumber: fnv1a32(w.id) || 1, timeCreated: now });
  enc.writeMesg({ mesgNum: N.WORKOUT, wktName: w.fitName, sport: w.fitSport,
                  subSport: w.fitSubSport, numValidSteps: w.fitSteps.length,
                  ...(w.fitDescription ? { wktDescription: w.fitDescription } : {}) });
  for (const step of w.fitSteps) enc.writeMesg({ mesgNum: N.WORKOUT_STEP, ...step });
  const bytes = enc.close();
  await verifyWorkoutFit(bytes, w);   // section 6.6; throws on any mismatch
  return bytes;
}
```

### 6.2 Messages

| Message | Field | Value |
|---|---|---|
| `file_id` | `type` | `'workout'` |
| | `manufacturer` | `'development'` (255) |
| | `product` | 0 |
| | `serialNumber` | 32-bit FNV-1a hash of the workout id; 1 if the hash is 0, because 0 is invalid for this type |
| | `timeCreated` | the export clock |
| `workout` | `wktName` | `asciiSafe(title)`, cut to 40 characters |
| | `sport`, `subSport` | bike: `'cycling'`, `'generic'` (`'indoorCycling'` when the session is marked indoor); run: `'running'`, `'generic'` (`'treadmill'` when marked); swim: `'swimming'`, `'lapSwimming'`; strength: `'training'`, `'strengthTraining'`; other: `'generic'`, `'generic'` |
| | `numValidSteps` | the number of `workout_step` messages, repeat steps included |
| | `wktDescription` | `asciiSafe(coach note)`, cut to 254 bytes; omitted when there is no note |
| | `poolLength`, `poolLengthUnit` | swims only: `25` and `'metric'` (Laree has no pool-length setting in phase 1; the Encoder applies the field's scale of 100) |
| `workout_step` | `messageIndex` | 0, 1, 2, … in order |
| | `wktStepName` | the step kind ("Warm-up", "Steady", "Interval", "Recovery", "Cool-down"); for open targets the target is added, as in "Interval, RPE 7" |
| | `notes` | `asciiSafe(step note)`, cut to 254 bytes; omitted when empty |
| | `intensity` | warm-up `'warmup'`; steady and interval `'active'`; recovery `'recovery'` (`'rest'` in a swim); cool-down `'cooldown'` |

Laree writes `'active'` rather than `'interval'` for hard steps, because older devices do not know the newer value.

### 6.3 Durations

| Laree step | `durationType` | `durationValue` (raw) |
|---|---|---|
| Time | `'time'` | milliseconds (the time subfield has a scale of 1,000), so 8 min is 480000 |
| Distance (run and swim only) | `'distance'` | centimetres (scale 100), so 400 m is 40000 |
| Until the lap button | `'open'` | omitted |

Laree's builder makes only time and distance steps. `'open'` is listed for completeness and is used by no current step.

### 6.4 Targets

`targetValue` is 0 for every custom target. 0 means "custom", and the watch then reads the custom low and high values.

| Basis | `targetType` | `customTargetValueLow` and `High` (raw) |
|---|---|---|
| Power | `'power'` | watts + 1000. In this field 0 to 1,000 means % of the FTP stored on the device, and anything above 1,000 means watts plus 1,000. Laree writes watts, because the device's FTP may be out of date. 242–255 W is written as 1242 and 1255 |
| Heart rate | `'heartRate'` | bpm + 100. 0 to 100 would mean % of the maximum heart rate stored on the device, which is not LTHR, so Laree writes bpm. 141–149 bpm is 241 and 249 |
| Pace | `'speed'` | mm/s (scale 1,000), low = slower. Danial at 95–100% of 3:58 /km is 3992 and 4202 |
| Swim, effort, or no basis | `'open'` | omitted. The target goes into the step name, for example "Interval, 1:43-1:48 /100 m" |

A repeat step carries no target type.

### 6.5 Repeat blocks

A repeat block becomes its children, followed by one repeat step:

| Field | Value |
|---|---|
| `durationType` | `'repeatUntilStepsCmplt'` |
| `durationValue` | the `messageIndex` of the block's first child |
| `targetValue` | the total number of times through the block (4 for "4 ×") |

The decoder shows these again as the subfields `durationStep` and `repeatSteps`.

### 6.6 Checking the file before download

Every .fit file is checked in the browser before it is handed over, and in the tests:

1. `Decoder.isFIT(Stream.fromByteArray(bytes))` is true.
2. `new Decoder(Stream.fromByteArray(bytes)).checkIntegrity()` is true. This checks the header and the file CRC.
3. `new Decoder(Stream.fromByteArray(bytes)).read()` returns no errors, one `fileIdMesgs` entry with type `'workout'`, one `workoutMesgs` entry, and as many `workoutStepMesgs` as were written.
4. Every main field written in each step decodes to the same value. The decoder also returns expanded subfields (`durationTime`, `customTargetPowerLow` and so on), which are ignored. Note that `customTargetPowerLow` keeps the raw 1,000 offset.

Use a fresh `Stream` for each call. If any check fails, nothing is downloaded and the error in section 12 appears.

### 6.7 Example: the sample workout as messages

The file is 414 bytes: a 14-byte header with ".FIT" at byte offset 8, 398 bytes of records, and a 2-byte CRC.

| # | Message | Fields written | What the device shows |
|---|---|---|---|
| 1 | `file_id` | `type 'workout'`, `manufacturer 'development'`, `product 0`, `serialNumber FNV_SERIAL`, `timeCreated 2026-11-08T02:00:00Z` | |
| 2 | `workout` | `wktName 'Threshold 4 x 8'`, `sport 'cycling'`, `subSport 'generic'`, `numValidSteps 5`, `wktDescription 'Even pacing. If interval 4 drops below 242 W, stop there.'` | Workout "Threshold 4 x 8" |
| 3 | `workout_step` | `messageIndex 0`, `wktStepName 'Warm-up'`, `durationType 'time'`, `durationValue 900000`, `targetType 'power'`, `targetValue 0`, `customTargetValueLow 1128`, `customTargetValueHigh 1191`, `intensity 'warmup'` | Warm-up, 15:00, 128-191 W |
| 4 | `workout_step` | `messageIndex 1`, `wktStepName 'Interval'`, `notes 'Seated. Cadence 90 or more.'`, `durationType 'time'`, `durationValue 480000`, `targetType 'power'`, `targetValue 0`, `customTargetValueLow 1242`, `customTargetValueHigh 1255`, `intensity 'active'` | Interval, 8:00, 242-255 W |
| 5 | `workout_step` | `messageIndex 2`, `wktStepName 'Recovery'`, `durationType 'time'`, `durationValue 180000`, `targetType 'power'`, `targetValue 0`, `customTargetValueLow 1128`, `customTargetValueHigh 1153`, `intensity 'recovery'` | Recovery, 3:00, 128-153 W |
| 6 | `workout_step` | `messageIndex 3`, `durationType 'repeatUntilStepsCmplt'`, `durationValue 1`, `targetValue 4` | Repeat steps 2 and 3, 4 times |
| 7 | `workout_step` | `messageIndex 4`, `wktStepName 'Cool-down'`, `durationType 'time'`, `durationValue 600000`, `targetType 'power'`, `targetValue 0`, `customTargetValueLow 1115`, `customTargetValueHigh 1166`, `intensity 'cooldown'` | Cool-down, 10:00, 115-166 W |

FIT has no ramp, so the warm-up and cool-down appear on the watch as bands (128–191 W and 115–166 W) rather than as ramps.

### 6.8 Getting the file onto a device

The export dialog shows these steps under the download button:

1. Connect the watch or bike computer to a computer with its USB cable.
2. Open the device's storage. On Windows it shows in File Explorer, as a drive or as a portable device. On a Mac, older Garmin devices mount as a drive; newer ones use MTP and need an MTP file app.
3. Copy the .fit file into the `GARMIN/NewFiles` folder.
4. Eject and unplug. The device imports the file and moves it to `GARMIN/Workouts`. The workout appears under Training, then Workouts.

Other brands handle workout files differently, and some do not accept them over USB at all. The dialog says so in one line and suggests .zwo for indoor rides.

## 7. .ics calendar

The calendar file follows RFC 5545. It is offered for one session (calendar session panel) or for a week (calendar toolbar: Export .ics).

### 7.1 Rules

- **Lines** end with CRLF, including the last line.
- **Folding.** A content line longer than 75 octets is folded: insert CRLF followed by one space. Count octets in UTF-8, not characters, and never split a multi-byte character. So a continuation line holds at most 74 octets after its leading space.
- **Escaping TEXT values** (SUMMARY, DESCRIPTION, X-WR-CALNAME and each CATEGORIES item): a backslash becomes `\\`, a semicolon `\;`, a comma `\,` and a line break `\n`. Colons are not escaped. Escape first, then fold.
- **Calendar.** `VERSION:2.0`, `PRODID:-//Laree//Laree prototype 0.1//EN`, `CALSCALE:GREGORIAN`, `METHOD:PUBLISH` and `X-WR-CALNAME:Laree · {athlete}`.
- **UID.** `{workoutId}@laree.app` for a session and `race.{raceId}@laree.app` for a race. UIDs never change, so importing a newer file updates the event in calendar apps that honour UIDs instead of adding a second copy.
- **DTSTAMP** is the export clock in UTC, for example `20261108T020000Z`.
- **SEQUENCE** is the session's revision number, which starts at 0 and goes up by 1 on every save.
- **Untimed sessions** (no `startMinute`) are all-day events: `DTSTART;VALUE=DATE:{day}` and `DTEND;VALUE=DATE:{next day}`, because the end date of an all-day event is exclusive. They carry `TRANSP:TRANSPARENT`, so the session does not show the athlete as busy all day.
- **Timed sessions** use local time with a time-zone id: `DTSTART;TZID=Asia/Kuala_Lumpur:{yyyymmdd}T{hhmmss}` and `DTEND` at the start plus the planned duration, rounded up to the whole minute. They carry `TRANSP:OPAQUE`. A file with any timed event includes one `VTIMEZONE` for Asia/Kuala_Lumpur (section 7.4), as RFC 5545 requires for every TZID used.
- **SUMMARY** is `{Sport} · {title} · {duration}`, with ` · key session` added for key sessions.
- **CATEGORIES** is `Laree,{Sport}`.
- **DESCRIPTION** is, line by line: the step summary (section 3.4); a totals line, `{duration} · Load {load} · planned at {threshold}`; `Coach: {note}` when there is a note; and `Open in Laree: {url}`. Step notes are left out.
- **URL** is the absolute link to the athlete's workout page, built from the page's own address so that it works under any base path: `new URL('./#/athlete/workout/' + id, location.href)`. Seeded sessions have the same id on every device. A session created on Coach's device does not exist on the athlete's device, so there the link lands on the not-found page.
- **A week** holds one VEVENT per planned session from Monday to Sunday, ordered by day and then by order, and one all-day VEVENT per race in that week. A race's SUMMARY is `{priority} race · {name} · {distances}`, for example `A race · Teluk Half · 1.9 / 90 / 21.1 km`. Rest days get no event.
- No VALARM is written. Reminders stay the calendar app's choice.

### 7.2 Example output: one untimed session

`laree-amir-2026-11-10-threshold-4x8.ics`:

```
ICS_EXAMPLE
```

### 7.3 The same session with a start time

With a start time of 06:30 (`startMinute` 390), the file gains a `VTIMEZONE` before the event, and three lines of the event change:

```
ICS_TIMED
```

### 7.4 The time-zone block

Malaysia has used UTC+8 all year since 1982 and has no daylight saving, so one STANDARD rule covers every date Laree can show. `TZNAME:+08` follows the IANA time-zone database, which no longer uses the abbreviation MYT.

## 8. Import pipeline and detection

### 8.1 Pipeline

1. The athlete opens the log sheet, chooses "Import file", and drops or picks a file. The picker has no `accept` filter, because phones grey out files with extensions they do not know. The drop zone lists the formats in words instead.
2. The sheet checks the size (section 8.3), then reads the file with `file.arrayBuffer()`.
3. The bytes go to a module worker (`src/io/import/worker.ts`) as a transferable buffer. The worker detects the format, loads the FIT SDK if needed, reads the file and returns one or more `ParsedActivity` objects with their streams. "Cancel" terminates the worker.
4. The main thread computes Load, time in zones and best efforts with the metrics engine, finds the matching planned session and shows the preview.
5. On Save, the summary goes to the app store and the streams go to IndexedDB (section 10.6).

The XML readers run in the worker too. `DOMParser` is not available in workers, so `xml.ts` is a small streaming reader: elements, attributes, text, CDATA, comments, processing instructions and the five predefined entities plus numeric character references. It skips DOCTYPE declarations and never fetches anything.

### 8.2 Detection by content

Detection looks only at the bytes. The file extension is used for nothing except the file name in messages.

| Check, in order | Test on the bytes | Result |
|---|---|---|
| 1 | Length is 0 | Error: empty |
| 2 | Starts with `1F 8B` | gzip. Decompress with `DecompressionStream('gzip')`, stopping at 40 MB, then run detection once more on the result. Strava's bulk export ships files as `.fit.gz`, `.gpx.gz` and `.tcx.gz` |
| 3 | Starts with `50 4B 03 04` | Error: zip archive |
| 4 | Byte 0 is 12 or 14, and bytes 8 to 11 are `2E 46 49 54` (".FIT") | FIT. `Decoder.isFIT()` makes the same check |
| 5 | Decodes as text (byte-order mark for UTF-8 or UTF-16, otherwise UTF-8) and, after leading whitespace, the XML declaration, comments, processing instructions and any DOCTYPE, the first element's local name is `gpx` | GPX |
| 6 | As above, with the first element's local name `TrainingCenterDatabase` | TCX |
| 7 | Anything else | Error: not supported (with a hint for PDF, images, KML and CSV where the bytes show them) |

Leading whitespace before the XML declaration is skipped on purpose: some TCX exports start with spaces, which strict XML parsers reject.

### 8.3 Limits

| Limit | Value | Why |
|---|---|---|
| File size | 40 MB, after gzip decompression | A 16-hour TCX at one point per second is about 29 MB. FIT files are much smaller |
| Timer time | 24 hours | Longer files are almost always two recordings joined |
| Activities in one file | 10 | Covers a triathlon with its legs, or a TCX holding several activities |
| Date | from the runtime start (day 0) up to now | The prototype shows 16 weeks of history and cannot place older sessions |

## 9. Reading files

### 9.1 What Laree extracts

| Laree field | FIT | GPX | TCX |
|---|---|---|---|
| Sport | `session.sport`, `session.subSport` | `trk/type` when present | `Activity@Sport` |
| Start time | `session.startTime` | first `trkpt/time` | `Activity/Id`, else the first `Lap@StartTime` |
| Timer time | `session.totalTimerTime` | elapsed time minus pauses | sum of `Lap/TotalTimeSeconds` |
| Elapsed time | `session.totalElapsedTime` | last time minus first time | last `Trackpoint/Time` minus the start |
| Distance | `session.totalDistance` | sum of point-to-point distances | last `Trackpoint/DistanceMeters`, else the sum of `Lap/DistanceMeters` |
| Elevation gain | `session.totalAscent`, else computed | computed from `ele` | computed from `AltitudeMeters` |
| Heart rate | `record.heartRate` | extension `hr` | `HeartRateBpm/Value` |
| Power | `record.power` | extension `power` or `PowerInWatts` | `Extensions/TPX/Watts` |
| Cadence | `record.cadence` plus `fractionalCadence` | extension `cad` | `Cadence`, or `Extensions/TPX/RunCadence` |
| Speed | `record.enhancedSpeed`, else `speed` | derived from distance | `Extensions/TPX/Speed`, else derived |
| Altitude | `record.enhancedAltitude`, else `altitude` | `ele` | `AltitudeMeters` |
| Position | `record.positionLat` and `positionLong` in semicircles; degrees = semicircles × 180 / 2³¹ | `trkpt@lat`, `trkpt@lon` | `Position/LatitudeDegrees`, `LongitudeDegrees` |
| Temperature | `record.temperature` | extension `atemp` | not present |
| Laps | `lap` messages | one lap for the whole file | `Lap` elements |
| Pauses | `event` messages with event `'timer'`: `'stop'` or `'stopAll'` pauses, `'start'` resumes | a gap of 20 s or more between points, and the gap between two `trkseg` | the gap between two `Track` elements in a lap, and a gap of 20 s or more between points |
| Weighted power | the session's weighted-power field (named `normalizedPower` in the FIT profile; the name never reaches the UI), used only when the file has no power stream | not present | not present |
| Device | `file_id` manufacturer and product, or `productName` | `gpx@creator` | `Creator/Name` |

Laree ignores any load or intensity score a device wrote into a file. It always computes Load itself (section 10.4).

### 9.2 FIT activities

- Decode with the default options: scale and offset applied, components and subfields expanded, heart rates merged into records, enums as strings and timestamps as `Date`.
- `fileIdMesgs[0].type` must be `'activity'`. `'workout'`, `'course'` and every other type give the matching error in section 12. A file with no `file_id` is damaged.
- If `checkIntegrity()` fails but `read()` still returns a session or records, the file was probably cut short (a flat battery, a crash). Laree imports what it can and shows the "cut short" notice. With nothing readable, the file is damaged.
- With no `session` message but with records, Laree builds the session from the records: start at the first record, timer time from the timer events.
- **Sport mapping.** `running` → run (`treadmill` sub-sport marks a treadmill run); `cycling` → bike (`indoorCycling` and `virtualActivity` mark an indoor ride); `swimming` → swim (`lapSwimming` = pool, `openWater` = open water); `training` with `strengthTraining` → strength; `transition` → skipped; everything else → other.
- **Multisport files** (a triathlon recorded as one activity) hold one session per leg. Each swim, bike and run session becomes its own activity, with the records inside its time window and a shared `groupId`. Transition sessions are left out and add no Load. Each leg matches its own planned session.
- **Pool swims** have little or no per-second distance. Distance and timer time come from the session, which the swim method needs (metrics section 2.4). Length messages are not stored in phase 1.
- `hrv` messages (beat-to-beat intervals) are ignored.

### 9.3 GPX

- Root element `gpx`, version 1.0 or 1.1. Points come from every `trk/trkseg/trkpt`, in document order. `rte` and `wpt` are ignored.
- A file whose track points have no `time`, or that has only routes and waypoints, is a planned route: error "no timestamps".
- **Extensions vary by app**, so the reader matches child elements of `trkpt/extensions` by local name and ignores the namespace prefix: `hr` or `heartrate` for heart rate, `cad` or `cadence` for cadence, `power`, `PowerInWatts` or `watts` for power, `atemp` or `temp` for temperature. This covers Garmin's TrackPointExtension (`gpxtpx:hr`, `gpxtpx:cad`, `gpxtpx:atemp`), the bare `<power>` element many apps write, and Garmin's PowerExtension.
- **Sport.** `trk/type` is matched in lower case: containing `run` → run; `bik`, `cycl` or `ride` → bike; `swim` → swim; `walk` or `hik` → other. Without a type, the sport comes from the session chosen in "Which session?", or the preview asks.
- **Times** are ISO 8601. A time without a zone is read as UTC, as the GPX schema says. Points are sorted by time, and duplicate times keep the last point.
- **Distance** is the sum of haversine distances between consecutive points, with an Earth radius of 6,371,008.8 m. A point that implies a speed over 50 m/s from the previous kept point is a GPS spike and is dropped.
- **Laps.** GPX has none, so the whole file is one lap.

### 9.4 TCX

- Root element `TrainingCenterDatabase` (namespace `http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2`). Each `Activities/Activity` becomes one activity.
- `Activity@Sport`: `Running` → run, `Biking` → bike, `Other` → the preview asks.
- Each `Lap` gives a lap: `StartTime`, `TotalTimeSeconds`, `DistanceMeters`, `AverageHeartRateBpm/Value`, `MaximumHeartRateBpm/Value`, and from `Extensions/LX` the `AvgWatts` and `AvgSpeed` when present.
- Each `Track/Trackpoint` gives a point: `Time`, `Position`, `AltitudeMeters`, `DistanceMeters` (cumulative), `HeartRateBpm/Value`, `Cadence`, and from `Extensions/TPX` (namespace `http://www.garmin.com/xmlschemas/ActivityExtension/v2`) the `Speed`, `Watts` and `RunCadence`. Extension elements are matched by local name, as in GPX.

## 10. From file to activity

### 10.1 The parsed result

```ts
interface ParsedActivity {
  format: 'fit' | 'gpx' | 'tcx';
  fileName: string;
  sport: Sport | null;              // null: the preview asks
  setting: 'indoor' | 'treadmill' | 'pool' | 'openWater' | null;
  startUtc: string;                 // ISO 8601
  timerSeconds: number;             // the file's own timer total when it has one
  elapsedSeconds: number;
  distanceM: number | null;
  ascentM: number | null;
  laps: Lap[];                      // startOffsetS (timer time), timerS, distanceM, avgHr, avgPowerW, avgSpeedMps
  summaryWeightedPowerW: number | null;   // only from a FIT session with no power stream
  device: string | null;
  groupId: string | null;           // legs of one multisport file
  streams: Streams | null;
  warnings: ImportWarning[];
}
```

### 10.2 Streams

The metrics engine expects 1 Hz arrays over timer time, one entry per recorded second, with paused seconds removed (metrics section 2.1). `streams.ts` builds them the same way for all three formats:

1. Sort the points by time and build the running intervals from the pause rules in section 9.1.
2. Join the running intervals into one timeline. Timer second `i` covers `[i, i + 1)` of that timeline. `n = round(timerSeconds)`.
3. **Instant channels** (power, heart rate, cadence, speed, temperature) have `n` entries. Entry `i` is the latest point at or before the start of second `i`, held for at most 10 s; after that the value is missing. Smart recording writes a point only every few seconds, which the hold covers.
4. **Cumulative channels** (distance and altitude) have `n + 1` entries, at `t = 0, 1, …, n`, interpolated linearly in time between neighbouring points and held flat before the first and after the last point. This is the shape the pace method needs (metrics section 2.3).
5. If the file's timer total and the timeline differ, the timeline is cut or padded at the end (missing values for instant channels, held values for cumulative ones).
6. **Run cadence** is stored in steps per minute. FIT and TCX count strides per minute on one foot, and so do many GPX files. If the median running cadence in a file is under 120, Laree doubles it.
7. **Running power** is dropped, because phase 1 has no running threshold for it (metrics section 2.2).
8. **The route trace** is the list of positions, thinned to at most 1,000 points by keeping every `k`th point and always the last one. It draws the plain line on the activity page; there are no map tiles.

```ts
interface Streams {
  v: 1;
  n: number;                        // timer seconds
  power?: Float32Array;             // length n, W, NaN = missing
  hr?: Float32Array;                // length n, bpm
  cadence?: Float32Array;           // length n, rpm on the bike, steps per minute on foot
  speed?: Float32Array;             // length n, m/s
  temperature?: Float32Array;       // length n, deg C
  distance?: Float32Array;          // length n + 1, cumulative m
  altitude?: Float32Array;          // length n + 1, m
  trace?: Float32Array;             // lat, lon pairs, at most 1,000 points
}
```

Cleaning (power above 2,500 W, heart rate outside 30 to 230 bpm and so on) is the engine's job, not the reader's (metrics section 2.1).

### 10.3 Summary metrics

The summary fields are the ones the information architecture lists (section 5.1):

- **Duration** is timer time. **Moving time** counts the timer seconds with a speed of at least 0.5 m/s on foot or 1 m/s on the bike. A pool swim's moving time is its timer time. A file with no speed or distance has moving time equal to timer time.
- **Distance** as in section 9.1. **Average speed** is distance divided by timer time, the same basis the pace method uses.
- **Elevation gain**, when the file does not state it, uses a 3 m threshold so that GPS and barometer noise does not add up: start with `ref` = the first altitude; for each later altitude `h`, if `h − ref ≥ 3`, add `h − ref` to the gain and set `ref = h`; if `ref − h ≥ 3`, set `ref = h`.
- **Average and maximum heart rate, average power and cadence** are means over the seconds that have a reading. **Weighted power** and **Intensity** come from the Load calculation.
- **Temperature**: the average, shown when the file has it (design brief, open question 7).

### 10.4 Load

The importer passes the summary, the streams and the athlete's thresholds for the activity's day to the metrics engine. Load follows the cascade in `docs/spec/metrics.md` section 2, and the result keeps its method and confidence. Time in zones (metrics section 6.6) and best efforts (section 8.3) are computed at the same moment and stored in the summary.

The preview states what was missing and which method that leaves, in the words of the screen inventory. For example: "No heart rate or power in this file. Load 54 · from pace, medium confidence." The preview also asks for an optional effort (RPE 1 to 10), which the cascade uses when no stream method applies.

### 10.5 Day, time and matching

- The start time is converted to Asia/Kuala_Lumpur (UTC+8). The activity's `day` is days since the runtime start and its `startMinute` is minutes after local midnight (metrics section 1.3). A session recorded abroad is still placed by Kuala Lumpur time in phase 1.
- Matching follows metrics section 7.1. When the athlete picked a session in "Which session?", that choice wins if the sport agrees. If the picked session is on another day, the preview says so and offers to move it to the file's day, which is what Coach's drag in the calendar does.
- **Duplicates.** A file whose sport matches an existing activity of the same athlete that starts within 60 s is a duplicate. The preview names it and offers to open it instead.
- **Replacing a quick log.** If the chosen session is already matched by a quick log, saving the file replaces the quick log's numbers and keeps its effort and note. The file has more detail, so it wins.

### 10.6 Storing what was read

- The summary (with Load, method, confidence, time in zones, best efforts and laps) is saved in the app store with the rest of the athlete's data, under the `laree:v1` key.
- The streams are saved in IndexedDB, database `laree:v1:streams`, object store `streams`, keyed by activity id. A two-hour ride with five channels takes about 150 KB. They let the activity page draw its charts, and they let a threshold change recompute Load, zones and best efforts from the effective day onward (metrics section 1.4).
- The original file is not kept.
- If IndexedDB is unavailable or full, the summary is still saved and the notice in section 12 appears. A threshold change then recomputes that activity from its summary values.
- Deleting an activity deletes its streams once the Undo toast has closed. Reset (`#/reset`) deletes the whole database along with the store.

## 11. Privacy

- In the prototype, files are read on the device and never uploaded. Exports are built on the device and handed straight to the browser. There is no server to send them to.
- Imported data stays in the browser that imported it: the summary in local storage, the streams in IndexedDB. Clearing the site's data, or Reset, removes it.
- GPS positions can reveal where someone lives. The prototype keeps only a thinned trace for the plain route line. Privacy zones that hide the start and end of a route, and the rules for uploading files, belong to the MVP and Malaysia's Personal Data Protection Act (see the roadmap).
- Export files contain the athlete's first name and thresholds (in .zwo, .erg and .ics descriptions). The export dialog says so in one line, since these files are often forwarded in chats.
- The import screen carries the prototype note from the design brief: data stays on this device, and Reset removes it.

## 12. Errors and notices

Messages use the file name in curly quotes and end with what to do next.

### 12.1 Import errors (the file is not imported)

| Code | When | Message |
|---|---|---|
| `too-large` | Over 40 MB | "“{name}” is {size} MB. Laree can read files up to 40 MB. Exporting it as .FIT gives a much smaller file." |
| `empty` | 0 bytes | "“{name}” is empty. Export it again from your watch or app." |
| `zip` | A zip archive | "“{name}” is a zip archive. Unzip it first, then import the .FIT, .GPX or .TCX file inside." |
| `not-supported` | No format matched | "Laree can't read “{name}”. Choose a .FIT, .GPX or .TCX file from your watch, bike computer or training app." |
| `fit-workout` | FIT `file_id.type` is `workout` | "“{name}” is a planned workout, not a recorded session. Import the file your device saved after you trained." |
| `fit-course` | FIT type `course` | "“{name}” is a course, which is a planned route, not a recorded session." |
| `fit-other` | Any other FIT type | "“{name}” is a .FIT file, but it holds device data, not a recorded session." |
| `damaged` | Unreadable, or a CRC failure with nothing readable | "“{name}” is damaged, so Laree can't read it. Export it again from your watch or app, or use Quick log." |
| `no-timestamps` | GPX points without times, or only routes | "“{name}” has no times on its points. It looks like a planned route, not a recorded session." |
| `no-data` | No points, laps or session | "“{name}” has no recorded data in it." |
| `too-long` | Timer time over 24 hours | "“{name}” runs for more than 24 hours. Laree can't import it. If two recordings were joined, export them separately." |
| `future` | Starts after now | "This session starts on Fri 13 Nov 2026, which hasn't happened yet. Check the date and time zone on your device." |
| `too-old` | Starts before the runtime start | "This session is from 3 Mar 2026. The prototype keeps 16 weeks, from 13 Jul 2026, so it can't place it." |
| `duplicate` | Same sport, start within 60 s | "You already have this session: Bike, Tue 10 Nov, 07:02." Action: "Open it" |
| `read-failed` | The worker crashed or ran out of memory | "Something went wrong while reading “{name}”. Nothing was saved. Try again, or use Quick log." |

### 12.2 Import notices (the file is imported)

| Code | When | Message |
|---|---|---|
| `cut-short` | CRC failed, data read | "This file looks cut short, perhaps because the device switched off. Laree read the first 1 h 12 min." |
| `multisport` | More than one leg | "This file holds 3 sessions: swim, bike and run. Laree saves each one on its own. Transitions are left out." |
| `ask-sport` | Sport unknown | "The file doesn't say which sport this was. Choose one." (the sport field is focused) |
| `missing-data` | No heart rate, power or pace | "No heart rate or power in this file. Load {n} · from {method}, {confidence} confidence." |
| `short` | Under 60 s of timer time | "This session is under a minute long, so it adds no load." |
| `other-day` | The chosen session is on another day | "You picked Tuesday's session, but this file is from Wed 11 Nov. Move the session to Wednesday and match it?" |
| `no-detail-saved` | IndexedDB failed | "Saved without detail data, because this browser wouldn't store it. Charts for this session won't be available." |

### 12.3 Export messages

| Code | When | Message |
|---|---|---|
| `fit-check-failed` | The check in section 6.6 failed | "Laree couldn't build a valid .fit file for this workout. Nothing was downloaded." The details go to the console |
| `downloaded` | Success | "Downloaded {file name}." |
| Disabled reasons | The format does not fit | As in section 3.1 |

## 13. Tests

- **Golden files.** `src/io/export/__fixtures__/` holds the sample workout and the expected `.zwo`, `.mrc`, `.erg` and `.ics` (untimed and timed) files from sections 4, 5 and 7, byte for byte, CRLF included. The tests inject the export clock and the runtime start.
- **FIT.** Encode the sample, run every check in section 6.6, compare the decoded messages with the table in section 6.7, and snapshot the length (414 bytes). Also cover a run with pace targets and distance steps, a swim with open targets and a pool length, a heart-rate workout, a workout with no notes, and a 51-step workout, which must be refused.
- **Text helpers.** `asciiSafe`, `slug`, XML escaping, ICS escaping, and ICS folding: no line over 75 octets, no split multi-byte character, and unfolding gives back the original line.
- **Detection.** Each format with a misleading extension; gzip around each format; zip; a PDF renamed to .fit; an empty file; a UTF-16 GPX; a TCX with leading spaces; a FIT workout file.
- **Readers.** FIT activity fixtures are written in the test with the SDK's `Encoder`, so no third-party files sit in the repo: a ride with power, a run with pauses, a pool swim, a triathlon with transitions, and a file with its CRC broken. GPX and TCX fixtures are short hand-written files covering Garmin extensions, bare `<power>`, a route-only GPX and a TCX with two `Track` elements in one lap.
- **Streams.** Lengths `n` and `n + 1`; pause removal; the 10 s hold; padding to the file's timer total; run-cadence doubling; trace thinning.
- **Load.** An imported ride, run and swim give the same Load as the metrics engine's known answers for the same data.
