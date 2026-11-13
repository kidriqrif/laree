# Tooling

This page explains how the Laree repo is built, checked and deployed. It also lists the assistant skills and token-saving tools used to make it, and what each one was for. Read it before you change the build, add a dependency or rename the repo.

> **Status on 2026-11-07.** The repo holds the M0 scaffold: Vite, React, TypeScript, oxlint, Vitest and the Pages workflow. Folders such as `brand/`, `src/domain/` and `src/charts/` arrive in later milestones. This page describes the finished setup and says so where a part is not there yet.

## At a glance

| Question | Answer |
|---|---|
| Runtime | Node 24 (`.nvmrc`), npm 11 |
| App | A React 19 single-page app, bundled by Vite 8, with hash routing |
| Language | TypeScript 7 in strict mode |
| Lint | oxlint |
| Tests | Vitest with happy-dom |
| Hosting | GitHub Pages, deployed by GitHub Actions |
| Data | Browser only. A zustand store persisted to `localStorage` under the key `laree:v1`. No backend. |
| Licence | All rights reserved (`LICENSE`). Third-party licences are listed in `THIRD_PARTY_NOTICES.md`. |

## Requirements

- **Node 24 or newer.** `.nvmrc` says `24` and `package.json` sets `"engines": { "node": ">=24" }`. Development used Node 24.14 and npm 11.11 on Windows 11, with Git Bash and PowerShell.
- **TypeScript that Node can run directly.** Node 24 runs `.ts` files by stripping the types, so the brand scripts need no build step. This is why `tsconfig.json` turns on `erasableSyntaxOnly` and `allowImportingTsExtensions`. Use only TypeScript syntax that can be erased: no `enum`, no `namespace`, no constructor parameter properties. Import local files with their `.ts` extension.
- **Line endings.** `.gitattributes` stores text files with LF endings (`* text=auto eol=lf`) and marks PNG, ICO, WOFF2 and FIT files as binary, so a Windows checkout never rewrites them.
- **No GitHub CLI.** The machine has no `gh`. Git Credential Manager asks the owner to sign in on the first push.

## Commands

| Command | What it runs | Use it to |
|---|---|---|
| `npm run dev` | `vite` | Start the dev server with hot reload on http://localhost:5173/ |
| `npm run build` | `vite build` | Write the production site to `dist/` |
| `npm run preview` | `vite preview` | Serve `dist/` on http://localhost:4173/ to check the built site |
| `npm run typecheck` | `tsc --noEmit -p tsconfig.json` | Type-check `src`, `brand/src`, `scripts` and `vite.config.ts` without writing files |
| `npm run lint` | `oxlint` | Lint with the rules in `.oxlintrc.json` |
| `npm run test` | `vitest run --passWithNoTests` | Run every test once. `--passWithNoTests` keeps the early scaffold green before tests exist. |
| `npm run check` | `typecheck`, then `lint`, then `test` | Run the full gate before every commit. It stops at the first failure. |
| `npm run brand` | `node scripts/brand/build-logo.ts && node scripts/brand/rasterize.ts` | Rebuild the logo SVGs, PNGs and icons from `brand/src/logo-geometry.ts` (lands in M2) |

`npm test` is the same as `npm run test`.

`.claude/launch.json` defines two servers for the built-in browser preview: `dev` on port 5173 and `preview` on port 4173. Both pass `--strictPort`, so the server fails loudly instead of drifting to another port.

The CI build does not run `npm run brand`. After you change the logo geometry, run it locally and commit the generated SVG, PNG and ICO files.

## Stack and exact versions

Every dependency is pinned to an exact version, with no `^` or `~`. The versions were picked with `npm view` at scaffold time. If a new major version blocks the build, fall back to the previous major and record why in this file.

### Runtime dependencies

