# Metrics

Build spec for the metrics engine in `src/domain`. It defines how Laree turns sessions into Load, how Load becomes Fitness, Fatigue, Form and Ramp, and how zones, compliance and best efforts work. An engineer should be able to implement every function from this page alone. Tests use the worked examples and the test vectors in section 10 as known answers.

Every number on this page was computed with a script, not by hand. Where a value is rounded for the page, the test tolerance says how far an implementation may differ.

The method belongs to a well-known family of training models; the note at the end explains how Laree's names relate to the names other tools use.[^names]

## Contents

1. Conventions
2. Session load
3. Planned load
4. Fitness, Fatigue, Form and Ramp
5. Form bands
6. Zones and the polarisation index
7. Compliance
8. Best efforts
9. Display and rounding
10. Test vectors

## 1. Conventions

### 1.1 Words

These are the only names the UI uses for these ideas.

| UI word | What it means | Unit |
|---|---|---|
| Load | The training load of one session, or the sum for a day or a week. One hour at threshold is 100. | points |
| Fitness | The 42-day exponentially weighted average of daily load. | points per day |
| Fatigue | The 7-day exponentially weighted average of daily load. | points per day |
| Form | Yesterday's fitness minus yesterday's fatigue. | points |
| Ramp | Fitness today minus fitness 7 days ago. | points per week |
| Weighted power | The fourth-power average of 30-second rolling power. It reflects how hard a variable ride felt. | W |
| Intensity | Weighted power divided by FTP on the bike; graded speed divided by threshold speed on the run; speed divided by CSS speed in the pool. | ratio, shown to 2 decimal places |
| Threshold | The effort an athlete can hold for about an hour: FTP on the bike, threshold pace on the run, CSS in the pool, LTHR for heart rate. | W, s per km, s per 100 m, bpm |

### 1.2 Units inside the engine

The engine works in SI units: seconds, metres, metres per second, watts and beats per minute. Pace is always stored as speed. Conversion to minutes per kilometre, kilometres per hour and so on happens only at display time (section 9).

### 1.3 Time

- Day 0 is the Monday of history week 1, called the runtime start. It sits 16 weeks before the current week, so the demo always looks current.
- Week `w` (counted from 1) covers days `7(w − 1)` to `7(w − 1) + 6`. The current week is week 17, which covers days 112 to 118.
- All times are local time in Asia/Kuala_Lumpur (UTC+8, no daylight saving). An activity belongs to the day on which it starts, even if it runs past midnight.
- An activity carries `day` and `startMinute` (minutes after local midnight). A planned workout carries `day`, its `order` within that day, and an optional `startMinute`.

### 1.4 Thresholds have history

Each threshold (FTP, threshold run pace, CSS, LTHR and resting heart rate) is a list of values, each with an `effectiveFromDay`. A calculation for an activity on day `d` uses the latest value whose `effectiveFromDay` is on or before `d`.

When the coach saves a new value, loads from its effective day onwards are recomputed. Loads before that day are never touched. For example, Amir's FTP rises from 245 W to 255 W in history week 9: rides before the effective day keep the loads they got with 245 W.

### 1.5 Numbers

- Keep full double precision through every calculation. Round only for display, and for the band and rule comparisons that say so.
- `roundHalfAway(x, dp)` rounds half away from zero, so 2.5 becomes 3 and −2.5 becomes −3. JavaScript's `Math.round` turns −2.5 into −2, so wrap it: `Math.sign(x) * Math.round(Math.abs(x) * 10 ** dp) / 10 ** dp`.
- Zone edges are stored as integer percentages. Multiply before you divide: compute `(pct * threshold) / 100` and `(100 * done) / planned`. Written this way, edges such as 120% of 245 W come out exact (294 W), while `1.2 * 245` style arithmetic can land a hair either side.

### 1.6 Where the code lives

| Module | Contents |
|---|---|
| `src/domain/metrics.ts` | session load, planned load, fitness, zones, polarisation, best efforts, compliance |
| `src/domain/gamification.ts` | streaks, badges and the track lap (see `docs/spec/gamification.md`) |
| `src/domain/types.ts` | the shared types below |

```ts
type Sport = 'swim' | 'bike' | 'run' | 'strength' | 'other';
type LoadMethod = 'power' | 'pace' | 'swim' | 'heartRate' | 'effort' | 'duration';
type Confidence = 'high' | 'medium' | 'low';

interface LoadResult {
  load: number;               // full precision; the UI rounds
  method: LoadMethod;
  confidence: Confidence;
  intensity: number | null;   // power, pace and swim methods only
  weightedPowerW?: number;    // power method only
  gradedSpeedMps?: number;    // pace method only
}
```

## 2. Session load

### 2.1 The cascade

Every completed activity gets exactly one load. The engine tries six methods in a fixed order. The first method whose needs are met produces the load, and later methods are not run.

| Order | Method | Sports | Needs | Confidence |
|---|---|---|---|---|
| 1 | Power (`power`) | bike, indoor included | FTP in force, and either a power stream with readings on at least 80% of timer seconds, or a weighted power in the activity summary | high |
| 2 | Run pace (`pace`) | run, treadmill included | threshold pace in force, distance of at least 100 m | high with an altitude stream or on a treadmill; medium outdoors without altitude |
| 3 | Swim pace (`swim`) | swim | CSS in force, distance of at least 25 m | medium in a pool; low in open water |
| 4 | Heart rate (`heartRate`) | any | LTHR and resting heart rate in force, LTHR at least 20 bpm above resting, and a heart-rate stream with readings on at least 80% of timer seconds | medium |
| 5 | Session effort (`effort`) | any | an RPE from 0 to 10 | medium |
| 6 | Duration only (`duration`) | any | timer time | low |

Rules that apply to every method:

