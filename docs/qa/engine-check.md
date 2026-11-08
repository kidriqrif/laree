# Engine check (T5.9)

Adversarial review of `src/domain` (metrics, steps, plan, flags, gamification, baselines, time).

## Method

Two reviewers who did not write T5.2 to T5.6 probed the engine independently. They recomputed spec vectors with throwaway scripts, brute-forced edge cases, and compared against the specs. Each finding was then reproduced as a failing test in the owning module's test file, fixed, and the whole domain suite re-run (`npx vitest run src/domain src/data`: 11 files, all passing, typecheck clean).

## What was recomputed

Reviewer A (all matched):
- metrics.md section 10 rows 1-15: session load for every method, Fitness/Fatigue/Form day 0-1 and the day-41 vector, compliance edges 79.9/80/120/120.1, weekly compliance 68.254, the section 7.4 table, polarisation (2.38 Polarised; 0.70/0.20/0.10 Not polarised).
- Section 2.5/2.7 extra examples, section 6.8 examples, T5.6 target examples (88-93% of 255 W = 224-237 W, and so on).
- gamification.md section 8: S1-S10, L1-L5, L7, B1-B23.
- checkins-flags.md Tests: every rule truth-table row and all 8 lifecycle rows.
- Not checked: gamification L6 (lane geometry) and B24 (seed awards), because the geometry and the seed did not exist yet.

Reviewer B (all matched): compliance band edges and 60 min edge table, weekly compliance cases, session compliance fallbacks, matching, streak loop, the session load cascade edge cases, best-effort curves, Fitness lag/Ramp/recompute/projection, time and week boundaries in Asia/Kuala_Lumpur, zones, planned load examples, flag rule boundaries and lifecycle, baseline window.

## Findings

1. **Form band function missing** (code). Spec section 5 and vector 15 need `formBand`; none existed. Confirmed. Added `formBand` and the `FormBand` type to `src/domain/metrics/fitness.ts`, tested at all eight edge values.
2. **Target rounding at exact .5** (code). `resolveTarget` multiplied by `pct / 100`, so 57% of 150 W gave 85 (float 85.49999...). Spec 1.5 says multiply first. Confirmed (32 FTP and 8 LTHR mismatches over the grid). Fixed in `src/domain/steps.ts` for power, heart rate, pace and swim; the test compares a 301 x 161 grid against integer arithmetic.
3. **Same-day flag id collision** (code). A flag resolved and re-opened the same day got the same id, so later updates and coach actions hit both records. Confirmed. `stepFlags` now suffixes the new id (`#2`, `#3`); at most one active flag per athlete and rule holds.
4. **Flag rules: rounded or unrounded** (spec contradicted itself). metrics.md section 5 said flag rules compare displayed values; checkins-flags.md says unrounded, and its truth table (Ramp 8.01 true, Form -30.01 true) depends on that. The code follows checkins-flags.md. Spec fixed minimally: the sentence in metrics.md section 5 now makes flag rules the exception. No code change.
5. **Non-finite inputs** (code, low severity). `timerS` NaN/Infinity, `lthr` NaN, `distanceM` NaN, `weightedPowerW` Infinity and a 0% planned distance step produced NaN or Infinity load, which would poison Fitness and Fatigue. Confirmed. `sessionLoad` now returns 0 for a non-finite timer and skips any method whose load is non-finite; `plannedLoad` no longer divides by a zero intensity.

All five new test groups failed before the fixes (tests were written first) and pass now. The seed snapshot did not change.

## Left open

- Gamification L6 (lane geometry) is unchecked until the lap drawing exists (M7). B24 (seed awards) is now covered by `src/data/seed.test.ts`.
- Existing `consistent-function-scoping` lint warnings in files I do not own (gamification, plan.test.ts) are untouched.
- The leftover `.tmp-review-edges` folder has been deleted and `.tmp*` is in `.gitignore`.