| Package | Version | Role in Laree |
|---|---|---|
| `react`, `react-dom` | 19.3.1 | UI |
| `react-router` | 8.5.1 | Hash router |
| `zustand` | 5.1.0 | App state, saved with its `persist` middleware under `laree:v1` |
| `react-aria-components` | 1.22.1 | Accessible primitives: table, drag-and-drop grid list, calendar, multi-thumb slider, sheet, drop zone, toast |
| `@internationalized/date` | 3.12.4 | Calendar date maths with the en-MY locale and Monday week start |
| `d3-scale` | 4.0.3 | Scales for the hand-drawn SVG charts |
| `d3-shape` | 3.2.1 | Line and area paths |
| `d3-array` | 3.2.5 | Extents, bins and rolling sums |
| `d3-time-format` | 4.1.1 | Date labels on chart axes |
| `@garmin/fitsdk` | 21.221.0 | Reads .FIT activity files and writes .FIT workout files. Loaded only when needed. |
| `@fontsource-variable/anybody` | 5.3.0 | Display font. Its width axis switches between the two registers. |
| `@fontsource-variable/atkinson-hyperlegible-next` | 5.3.0 | UI and body text |
| `@fontsource-variable/atkinson-hyperlegible-mono` | 5.3.0 | Numbers and data |

### Development dependencies

| Package | Version | Role in Laree |
|---|---|---|
| `typescript` | 7.0.2 | Type checker (`tsc`) |
| `vite` | 8.3.6 | Dev server and bundler |
| `@vitejs/plugin-react` | 6.2.1 | React support for Vite |
| `vite-plugin-pwa` | 2.0.0 | Web app manifest and service worker (wired up in M4) |
| `vitest` | 5.1.0 | Test runner |
| `happy-dom` | 21.0.4 | Browser-like DOM for tests |
| `@testing-library/react` | 16.3.3 | Component tests |
| `oxlint` | 1.92.0 | Linter |
| `@resvg/resvg-js` | 2.6.2 | Renders brand SVGs to PNG |
| `fontkit` | 2.0.4 | Reads font files in the brand scripts |
| `@types/node` | 24.19.2 | Node types for scripts |
| `@types/react`, `@types/react-dom` | 19.3.0 | React types |
| `@types/d3-array` | 3.2.2 | Types for `d3-array` |
| `@types/d3-scale` | 4.0.9 | Types for `d3-scale` |
| `@types/d3-shape` | 3.2.0 | Types for `d3-shape` |
| `@types/d3-time-format` | 4.0.3 | Types for `d3-time-format` |

### Left out on purpose

- **No Tailwind, shadcn/ui or lucide.** Styles are plain CSS Modules inside cascade layers (`@layer`). The 24 px icons are drawn by hand.
- **No chart library.** Charts are SVG drawn by hand on top of d3 scales and shapes, so they share the type, colour and spacing tokens.
- **Banned fonts:** Inter, Geist, Space Grotesk, DM Sans, Manrope, Poppins and Bricolage Grotesque. All three Laree fonts are OFL-licensed and self-hosted through `@fontsource-variable`.

## Configuration files

| File | What it sets |
|---|---|
| `vite.config.ts` | `base: './'`, the React plugin, build target `es2022`, and Vitest with happy-dom and the test file globs (`src/**/*.test.{ts,tsx}`, `brand/**/*.test.ts`, `scripts/**/*.test.ts`) |
| `tsconfig.json` | `strict`, plus `noUncheckedIndexedAccess`, `noImplicitOverride`, `noFallthroughCasesInSwitch`, `verbatimModuleSyntax` and `erasableSyntaxOnly`. Covers `src`, `brand/src`, `scripts` and `vite.config.ts`. |
| `.oxlintrc.json` | Plugins: eslint, typescript, unicorn, oxc, react, jsx-a11y and vitest. Correctness rules are errors, suspicious rules are warnings, `react/react-in-jsx-scope` is off. |
| `.nvmrc` | `24` |
| `.gitattributes` | LF line endings and binary file types |
| `.gitignore` | Ignores `node_modules`, `dist`, `dev-dist`, `coverage`, `.env` files and everything in `.claude/` except `launch.json` |
| `.impeccable/config.json` | Impeccable hooks quiet, telemetry off |
| `.claude/launch.json` | `dev` and `preview` servers for the built-in browser |
| `.github/workflows/deploy.yml` | Check, build and deploy to GitHub Pages |

## Base-path agnostic build