1. **Hours means timer time.** "Hours" in every formula is timer time divided by 3,600: the recording time with paused time removed. Stops with the recording still running count.
2. **Streams beat summaries.** If an activity has a stream, only the stream decides whether a method has enough data. Summary values (for example a weighted power written by the head unit) are used only when there is no stream.
3. **Implausible pace is a data error.** If the pace or swim method returns an intensity above 1.5, the activity was probably saved as the wrong sport (a ride saved as a run, say). The method fails and the cascade moves on.
4. **Very short activities score nothing.** An activity with under 60 s of timer time gets load 0, method `duration`, confidence low.
5. **One threshold per day.** Every method uses the thresholds in force on the activity's day (section 1.4). A missing threshold makes that method fail.

Streams reach the engine as 1 Hz arrays over timer time, one entry per recorded second, with paused seconds already removed by the importer. Before any method runs, the engine cleans them:

- power below 0 W or above 2,500 W becomes missing;
- heart rate below 30 bpm or above 230 bpm becomes missing;
- running speed above 12 m/s becomes missing, and gaps in cumulative distance are filled by linear interpolation between the neighbouring readings.

The UI shows confidence plainly. A high-confidence load is a bare number: "Load 97". A medium one names its source: "Load 54 · from effort". A low one adds the word rough: "Load 56 · rough, from duration only".

The seed generator computes the load of every mock activity with these same functions, on the stream it generates for that activity, and stores the result in the summary.

### 2.2 Power

**Formula.**

1. Let `p_i` be the power in second `i`, for `i = 0 … n − 1`, where `n` is timer seconds. A missing reading counts as 0 W.
2. Take the 30-second rolling mean over full windows only: `m_i = (p_(i−29) + … + p_i) / 30` for `i = 29 … n − 1`. That gives `n − 29` values.
3. Weighted power: `WP = (mean of m_i^4) ^ (1/4)`.
4. Intensity: `I = WP / FTP`.
5. Load: `hours × I² × 100`.

With no stream but a weighted power in the summary (from the device file or the seed), use that value as `WP` and continue from step 4.

**Edge cases.**

- Fewer than 30 samples means there is no weighted power. Such an activity is under 60 s and scores 0 by rule 4 anyway.
- Coasting and sensor drop-outs both count as 0 W. Head units already record coasting as 0 W, and the 80% coverage rule keeps long drop-outs out.
- Power from running footpods is ignored in phase 1, because running power needs its own threshold. Runs go to the pace method.

**Worked examples.**

1. **One hour at threshold.** Amir (FTP 245 W) rides 60 min at a steady 245 W. `WP` = 245 W, `I` = 1.00, load = 1 × 1² × 100 = **100**.
2. **Half an hour at 0.8.** He rides 30 min at a steady 196 W. `I` = 196 / 245 = 0.80, load = 0.5 × 0.64 × 100 = **32**.
3. **Intervals.** Irfan (FTP 280 W) rides 72 min: 15 min at 180 W, then 4 × (8 min at 300 W + 4 min at 160 W), then 9 min at 150 W. Average power is 225.14 W. `WP` = 251.36 W, `I` = 0.8977, load = 1.2 × 0.8977² × 100 = 96.71, shown as **97**.
4. **After a threshold change.** The ride in example 1, ridden after Amir's FTP rises to 255 W: `I` = 245 / 255 = 0.9608, load = 92.31, shown as **92**.

### 2.3 Run pace, adjusted for gradient

Running uphill costs more than running on the flat at the same speed, and gentle downhill costs less. Laree converts each second of running to the flat speed that would cost the same energy, using the energy cost of running on gradients measured by Minetti and colleagues (2002).

**Grade adjustment.**

- Energy cost, in joules per kilogram per metre, at gradient `g` (a fraction, so 0.06 is 6% uphill):
  `C(g) = 155.4g⁵ − 30.4g⁴ − 43.3g³ + 46.3g² + 19.5g + 3.6`
- `g` is clamped to the range −0.45 to +0.45, the range measured in the study.
- Grade factor: `f(g) = C(g) / 3.6`. On the flat, `f` = 1.

| Gradient | −20% | −10% | −6% | −3% | 0% | +3% | +6% | +10% | +20% |
|---|---|---|---|---|---|---|---|---|---|
| Factor `f(g)` | 0.500 | 0.598 | 0.724 | 0.849 | 1.000 | 1.174 | 1.369 | 1.658 | 2.502 |

The cost is lowest at about −18% (factor 0.495) and rises again on steeper descents, because braking costs energy.

**Formula with streams.**

1. Distance `d_t` (cumulative metres) and altitude `h_t` (metres) are sampled at `t = 0, 1, …, n`, so `n + 1` readings cover `n` timer seconds.
2. For each second `t ≥ 1`, find the latest earlier reading `j` with `d_t − d_j ≥ 50` m. The gradient is `g_t = (h_t − h_j) / (d_t − d_j)`. If no such reading exists yet (the first 50 m), `g_t = 0`.
3. Graded distance: `D_g = Σ (d_t − d_(t−1)) × f(g_t)` over `t = 1 … n`.
4. Graded speed: `v_g = D_g / n`.
5. Threshold speed: `v_t = 1000 / threshold pace`, with threshold pace in seconds per kilometre.
6. Intensity: `I = v_g / v_t`. Load: `hours × I² × 100`.

**Without altitude.** Every `g_t` is 0, so `v_g` is plain distance divided by timer time. Confidence is high on a treadmill (flat by definition) and medium outdoors.

**From a summary only.** `v_g` is distance divided by timer time, with the same confidence rule. If the importer stored a graded distance, use it, with high confidence.

**Edge cases.**

- The method averages graded speed rather than weighting hard seconds more. Interval sessions therefore score a little lower than the same session would by power. That is accepted for phase 1.
- The 50 m window smooths GPS altitude noise. It lags 50 m behind every change of gradient, which shifts the result slightly from a by-segment hand calculation (example 2).
- Treadmill incline is rarely recorded in files, so treadmill runs count as flat.

