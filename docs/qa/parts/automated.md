# Automated audit (T11.1)

Run on 13 November 2026 against the production build of `agent-staging` after the M11 fixes (served with `vite preview`).

## Checks

| Check | Result |
|---|---|
| Typecheck (`tsc`) | Pass |
| Lint (oxlint) | Pass: no errors. Two warnings remain (a nested component in `SeasonPage.tsx`, function scoping in one test). |
| Tests (vitest) | Pass: 75 files, 1297 tests |
| Build | Pass |
| Manifest check (`check:manifest`) | Pass |
| Base-path check (`check:base`) | Pass |
| Bundle: athlete Today JS | Pass: 155.9 KB gzip over 21 files, budget 160 KB |
| `impeccable detect src` | Pass, no findings. This mode only matches source text, so element rules such as tiny text and contrast do not run; see the rendered run below. |
| `impeccable detect` on the served build | Today, Progress and Overview: no findings. Analytics: one advisory, DET-1. |

The full test suite can time out on this machine when vitest uses every core. It passes with `--maxWorkers=3`. This is a test-runner limit, not a product defect.

## Findings

| ID | Severity | Finding | Outcome |
|---|---|---|---|
| B1 | High | Today shipped 163.8 KB gzip of JavaScript, over the 160 KB budget. | **Fixed.** The icons on Today's path have their own modules (`icons-core.tsx`, `paths-core.ts`), so Today no longer carries the full set the kit page draws. Stream helpers left the seed module. Now 155.9 KB. |
| B2 | Medium | The seed generator loads with the store on first paint. | **Deferred.** The budget is met. Lazy seeding changes first-load behaviour and belongs with the MVP data layer, which replaces the seed. |
| B3 | Medium | The flag rule engine loads on first paint. | **Deferred,** same reason as B2. |
| B4 | Low | The shell imported icons through the barrel, so the shared chunk held every icon. | **Fixed** with B1. |
| DET-1 | Advisory | Detector reports repeating-gradient stripes on Analytics. | **Rejected.** The stripes are the hatch on "over plan" heatmap cells. The pattern carries meaning without colour, as DESIGN.md requires; it is not decoration. |