The live site is at https://kidriqrif.github.io/laree/ (the repo was renamed from `strelo` to `laree` on 2026-11-08). Three choices let the same build run under any path, so a rename needs no code change.

1. **Vite `base: './'`.** Every script, style and image URL in the built HTML is relative, so the site loads from `/laree/`, any other repo path or a local folder without a rebuild.
2. **Hash routing.** Routes live after the `#`, for example `#/athlete/today`. The server only ever serves `index.html`, so deep links reload without the 404 fallback page that GitHub Pages would otherwise need for a single-page app.
3. **One storage key, `laree:v1`.** All project sites under `kidriqrif.github.io` share one origin, so they share one `localStorage`. The `laree:` prefix keeps Laree's data apart from any other site there. The `v1` suffix and zustand's versioned `persist` let the store migrate when its shape changes.

The web app manifest follows the same rule. `start_url` and `scope` are both `./`, and the two PWA shortcuts use relative URLs: `./#/athlete/today?sheet=log` ("Log a session") and `./#/athlete/today` ("Today").

### Renaming the repo

Renaming needs no code change. Do this:

1. Rename the repo on GitHub.
2. Update the links in `README.md`: the live site and the repo URL.
3. Wait for the next deploy, or run the workflow by hand from the Actions tab.
4. Open the new URL and reinstall the PWA. An installed copy keeps pointing at the old path.

Demo data survives the rename because the origin (`kidriqrif.github.io`) does not change. Links to the old Pages path stop working.

To test rename safety before a release, build once and serve `dist` under a different base path:

```sh
npm run build
npx vite preview --base /renamed/
```

Then open http://localhost:4173/renamed/ and click through a few deep links.

## Deploy

The site deploys to GitHub Pages through `.github/workflows/deploy.yml`.

- **Triggers:** every push to `main`, or a manual run (`workflow_dispatch`).
- **Build job** on `ubuntu-latest`:
  1. `actions/checkout@v7`
  2. `actions/setup-node@v7`, reading the Node version from `.nvmrc`, with the npm cache on
  3. `npm ci`
  4. `npm run typecheck`
  5. `npm run lint`
  6. `npm test`
  7. `npm run build`
  8. `actions/configure-pages@v6`
  9. `actions/upload-pages-artifact@v5` with `path: dist`
- **Deploy job:** `actions/deploy-pages@v5` into the `github-pages` environment. The job's URL output is the live link.
- **Permissions:** `contents: read`, `pages: write` and `id-token: write`. The last one lets `deploy-pages` prove its identity to Pages.
- **Concurrency:** group `pages` with `cancel-in-progress: false`, so a running deploy always finishes before the next one starts.

A failed check stops the run before the deploy job, so the live site never moves ahead of a red build.

**One-time step, owner only:** on GitHub, open the repo's **Settings**, then **Pages**, then under **Build and deployment** set **Source** to **GitHub Actions**. Until this is done the deploy job fails.

## Assistant skills

The repo was designed and built with Claude Code and the skills below. Skills are installed per machine and are not committed: `.gitignore` excludes `.claude/` apart from `launch.json`.

| Skill | Scope | Used in | What it was for |
|---|---|---|---|
| design-brief | Global | M1 | Turned the four Q&A rounds into `docs/brief/design-brief.md`: audience, goals, registers, constraints |
| information-architecture | Global | M1 | Navigation, route map and object model in `docs/ia/information-architecture.md`, and the screen inventory |
| brief-to-tasks | Global | M1 | Broke the brief into vertical-slice tasks in `docs/tasks.md` |
| frontend-design | Global | M2, M7 to M10 | Aesthetic direction, the three logo attempts for the judge panel, and screen builds that avoid generic AI looks |
| design-tokens | Global | M3 | The token file in `src/styles/tokens.css`: palette, spacing scale, type ramp, both registers, light and dark |
| dataviz | Global | M3, M6 | The palette check (contrast and colour-blind validator), chart form choices and mark specs for the chart kit |
| awesome-claude-design DESIGN.md format | Reference | M3 | The nine-section layout of `DESIGN.md` (see below) |
| building-components | Global | M4, M6 | Accessible, composable UI primitives on top of react-aria-components |
| dashboard-design | Global | M6, M11 | Coach screens: KPI rows, comparison periods, empty and loading states, and the screenshot sign-off |
| impeccable | Project | M1 to M11 | `detect` as a static anti-pattern gate, then `critique`, `audit` and `polish` on rendered pages. Its `init` conventions shaped `PRODUCT.md` and `DESIGN.md`. |
| web-design-guidelines | Global | M11 | Review of UI code against the Web Interface Guidelines: focus, forms, motion, touch targets, copy |
| design-review | Global | M11 | Structured critique of the built screens against the brief: hierarchy, consistency, responsiveness, accessibility |