**Worked examples.** Amir's threshold pace is 4:25 /km (265 s), so `v_t` = 1000 / 265 = 3.7736 m/s.

1. **Flat 10 km.** 10,000 m in 50:00 (3,000 s), no altitude stream. `v_g` = 3.3333 m/s, `I` = 0.8833, load = (3,000 / 3,600) × 0.8833² × 100 = 65.02, shown as **65**, confidence medium.
2. **Hill run with streams.** 2,000 m flat in 600 s, then 1,000 m at +6% in 360 s, then 1,000 m at −6% in 270 s: 4,000 m in 1,230 s, climbing 60 m and descending 60 m, with the gradient constant within each part. With the 50 m window, `D_g` = 4,096.76 m and `v_g` = 3.3307 m/s. That is a graded pace of 5:00 /km against an actual 5:08 /km. `I` = 0.8826 and load = 26.62, shown as **27**, confidence high.
   - By whole segments, ignoring the window, the graded distance would be 2,000 + 1,000 × 1.3686 + 1,000 × 0.7238 = 4,092.38 m and the load 26.56.
   - With no altitude at all, the same run gives `I` = 0.8618 and load 25.37.

### 2.4 Swim

**Formula.**

1. Speed: `v = distance / timer seconds`. Rest at the wall is included.
2. CSS speed: `v_css = 100 / CSS`, with CSS in seconds per 100 m.
3. Intensity: `I = v / v_css`.
4. Load: `hours × I³ × 100`.

The cube reflects that the power needed to swim rises steeply with speed, so a small rise in pace costs a lot more.

**Edge cases.**

- Open-water distance comes from GPS and is often wrong, so open-water swims get low confidence.
- Because rest counts, hard sets with long rests score low. Ten 100 m repeats on a 2:00 turnaround make 1,000 m in 20:00, so `I` = 0.90 and load = 24.3, whatever pace the repeats were swum at. That is accepted for phase 1.
- Drills and kick sets count as swimming.

**Worked example.** Amir's CSS is 1:48 /100 m (108 s), so `v_css` = 0.9259 m/s. They swim 2,000 m in 40:00. `v` = 0.8333 m/s, `I` = 0.900, load = (2,400 / 3,600) × 0.9³ × 100 = 48.6, shown as **49**, confidence medium.

### 2.5 Heart rate

Banister's training impulse (TRIMP) weights each minute by a heart-rate fraction multiplied by an exponential. Laree keeps that shape but measures the fraction against threshold rather than maximum heart rate, because Laree does not ask athletes for a maximum.

**Formula.**

1. Heart-rate fraction for second `i`: `r_i = max(0, (HR_i − HR_rest) / (LTHR − HR_rest))`. So `r` = 0 at resting heart rate and 1 at LTHR.
2. Weight: `w(r) = r × e^(b(r − 1))`, with `b = 1`.
3. Load: `(100 / 3600) × Σ w(r_i) × (timer seconds / seconds with a reading)`, summing over the seconds that have a reading. Missing seconds take the session's average weight.

One hour at LTHR gives `r` = 1, `w` = 1 and load **100**.

**Why `b` = 1.** With `b` = 1 the curve matches the power formula (`I²`) in value and slope at threshold. It stays within 3% of `r²` for `r` between 0.8 and 1.1 and reads a little higher for easy work (12% higher at `r` = 0.6). Banister's original constant, 1.92, was fitted to a fraction of maximum heart rate. Used on this fraction, it would score an easy hour about a quarter lower than the power method scores the same hour, so an athlete's fitness would dip whenever the power meter stayed at home.

**Edge cases.**

- Heat, dehydration and long sessions raise heart rate at the same effort, so hot-day loads from heart rate read high. Kuala Lumpur afternoons make this common.
- Heart rate lags behind short efforts and under-reads heavy lifting. Strength sessions with heart rate still use this method.
- If LTHR is less than 20 bpm above resting heart rate, the thresholds are probably wrong. The method fails.

**Worked examples.** Amir: resting heart rate 48 bpm, LTHR 166 bpm.

1. **One hour at LTHR:** load **100**.
2. **One hour at 136 bpm:** `r` = 88 / 118 = 0.7458, `w` = 0.7458 × e^(−0.2542) = 0.5783, load 57.83, shown as **58**.
3. **Thirty minutes at 130 bpm, then thirty at 160 bpm:** load 70.71. A steady hour at 145 bpm, the same average, gives 68.80. The exponential gives the harder half a little more weight.

### 2.6 Session effort (RPE)

**Formula.** `load = minutes × RPE × k`, with minutes = timer seconds / 60 and RPE on the 0 to 10 scale (Borg CR10). The constant `k` makes one hour at RPE 7 worth 100:

`k = 100 / (60 × 7) = 5/21 ≈ 0.238095`

**Edge cases.**

- RPE 0 gives load 0.
- The quick log asks for whole numbers. Imported decimals (for example 6.5) are used as they are.
- No RPE means the method is skipped.
- Editing the RPE later recalculates the load only if effort is the method in use.

**Worked examples.** 60 min at RPE 7 = **100**. 45 min at RPE 5 = 53.57, shown as **54**. 90 min at RPE 3 = 64.29, shown as **64**.

### 2.7 Duration only

**Formula.** `load = hours × I_default² × 100`, using the square for every sport, swimming included.

| Sport | Default intensity | Load per hour |
|---|---|---|
| run | 0.75 | 56.25 |
| bike | 0.65 | 42.25 |
| swim | 0.75 | 56.25 |
| strength | 0.60 | 36 |
| other (walk, yoga, mobility) | 0.50 | 25 |

**Worked examples.** A 60 min run with no other data: 56.25, shown as **56**, labelled rough. A 45 min strength session with no other data: **27**.

## 3. Planned load