### How they were installed

| Skill | Install |
|---|---|
| web-design-guidelines, building-components | `npx skills add <source> -g -a claude-code` (global, for Claude Code) |
| dashboard-design | Copied into `~/.claude/skills/dashboard-design` |
| impeccable | `npx impeccable install -y --providers=claude --scope=project`, which writes the skill and its helper agents into `.claude/` for this repo only |
| The others | Already installed in the owner's global skill set |

### Impeccable settings

`.impeccable/config.json` is committed and holds two settings:

```json
{
  "hook": { "quiet": true },
  "telemetry": false
}
```

- `hook.quiet: true` keeps Impeccable's editor hook from printing a report after every edit. Findings still come out when you run a command.
- `telemetry: false` stops usage reporting.
- A local override can go in `.impeccable/config.local.json`, which git ignores.

Impeccable's four commands, in the order they are used:

| Command | When | Pass mark |
|---|---|---|
| `detect` | Every milestone, as `npx impeccable detect src`, and on the preview URL in M11 | No high-severity findings |
| `critique` | After the logo attempts (M2) and after each feature build | Every point answered or logged as a known gap |
| `audit` | M11, on rendered pages | Accessibility and performance findings fixed or logged in `docs/qa/report.md` |
| `polish` | M11, last | Spacing, alignment, type and motion consistent across both registers |

### DESIGN.md format

`DESIGN.md` follows the nine-section format from the awesome-claude-design collection. The format makes the design system readable by both people and coding agents:

1. Visual theme and atmosphere
2. Colour palette and roles
3. Typography rules
4. Component styling
5. Layout principles
6. Depth and elevation
7. Do's and don'ts
8. Responsive behaviour
9. Agent prompt guide

## Token-saving setup

Long tool output fills the model's context and costs money. Four tools keep it small. None of them changes what ships.

| Tool | What it does | How Laree uses it |
|---|---|---|
| context-mode | An MCP server that runs commands in a sandbox and returns only a summary, with the full output indexed for search | Builds, test runs, `impeccable detect`, logs and long web docs go through it, so a 2,000-line test log comes back as a few lines |
| token-savior | An MCP server for navigating code by symbol: find a function, read its source, list its callers | Reading the metrics engine and the store without opening whole files |
| rtk | A command-line proxy that compresses shell output before the model reads it | Active globally through a hook. `rtk proxy <command>` gives the raw output when the condensed result is unusable, and `rtk gain` reports the savings. |
| caveman | A terse output style | Internal agent prompts, scratch notes and commit messages only |

**Caveman never reaches a reader.** Docs, `README.md`, `PRODUCT.md`, `DESIGN.md` and every word of UI copy stay in full, plain English prose. Commit messages are the one public place where the terse style appears.

## Quality gates

Each milestone ends with checks, then a commit, then a push. The checks run through context-mode.

| Gate | Command or method | Pass mark |
|---|---|---|
| Types | `npm run typecheck` | No errors |
| Lint | `npm run lint` | No errors |
| Tests | `npm run test` | All pass. The metrics engine keeps at least 90% coverage. |
| Build | `npm run build` | Succeeds. Athlete JavaScript is 160 KB gzipped or less. |
| Design anti-patterns | `npx impeccable detect src` | No high-severity findings |
| Rendered checks (M11) | Impeccable audit, critique and polish; web-design-guidelines; design-review; dashboard-design sign-off | Fixed, or logged in `docs/qa/report.md` |
| Screenshots (M11) | Built-in browser: athlete at 390×844, coach at 1440×900, a spot check at 768 px; then keyboard only, 200% zoom and reduced motion | Signed off in the QA report |
| PWA (M11) | Install, then reload with the network off | App opens and shows demo data |
| Rename safety (M12) | Serve `dist` under another base path | Deep links work |

### Keeping the athlete's first screen small

The budget covers everything the Today route loads before it can draw: the entry script and every chunk Today imports statically. Sheets, dialogs and the toast region load later and do not count. Four rules keep it inside 160 KB:

- **Modules have no side effects.** `package.json` lists the only files that do (`sideEffects`: stylesheets, `src/app/main.tsx` and `src/styles/fonts.ts`). This lets the build drop every unused export of an index file. A new module that must run just by being imported has to be added to that list, or the build removes it.
- **No react-aria code on Today.** `Button` brings about 14 KB of press handling. Anything Today imports statically uses `PlainButton`, a native button with the same look.
- **Overlays load when they open.** Sheets, drawers and dialogs use `React.lazy`. Each shell loads the one toast region after first paint; pages call `showToast` and never mount a region.
- **Standalone pages are separate chunks.** The role picker, brand board and UI kit, with the logo geometry, never load for an athlete who opens Today.

To see what Today loads, build with `npx vite build --sourcemap` and read the chunk list. At M9 the total was about 156.5 KB.

## Working agreements

- **Every change goes through a pull request.** Nothing is committed to `main` directly. Each task is pushed to the `agent-staging` branch and opened as a pull request into `main`. CodeRabbit reviews it, review points are fixed on the same branch, and the owner merges. GitHub Pages deploys from `main`, so the live site changes only after a merge.
- **Commit identity** for this repo only: `kidriqrif <208976798+kidriqrif@users.noreply.github.com>`.
- **Never commit secrets.** `.env` and `.env.*` are ignored, apart from `.env.example`. The prototype needs no secrets at all.
- **Neutral metric names.** The UI says Load, Fitness, Fatigue, Form, Ramp, Weighted power and Intensity. See `docs/spec/metrics.md`.
- **British spelling** in docs and UI: colour, centre, metre.

## Repo layout

```
.github/workflows/deploy.yml   Pages build and deploy
.claude/launch.json            dev and preview servers (rest of .claude/ is ignored)
.impeccable/config.json        Impeccable settings
PRODUCT.md  DESIGN.md  README.md  LICENSE  THIRD_PARTY_NOTICES.md
docs/brief/  docs/ia/  docs/spec/  docs/brand/  docs/roadmap/  docs/qa/  docs/dev/  docs/tasks.md
brand/src/logo-geometry.ts     logo geometry in code
brand/svg/  brand/png/         generated logo files
scripts/brand/build-logo.ts    writes the SVG variants
scripts/brand/rasterize.ts     writes the PNGs
scripts/make-ico.ts            writes favicon.ico
public/                        favicons, PWA icons, og.png
src/app/        entry point, router, shells, role switcher
src/styles/     tokens, base, register-athlete, register-coach
src/ui/         react-aria-based primitives and icons
src/charts/     scales, Axis, PMC, Bars, Bullet, Heatmap, Curve, ZoneBar, Sparkline, TrackLap
src/domain/     types, metrics, flags, gamification, plan, with tests
src/data/       seed, store, persist, selectors
src/io/         export (zwo, mrc, erg, fit, ics) and import (fit, gpx, tcx)
src/ai/         simulated output and consent
src/features/   athlete, coach and shared screens
```

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| The Pages URL shows a 404 after the first push | Pages source is not set to GitHub Actions | Do the one-time step under [Deploy](#deploy) |
| A blank page when served from a sub-folder | `base` changed from `'./'`, or an absolute asset URL crept in | Restore `base: './'` and use relative or imported asset paths |
| The prototype shows stale or broken demo data after an update | The store shape changed without a migration | Bump the persist version and add a migration, or open `#/reset` |
| `node scripts/....ts` fails with a syntax error | The script uses TypeScript syntax Node cannot strip | Replace enums, namespaces or parameter properties with plain code |
| Git asks for a password on push | First push from this machine | Sign in through the Git Credential Manager window |