Every planned workout needs a planned load, for compliance (section 7), the fitness projection (section 4) and the track lap (`docs/spec/gamification.md`). The workout builder computes it from the steps. The formulas mirror the session methods, so riding the plan exactly scores close to the plan.

### 3.1 Steps

- Expand repeat blocks first: `n × (child steps)` becomes the child steps `n` times.
- Each workout has one target basis: power (% FTP), pace (% threshold speed), swim (% CSS speed), heart rate (% LTHR) or effort (RPE). The builder enforces this.
- "% threshold pace" in the object model means percent of threshold *speed*. 105% is faster than threshold. The athlete sees the resulting pace, not the percentage.
- Each step's intensity `I_s` is the midpoint of its target range: a step at 95–100% FTP has `I_s` = 0.975.
- A step with no target takes the default for its kind and the workout's basis:

| Step kind | Power or pace (% threshold) | Swim (% CSS) | Heart rate (% LTHR) | Effort (RPE) |
|---|---|---|---|---|
| warm-up | 60 | 75 | 75 | 3 |
| steady | 70 | 85 | 85 | 4 |
| interval | 95 | 100 | 97 | 7 |
| recovery | 50 | 70 | 70 | 2 |
| cool-down | 55 | 70 | 72 | 2 |

- Time steps use their duration `t_s`. Distance steps are allowed only for run (pace basis) and swim (swim basis). Their duration is `t_s = distance / (I_s × v_threshold)`, where `v_threshold` is threshold speed or CSS speed.
- Planned duration `T = Σ t_s`.
- Planned distance is the sum of the step distances. On the pace and swim bases, time steps add `t_s × I_s × v_threshold`. On other bases a time step has no known distance, so the planned distance is empty unless the coach types one.

### 3.2 Load by basis

| Basis | Planned load |
|---|---|
| Power | `I_w = (Σ t_s × I_s⁴ / T) ^ (1/4)`, then `load = (T / 3600) × I_w² × 100` |
| Pace | `Ī = Σ t_s × I_s / T`, then `load = (T / 3600) × Ī² × 100` |
| Swim | `Ī = Σ t_s × I_s / T`, then `load = (T / 3600) × Ī³ × 100` |
| Heart rate | `r_s = (I_s × LTHR − HR_rest) / (LTHR − HR_rest)`, then `load = 100 × Σ (t_s / 3600) × r_s × e^(r_s − 1)` |
| Effort | `load = Σ (t_s / 60) × RPE_s × 5/21` |

Each planned workout records where its load came from in `loadSource`:

- `steps` if at least one step has a target;
- `default` if no step has a target, or the workout has no steps.

A workout with no steps gets its load from the duration-only rule (section 2.7) applied to its planned duration. If it has only a distance, its duration is first set to distance divided by a default speed: 80% of threshold speed for runs, 90% of CSS speed for swims, and 7.5 m/s (27 km/h) for rides.

### 3.3 Worked examples

**Power basis.** Irfan (FTP 280 W) is planned 15 min warm-up at 55–65%, then 4 × (8 min at 95–100% + 4 min at 50–60%), then 10 min cool-down at 50–60%.

- `T` = 4,380 s (73 min).
- `I_w` = 0.8215, a planned weighted power of 230.0 W.
- Planned load = 1.2167 × 0.8215² × 100 = 82.10, shown as **82**.
- A plain per-step sum of `I_s²` would give 72.81. That under-states the plan, which is why the power basis uses the fourth-power average.
- Riding the plan exactly at the midpoint watts scores 81.79 by the power method. The 30-second smoothing rounds off the step edges, so the plan and the ride differ by under 0.4%.
- Irfan actually rode it as example 3 in section 2.2, with harder intervals and a shorter cool-down: 96.71 / 82.10 = 117.8% of plan, which is **On plan** (section 7).

**Pace basis.** Danial (threshold pace 3:58 /km) is planned 10 min at 70% of threshold speed, then 5 × (4 min at 105% + 2 min at 65%), then 10 min at 65%.

- `T` = 3,000 s (50 min).
- `Ī` = (600 × 0.70 + 5 × (240 × 1.05 + 120 × 0.65) + 600 × 0.65) / 3,000 = 2,460 / 3,000 = 0.82.
- Planned load = (3,000 / 3,600) × 0.82² × 100 = 56.03, shown as **56**.
- The 105% reps run at 3:47 /km and the 70% warm-up at 5:40 /km.

## 4. Fitness, Fatigue, Form and Ramp

### 4.1 Daily load

`L(t)` is the sum of the full-precision loads of all activities that start on day `t`. A day with no activities has `L(t) = 0`.

### 4.2 Recurrence

Laree uses the `1/τ` form of an exponentially weighted average:

- `Fitness(t) = Fitness(t − 1) + (L(t) − Fitness(t − 1)) / 42`
- `Fatigue(t) = Fatigue(t − 1) + (L(t) − Fatigue(t − 1)) / 7`

This is the form most coaching tools use, so the numbers will look familiar to coaches.

**Initial value.** `Fitness(−1) = startFitness` and `Fatigue(−1) = startFatigue`, both stored on the athlete and both 0 by default. Any day before day −1 also uses these starting values. The seed sets both to the athlete's mean daily load over history week 1 (the week's total load divided by 7). The chart then opens level instead of with a false climb, and Form starts at 0.

### 4.3 Form and Ramp

- `Form(t) = Fitness(t − 1) − Fatigue(t − 1)`. Today's sessions do not change today's form; they show up tomorrow. The lag is deliberate: Form answers "how fresh were you when the day began?"
- `Ramp(t) = Fitness(t) − Fitness(t − 7)`, in points per week. For `t < 7`, `Fitness(t − 7)` is the starting value.

### 4.4 Projection

The fitness chart continues past today using the plan:

- Days before today use actual loads. A missed workout adds nothing.
- Today uses the loads completed so far plus the planned load of today's open (unmatched) workouts.
- Each future day uses the summed planned load of its planned workouts, up to the last planned day. Nothing is drawn beyond it.
- The projection is drawn dashed. Projected Form on each race day appears next to the race, with its band (section 5).

### 4.5 Recalculation

Recompute from the earliest affected day whenever an activity is added, edited or deleted, or a threshold is saved with an effective day in the past. The projection is recomputed whenever the plan changes.

### 4.6 Worked examples

**One session, then rest (the one-day form lag).** Starting values 0 and 0. Day 0 has load 100; days 1 and 2 have none.

| Day | Load | Fitness | Fatigue | Form |
|---|---|---|---|---|
| 0 | 100 | 2.381 | 14.286 | 0.000 |
| 1 | 0 | 2.324 | 12.245 | −11.905 |
| 2 | 0 | 2.269 | 10.496 | −9.921 |

Form on day 0 is still 0: the session counts from day 1, where Form is −11.905, shown as −12.

**A steady block.** Starting values 0, then 100 every day for 42 days (days 0 to 41):

- `Fatigue(6)` = 66.01.
- `Fitness(41)` = 100 × (1 − (41/42)^42) = 63.65.
- `Fatigue(41)` = 99.85, `Form(41)` = −37.05 and `Ramp(41)` = 6.68.

**Two weeks with a projection.** Starting values 50 and 50. Today is day 10. Days 11 to 13 are projected from planned load. Values are to 2 decimal places; the UI shows Fitness, Fatigue and Form as whole numbers and Ramp to 1 decimal place.

| Day | Load | Fitness | Fatigue | Form | Ramp |
|---|---|---|---|---|---|
| 0 | 0 | 48.81 | 42.86 | 0.00 | −1.19 |
| 1 | 85 | 49.67 | 48.88 | 5.95 | −0.33 |
| 2 | 60 | 49.92 | 50.47 | 0.79 | −0.08 |
| 3 | 0 | 48.73 | 43.26 | −0.55 | −1.27 |
| 4 | 110 | 50.19 | 52.79 | 5.47 | 0.19 |
| 5 | 45 | 50.06 | 51.68 | −2.60 | 0.06 |
| 6 | 160 | 52.68 | 67.15 | −1.61 | 2.68 |
| 7 | 0 | 51.43 | 57.56 | −14.47 | 2.62 |
| 8 | 70 | 51.87 | 59.34 | −6.13 | 2.20 |
| 9 | 55 | 51.94 | 58.72 | −7.47 | 2.03 |
| 10 (today) | 0 | 50.71 | 50.33 | −6.77 | 1.98 |
| 11 (planned) | 95 | 51.76 | 56.71 | 0.38 | 1.57 |
| 12 (planned) | 40 | 51.48 | 54.32 | −4.95 | 1.42 |
| 13 (planned) | 175 | 54.42 | 71.56 | −2.84 | 1.74 |

## 5. Form bands

Bands classify the Form value as displayed, rounded half away from zero, so the label always agrees with the number on screen.

| Rounded Form | Label | Hint shown to the athlete |
|---|---|---|
| −31 or lower (below −30) | Overreaching | Deep fatigue. Talk to Coach before the next hard session. |
| −30 to −11 | Building | Training is adding up. Normal in a build block. |
| −10 to +5 | Steady | Neither tired nor fresh. |
| +6 to +25 | Fresh | Rested. Good for a race or a test. |
| +26 or higher | Detraining | Very fresh. If this lasts, fitness slips. |

```ts
function formBand(form: number): FormBand {
  const v = roundHalfAway(form, 0);
  if (v < -30) return 'overreaching';
  if (v < -10) return 'building';
  if (v <= 5) return 'steady';
  if (v <= 25) return 'fresh';
  return 'detraining';
}
```

Edges: −30.5 rounds to −31 (Overreaching); −30.4 rounds to −30 (Building); −10.6 is Building; −10.4 is Steady; 5.4 is Steady; 5.5 rounds to +6 (Fresh); 25.4 is Fresh; 25.5 rounds to +26 (Detraining).

Every rule that compares Form, Fitness, Fatigue or Ramp with a limit, including the flag rules in `docs/spec/checkins-flags.md`, should compare the displayed, rounded value. The number on screen and the rule then always agree.

Bands use the status palette, never the brand colours, and each band has a glyph as well as a colour.

## 6. Zones and the polarisation index

### 6.1 One convention

Every zone system uses lower-inclusive edges: `zone = 1 + (number of edges ≤ x)`, where `x` is the value divided by the threshold. A value exactly on an edge belongs to the higher zone. Edges are integer percentages (section 1.5).

Watts and heartbeats are shown as whole numbers. A zone's lowest whole value is `ceil(edge × threshold / 100)`, and its highest is one below the next zone's lowest. Paces are shown rounded to the nearest second; classification always uses the unrounded speed.

### 6.2 Power zones (% FTP)

Edges: 55, 75, 90, 105, 120, 150. Example: Amir, FTP 245 W.

| Zone | Name | % FTP | Amir (W) |
|---|---|---|---|
| Z1 | Recovery | under 55 | 0–134 |
| Z2 | Endurance | 55 to under 75 | 135–183 |
| Z3 | Tempo | 75 to under 90 | 184–220 |
| Z4 | Threshold | 90 to under 105 | 221–257 |
| Z5 | VO2 max | 105 to under 120 | 258–293 |
| Z6 | Anaerobic | 120 to under 150 | 294–367 |
| Z7 | Sprint | 150 and over | 368 and over |

### 6.3 Heart-rate zones (% LTHR)

Edges: 81, 90, 94, 100. The same five zones apply to every sport in phase 1; separate run and bike LTHR values are an MVP item. Example: Amir, LTHR 166 bpm.

| Zone | Name | % LTHR | Amir (bpm) |
|---|---|---|---|
| Z1 | Recovery | under 81 | up to 134 |
| Z2 | Endurance | 81 to under 90 | 135–149 |
| Z3 | Tempo | 90 to under 94 | 150–156 |
| Z4 | Threshold | 94 to under 100 | 157–165 |
| Z5 | Above threshold | 100 and over | 166 and over |

### 6.4 Run pace zones (% threshold speed)

Edges: 78, 88, 95, 103. The pace at an edge is `threshold pace × 100 / edge`. Example: Danial, threshold pace 3:58 /km (238 s).

| Zone | Name | % threshold speed | Danial (pace /km) |
|---|---|---|---|
| Z1 | Recovery | under 78 | slower than 5:05 |
| Z2 | Endurance | 78 to under 88 | 5:05 to 4:30 |
| Z3 | Tempo | 88 to under 95 | 4:30 to 4:11 |
| Z4 | Threshold | 95 to under 103 | 4:11 to 3:51 |
| Z5 | Speed | 103 and over | 3:51 and faster |

For Amir (4:25 /km) the same edges fall at 5:40, 5:01, 4:39 and 4:17 /km.

### 6.5 Swim zones (% CSS speed)

Edges: 85, 93, 98, 103. Example: Amir, CSS 1:48 /100 m (108 s).

| Zone | Name | % CSS speed | Amir (pace /100 m) |
|---|---|---|---|
| Z1 | Recovery | under 85 | slower than 2:07 |
| Z2 | Endurance | 85 to under 93 | 2:07 to 1:56 |
| Z3 | Tempo | 93 to under 98 | 1:56 to 1:50 |
| Z4 | Threshold | 98 to under 103 | 1:50 to 1:45 |
| Z5 | Fast | 103 and over | 1:45 and faster |

### 6.6 Time in zones

Each activity uses one zone source: power for rides, graded pace for runs, swim pace for swims, and heart rate when the first choice is missing. Time in zones is stored in the activity summary as seconds per zone, computed at import or by the seed.

- With a stream, each second goes to the zone of that second's value. Power uses the 1 s value, not the rolling mean.
- A swim without length data puts its whole timer time in the zone of its average speed.
- Activities scored by effort or duration only have no zone data.

### 6.7 The three-zone model

In every zone system, Z1 and Z2 are **easy**, Z3 and Z4 are **middle**, and Z5 and above are **hard**.

| System | Easy | Middle | Hard |
|---|---|---|---|
| Power | under 75% FTP | 75% to under 105% | 105% and over |
| Heart rate | under 90% LTHR | 90% to under 100% | 100% and over |
| Run pace | under 88% threshold speed | 88% to under 103% | 103% and over |
| Swim | under 93% CSS speed | 93% to under 103% | 103% and over |

### 6.8 Polarisation index

The index comes from Treff and colleagues (2019). It summarises in one number whether training is mostly easy with some hard work and little in the middle.

**Formula.** `PI = log10((z1 / z2) × z3 × 100)`, where `z1`, `z2` and `z3` are the fractions (0 to 1) of zoned time spent easy, middle and hard over the window.

**Window.** The last 28 days by default. Coach analytics also offers 7 days, 84 days and the current phase.

**Rules.**

1. If `z2` is 0, use 0.01 in its place.
2. The index is valid only when all three hold:
   - `z1 > z3 > z2`, judged on the original values (so `z2` = 0 with `z3` > 0 passes);
   - the window holds at least 10 hours of zoned time;
   - zoned time is at least 70% of the window's total timer time.
3. Round the index to 2 decimal places. Above 2.00 is **Polarised**; 2.00 or below is **Not polarised**.
4. If the order rule fails, show **Not polarised** without a number. If there is too little data, show "—" with the reason "Not enough zone data".

**Worked examples.**

| Easy / middle / hard | Index | Label |
|---|---|---|
| 30 h / 2 h / 4 h (fractions 0.833, 0.056, 0.111) | 2.22 | Polarised |
| 0.80 / 0.05 / 0.15 | 2.38 | Polarised |
| 0.85 / 0 / 0.15 (0.01 used for middle) | 3.11 | Polarised |
| 0.60 / 0.15 / 0.25 | 2.00 | Not polarised (not above 2.00) |
| 0.70 / 0.20 / 0.10 | none | Not polarised (middle exceeds hard) |

## 7. Compliance

### 7.1 Matching

Compliance compares each planned workout with the activity that carried it out. Matching runs per athlete, per day and per sport. It is one-to-one, and the nearest start wins.

1. Collect the planned workouts `P` and activities `A` for the same athlete, day and sport. Indoor rides are rides and treadmill runs are runs. A brick is two planned workouts, a ride and a run, and each matches on its own. Activities of sport `other` never match.
2. Give each planned workout a start: its `startMinute` if set. Otherwise use 06:00 (minute 360) for the first workout of that sport that day by `order`, 17:00 (minute 1,020) for the second, and one hour later for each one after that.
3. For every pair, the gap is `|activity.startMinute − planned start|`.
4. Sort the pairs by gap, then by planned `order`, then by activity start. Walk the list and take a pair when neither side is already taken.
5. Leftover activities are **unplanned**. A leftover planned workout is **open** until its day ends, then **missed**.

When an athlete does a session on a different day, the coach can drag the planned workout to that day in the calendar. Matching then runs again.

### 7.2 What is compared

Use the first measure both sides have:

1. **Load**, when the plan's `loadSource` is `steps` and the activity's load came from power, pace, swim or heart rate. Effort and duration-only loads are too rough to compare with a target.
2. **Duration**: planned duration against timer time.
3. **Distance**: planned distance against activity distance.
4. If nothing is shared, the workout is **unmeasured**. It counts as 100% and shows "No shared measure".

The ratio is `pct = roundHalfAway((100 × done) / planned, 1)`, a percentage to 1 decimal place.

### 7.3 Bands

| Band | `pct` (1 decimal place) | Meaning |
|---|---|---|
| Short | below 50.0 | Less than half the plan |
| Under | 50.0 to 79.9 | Partly done |
| On plan | 80.0 to 120.0 | Done as planned |
| Over | 120.1 to 150.0 | More than planned |
| Well over | above 150.0 | Far more than planned |
| Missed | none | Planned, nothing matched by the end of its day |
| Unplanned | none | An activity with no planned workout |

```ts
function band(pct: number): Band {
  if (pct < 50) return 'short';
  if (pct < 80) return 'under';
  if (pct <= 120) return 'onPlan';
  if (pct <= 150) return 'over';
  return 'wellOver';
}
```

**Display.** The UI shows compliance as a whole percentage rounded away from 100: down when below 100, up when above. So 79.9 shows as 79% next to "Under", and 120.1 shows as 121% next to "Over". Plain rounding would put 80% next to the word Under.

**Edges.** With 60 min planned:

| Done (min) | `pct` | Shown | Band |
|---|---|---|---|
| 29.94 | 49.9 | 49% | Short |
| 30 | 50.0 | 50% | Under |
| 47.94 | 79.9 | 79% | Under |
| 48 | 80.0 | 80% | On plan |
| 72 | 120.0 | 120% | On plan |
| 72.06 | 120.1 | 121% | Over |
| 90 | 150.0 | 150% | Over |
| 90.06 | 150.1 | 151% | Well over |

### 7.4 Weekly compliance

Weekly compliance (WC) says how much of a week's plan was carried out, rest days included, with doing more never scoring more.

**Formula.**

- The week runs Monday to Sunday, local time.
- For each planned workout `i` in the week, `PL_i` is its planned load. Its credit `c_i` is `min(pct_i, 100) / 100` if matched, 0 if missed and 1 if unmeasured.
- Training days are days with at least one planned workout; there are `n_train` of them. Every other day of the week is a planned rest day.
- A rest day is **kept** if the total load of all activities on it is 25 or less. A walk or a half-hour easy spin is fine. A 45 min easy run (about 42) is not.
- Weekly compliance:

  `WC = 100 × [ (n_train / 7) × (Σ c_i × PL_i / Σ PL_i) + (rest days kept) / 7 ]`

In words: each rest day is worth one seventh of the week. The training days share the rest of the week in proportion to their planned load. Each session's credit stops at 100%, so extra work earns nothing.

**Rules.**

- A week with no planned workouts has no WC ("No plan this week").
- Planned recovery sessions count like any other session. A recovery week is scored against its own smaller plan, so finishing it as planned scores 100%.
- An excused week still gets a WC. What the excuse does is defined in `docs/spec/gamification.md`.
- The streak compares `roundHalfAway(WC, 1)` with 80.0. WC is shown as a whole percentage with the rounding rule in section 7.3.

**Week so far.** During the current week, WC uses only items that are due: workouts on days that have ended, today's matched workouts, and rest days that have ended. A workout's weight is `(n_train / 7) × PL_i / Σ PL_i` and a rest day's weight is 1/7, both using the whole week's plan. WC so far is `100 × Σ (weight × credit) / Σ weight` over the due items. Before anything is due it is empty.

**Worked example.** A week planned as: Monday rest; Tuesday intervals (75); Wednesday easy (35); Thursday tempo (65); Friday rest; Saturday long ride (180); Sunday easy run (50). `Σ PL` = 405 and `n_train` = 5.

| What happened | WC | Shown |
|---|---|---|
| Everything on plan, both rest days kept | 100.0 | 100% |
| Long ride missed: (5/7) × (225/405) + 2/7 | 68.3 | 68% |
| Wednesday easy session missed | 93.8 | 93% |
| Long ride done at 75% | 92.1 | 92% |
| Tuesday at 130% (credited at 100%), Thursday at 70% | 96.6 | 96% |
| Everything done, plus a 45 min run on Monday | 85.7 | 85% |
| Everything done, plus extra training on both rest days | 71.4 | 71% |

## 8. Best efforts

### 8.1 Power

Windows: 5 s, 15 s, 30 s, 1 min, 2 min, 5 min, 10 min, 20 min, 30 min and 60 min.

The best power for a window of `N` seconds is the largest mean of `N` consecutive samples, `max over i of mean(p_i … p_(i+N−1))`, over full windows only, with missing readings as 0 W. Use a prefix sum so each window costs one pass. An activity shorter than the window has no value for it.

### 8.2 Run

Distances: 400 m, 1 km, 5 km, 10 km, half marathon (21,097.5 m) and marathon (42,195 m).

The best time for distance `D` is the shortest time from any reading `i` to the moment cumulative distance reaches `d_i + D`. That moment is interpolated linearly between the two readings either side of it. Starts fall on whole seconds; ends are interpolated. Two pointers make this one pass.

A run with no stream counts for distance `D` only if its distance is between `D` and `1.02 × D`; its time is `timer time × D / distance`. That lets a manually logged 5 km race count without inventing splits.

### 8.3 Which activities, and curves

- Power bests come from rides with a power stream, indoor rides included. Run bests come from runs, treadmill runs included and marked with a treadmill glyph. Walks never count.
- Per-activity bests are computed once, at import or by the seed, and stored in the activity summary.
- A curve for a period takes, for each window or distance, the best value across the period's activities, with the activity and day it came from. On a tie the earlier activity wins.
- Periods offered: last 28 days, last 84 days, this season and all time.
- Threshold history does not affect best efforts.

### 8.4 Worked examples

- **Power.** A 25 s stream: 10 s at 100 W, 5 s at 400 W, then 10 s at 100 W. Best 5 s = 400 W. Best 15 s = (5 × 400 + 10 × 100) / 15 = 200 W. There is no 30 s value.
- **Run.** One reading per second: 60 s at 4 m/s, 50 s at 5 m/s, then 60 s at 4 m/s. Best 400 m = 87.5 s, shown as 1:28. The earliest start that achieves it is second 23.

## 9. Display and rounding

Numbers use en-MY formatting: a comma for thousands and a point for decimals. All rounding is `roundHalfAway` unless the table says otherwise.

| Quantity | Shown as | Rule | Examples |
|---|---|---|---|
| Load (session, day, week) | whole number | Totals add the unrounded loads, then round, so a total can differ by 1 from the sum of the shown values. | 96.708 → 97 |
| Fitness, Fatigue | whole number | | 63.654 → 64 |
| Form | signed whole number | "+" before positive values, a true minus sign (U+2212) before negative values, plain "0" for zero | −11.905 → −12; 5.5 → +6; −0.4 → 0 |
| Ramp | signed, 1 decimal place | same signs as Form | 6.678 → +6.7 |
| Intensity | 2 decimal places | | 0.8977 → 0.90 |
| Weighted power, power | whole watts | | 251.36 → 251 W |
| Heart rate | whole bpm | | |
| Run pace | m:ss /km | `s = roundHalfAway(1000 / v)`, then minutes and seconds | 3.3333 m/s → 5:00 /km; 1000/299.6 m/s → 5:00; 1000/299.4 m/s → 4:59 |
| Swim pace | m:ss /100 m | `s = roundHalfAway(100 / v)` | 0.9259 m/s → 1:48 /100 m |
| Bike speed | km/h, 1 decimal place | | 7.5 m/s → 27.0 km/h |
| Session and weekly durations | h:mm | minutes = `roundHalfAway(seconds / 60)`; hours = whole part of minutes / 60; mm = the remaining minutes, two digits | 2,700 s → 0:45; 3,725 s → 1:02; 5,429 s → 1:30; 5,430 s → 1:31 |
| Durations under a minute | seconds | | 45 s |
| Step durations in the builder | "30 s", "5 min", "2:30 min", "1 h 15 min" | whole minutes as "min"; part minutes as m:ss | |
| Best-effort times | m:ss, or h:mm:ss from an hour up | `roundHalfAway(seconds)` first | 87.5 s → 1:28 |
| Run and bike distance | km, 1 decimal place | | 21,097.5 m → 21.1 km |
| Swim distance | whole metres | | 2,000 m |
| Elevation | whole metres | | 2,400 m |
| Session and weekly compliance | whole percent | rounded away from 100 (section 7.3) | 79.9 → 79%; 120.1 → 121% |
| Polarisation index | 2 decimal places | | 2.38 |
| Temperature | whole °C | | 31 °C |

## 10. Test vectors

Each row is a known answer for `src/domain` tests. "Tol." is the largest allowed difference on the unrounded value. Thresholds come from the mock athletes: Amir has FTP 245 W, threshold pace 265 s/km, CSS 108 s/100 m, LTHR 166 and resting HR 48; Irfan has FTP 280 W.

| # | Input | Expected output | Tol. |
|---|---|---|---|
| 1 | Power, 3,600 s at 245 W, FTP 245 | WP 245 W, intensity 1.000, load 100.000, method `power`, confidence high | 0.001 |
| 2 | Power, 1,800 s at 196 W, FTP 245 | intensity 0.800, load 32.000 | 0.001 |
| 3 | Power, Irfan's 72 min interval ride (section 2.2), FTP 280 | WP 251.362 W, intensity 0.8977, load 96.708 (shows 97) | 0.01 |
| 4 | Test 1 with FTP 255 in force | intensity 0.9608, load 92.311 (shows 92) | 0.001 |
| 5 | Run, 10,000 m in 3,000 s, no altitude, threshold 265 s/km | intensity 0.8833, load 65.023, confidence medium | 0.001 |
| 6 | Run, hill streams from section 2.3 example 2 | graded distance 4,096.76 m, graded speed 3.3307 m/s, load 26.617, confidence high | 0.01 |
| 7 | Swim, 2,000 m in 2,400 s, CSS 108 s/100 m, pool | intensity 0.900, load 48.600, confidence medium | 0.001 |
| 8 | Heart rate, 3,600 s at 166 bpm; then 3,600 s at 136 bpm (rest 48, LTHR 166) | 100.000; then 57.834 (shows 58) | 0.001 |
| 9 | Effort: 60 min at RPE 7; 45 min at RPE 5 | 100.000; 53.571 (shows 54) | 0.001 |
| 10 | Run, 3,600 s, nothing but duration | load 56.250 (shows 56), method `duration`, confidence low | 0.001 |
| 11 | Starting values 0/0, day 0 load 100, then rest | day 0: Fitness 2.381, Fatigue 14.286, Form 0.000; day 1: Form −11.905 (shows −12) | 0.001 |
| 12 | Starting values 0/0, 100 every day for days 0–41 | day 41: Fitness 63.654, Fatigue 99.846, Form −37.052, Ramp 6.678 | 0.001 |
| 13 | Session compliance, 60 min planned; done 47.94 / 48 / 72 / 72.06 min | 79.9 Under / 80.0 On plan / 120.0 On plan / 120.1 Over | exact |
| 14 | Weekly compliance, section 7.4 plan, long ride missed, both rest days kept | 68.254, shows 68%, below 80 | 0.001 |
| 15 | Form band of −30.5 / −30.4 / 5.5 / 25.5; polarisation of 0.80/0.05/0.15 and 0.70/0.20/0.10 | Overreaching / Building / Fresh / Detraining; 2.38 Polarised and Not polarised (no number) | exact; 0.005 |

[^names]: Laree's Load, Fitness, Fatigue and Form follow the impulse-response model family introduced by Banister and colleagues in 1975. Other tools call the equivalent quantities TSS (Load), NP (Weighted power) and IF (Intensity), which are TrainingPeaks trademarks, and CTL (Fitness), ATL (Fatigue) and TSB (Form). Laree's UI uses none of these names: three are trademarks, and the abbreviations mean nothing to most athletes. Laree's own formulas, constants and rounding are the ones on this page.
