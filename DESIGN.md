# Laree design system

One token set, two registers, two themes. Tokens live in `src/styles/tokens.css`; this file is the contract for using them. Contrast pairs listed here are enforced by `src/styles/tokens.test.ts`.

The registers are switched with `data-register="athlete|coach"` on the app shell. The theme follows the OS and can be forced with `html[data-theme="light|dark"]`.

## 1. Visual Theme & Atmosphere

**Hot track.** A 400 m track on a warm evening: off-white paper, ink lines, track red-orange and sunshine yellow. Lane lines, bends, bibs and results sheets are the visual vocabulary. Nothing glows, nothing is glass, there are no gradients. The one violet in the system is the Over status mark.

| | Athlete, "race day" | Coach, "results sheet" |
|---|---|---|
| Device | Phone, one thumb | Desktop, keyboard first |
| Feel | Fun, loud, forgiving | Quiet, exact, dense |
| Display face | Anybody, width 125, weight 800, italic | Anybody, width 75, weight 600, upright |
| Surfaces | Soft cards, 14 px radius, no border | Ruled sections, 1 px hairlines, 2 px radius |
| Numbers | Atkinson Hyperlegible Next, large | Atkinson Hyperlegible Mono, 12.5 px |
| Motion | Playful, lap fill 600 ms | 120 ms at most, only to show state |

Rules of the house: depth comes from hairline rules, not shadows. Colour carries meaning, never decoration. Every colour meaning also has a glyph, a label or a pattern. Metric units, plain English, no TrainingPeaks terms (say Load, Weighted power, Intensity, Fitness, Fatigue, Form).

## 2. Color Palette & Roles

### Primitives

| Name | Hex | Role |
|---|---|---|
| ink | `#1A1714` | Text, hairlines, labels on track and sun |
| paper | `#FBF6EE` | Page, light |
| paper-2 | `#F3EBDD` | Raised surface, light |
| sand | `#EADFC8` | Sunken surface, zone 1 |
| track | `#E4572E` | Action fill, large display type, graphics. Never small text. |
| track-ink | `#B5391A` | Red text and links on light |
| sun | `#FFC83D` | Highlight and accent. Always paired with ink. |
| amber | `#EB9100` | Zone 3 |
| oxblood | `#8E2A17` | Zone 5, danger on light |
| infield | `#2F7D4F` | On plan |
| night / night-2 / night-3 | `#14110E` / `#1E1A16` / `#29241F` | Page, surface, raised, dark |
| chalk | `#F2EADC` | Text, dark |

### Semantic tokens (light | dark)

| Token | Light | Dark | Use |
|---|---|---|---|
| `--color-bg` | `#FBF6EE` | `#14110E` | Page |
| `--color-surface` | `#F3EBDD` | `#1E1A16` | Cards, sheets, rail |
| `--color-surface-sunken` | `#EADFC8` | `#0E0C0A` | Inputs, wells, table header |
| `--color-text` | `#1A1714` | `#F2EADC` | Body |
| `--color-text-muted` | `#6B6157` | `#A89D8E` | Secondary text (4.5 on bg, surface and sunken) |
| `--color-link` | `#B5391A` | `#F26B45` | Links, red text |
| `--color-action` | `#E4572E` | `#E4572E` | Primary button fill |
| `--color-action-hover` | `#EE6A40` | `#F26B45` | Primary hover |
| `--color-on-action` | `#1A1714` | `#1A1714` | Primary label (ink, never white) |
| `--color-accent` / `--color-on-accent` | `#FFC83D` / `#1A1714` | same | Highlights, chips, selection |
| `--color-rule` | ink 14% | chalk 16% | Hairlines |
| `--color-rule-strong` | ink 32% | chalk 36% | Decorative borders (tooltips, cards, dividers). Under 3:1: never the only edge of a control. |
| `--color-control-border` | `#7D746A` | `#8A8174` | Input, checkbox and segmented-track edges (3:1 on bg, surface and sunken) |
| `--color-focus` | `#1A1714` | `#F2EADC` | Focus ring (3:1 on bg and surface) |
| `--color-danger` | `#8E2A17` | `#FF8A6B` | Destructive text and fill |

Allowed text pairs (tested): text on bg, surface and sunken; muted on bg, surface and sunken; link on bg and surface (not on sunken, 4.46 in light);  on-action on action and hover; on-accent on accent; on-danger on danger; danger on bg. Target 4.5 for text. Display accent `#E4572E` / `#F26B45` is for large type (3:1) only.

### Sport colours

| Sport | Light | Dark | Redundant cue |
|---|---|---|---|
| Swim | `#2B6CB0` | `#6FA3DC` | wave glyph, label "Swim" |
| Bike | `#3A3632` | `#D9D0C3` | wheel glyph, label |
| Run | `#E4572E` (track) | `#F26B45` | foot glyph, label |
| Strength | `#857A6C` | `#9A8F80` | weight glyph, label |

All four are 3:1 against the page. Bike and strength are warm neutrals by decision, so the dataviz palette validator flags lightness and chroma for them: sport is therefore never colour-only. Always add glyph plus label, or use direct labels in charts.

### Zone ramp (easy to hard)

| Zone | Light | Dark | Label colour (light / dark) |
|---|---|---|---|
| Z1 | `#EADFC8` | `#4A4034` | ink / chalk |
| Z2 | `#FFC83D` | `#FFC83D` | ink / ink |
| Z3 | `#EB9100` | `#EB9100` | ink / ink |
| Z4 | `#E4572E` | `#E4572E` | ink / ink |
| Z5 | `#8E2A17` | `#B83C24` | paper / chalk |

Z1 to Z3 sit under 3:1 against the page in light, so zone bars get a 1 px ink hairline between fills and a "Z1" to "Z5" label. Z4 and Z5 pass 3:1 on their own.

### Status (compliance), never brand red

| State | Mark | Light | Dark | Text token (4.5) | Glyph and label |
|---|---|---|---|---|---|
| On plan | filled disc | `#2F7D4F` | `#5FBF86` | `#2A7048` / `#5FBF86` | check, "On plan" |
| Partial | yellow disc, ink outline | `#FFC83D` + ink | `#FFC83D` + chalk | `#7A5000` / `#FFC83D` | half disc, "Partial" |
| Over | hatched disc | `#5B4B8A` | `#A99BD6` | same as fill | up arrow, "Over" |
| Missed | hollow ring | `#5C534A` | `#C4BAAB` | same | ring, "Missed" |
| Unplanned | grey filled disc | `#8A8278` | `#766D63` | `#6B6157` / `#A89D8E` | plus, "Unplanned" |

Missed and unplanned are both grey and are told apart by shape (hollow versus filled) and label, not by colour. Compliance bands: 80 to 120% of plan is on plan.

### Chart series

| Series | Light | Dark | Line style |
|---|---|---|---|
| Fitness | `#1E6B73` | `#5FC0C8` | solid 2 px, direct label |
| Fatigue | `#B86200` | `#F59A23` | solid 2 px, direct label |
| Form | `#1A1714` | `#F2EADC` | dashed 2 px, filled area to zero line |

Colour-vision check (CIEDE2000, Machado deuteranopia and protanopia, full severity): the closest series pair is 26.5 in light (fitness and form, deutan) and 18.5 in dark (fitness and form, protan); anything above about 12 reads as different. Form is ink, so it reports a chroma warning by design; the dash carries identity. Chart text uses `--chart-axis` (`#6B6157` / `#A89D8E`, 4.5), never a series colour.

## 3. Typography Rules

| Role | Family (fontsource name) | Notes |
|---|---|---|
| Display | Anybody Variable, axes wdth 50 to 150, wght 100 to 900 | Athlete wdth 125 / 800 / italic. Coach wdth 75 / 600 / upright. |
| UI and body | Atkinson Hyperlegible Next Variable, wght 200 to 800 | |
| Data | Atkinson Hyperlegible Mono Variable, wght | Coach numbers and tables |

Banned: Inter, Geist, Space Grotesk, DM Sans, Manrope, Poppins, Bricolage Grotesque (the test fails on them).

Set display with `font-variation-settings: "wdth" N` and `font-stretch: N%`. Use `font-synthesis: none`.

| Step | Athlete (17 px, x1.25) | Coach (14 px, x1.125) |
|---|---|---|
| xs | 11 px (floor; 10.9 computed) | 11.1 px |
| sm | 13.6 px | 12.4 px |
| md (base) | 17 px | 14 px |
| lg | 21.3 px | 15.8 px |
| xl | 26.6 px | 17.7 px |
| 2xl | 33.2 px | 20 px |
| 3xl | 41.5 px | 22.4 px |
| 4xl | 51.9 px | 25.2 px |
| data | 15.3 px | 12.5 px mono |

- Line height: body 1.5 (athlete), 1.4 (coach). Display 1.05.
- Body column max 34em, about 70 characters (the UI face has a wide zero, so a ch measure runs long). Never below 11 px, and nothing meaningful below 12 px on the coach side.
- All numbers in data use `font-variant-numeric: tabular-nums`. Coach tables are mono with slashed zero.
- Sentence case. Uppercase only for coach section labels (`h4`, 0.06em tracking).
- Fonts are self-hosted with `font-display: swap`. Latin files only load unless other scripts appear.

**First-paint font payload (woff2, measured from node_modules):**

| Register | Files | Size |
|---|---|---|
| Athlete | Anybody latin wdth italic 62,084 B + Atkinson Next latin 33,996 B | 96,080 B (93.8 KB) |
| Coach | Anybody latin wdth normal 56,888 B + Atkinson Next 33,996 B + Atkinson Mono 17,752 B | 108,636 B (106.1 KB) |

Both are under the 110 KB budget (110,000 B).

## 4. Component Stylings

Values are register-aware: athlete / coach where they differ. Radii: control 10 / 2 px, card 14 / 2 px. Hairline 1 px at `--color-rule`.

**Buttons.** Height 48 / 28 px, padding 0 20 / 10 px, label weight 700, radius control.
- Primary: fill `--color-action`, label ink, hover `--color-action-hover`, no border. Active translates 1 px down.
- Secondary: transparent, 1.5 px `--color-text` border, ink label; hover fill `--color-surface`.
- Ghost: no border, `--color-link` label, underline on hover.
- Destructive: fill `--color-danger` with `--color-on-danger` label; always behind a confirm step. Disabled: 40% opacity plus `aria-disabled`, no hover.

**Inputs.** Height 48 / 28 px, fill `--color-surface-sunken`, 1 px `--color-control-border` border, radius control. Label above, 13.6 / 12.4 px, muted. Focus: 3 px focus ring offset 2 px. Error: danger border plus message with a leading `!` glyph. Numeric inputs are right aligned, tabular, with a unit suffix.

**Segmented control.** Track `--color-surface-sunken` with a 1 px `--color-control-border` edge, radius pill (athlete) or 2 px (coach). Selected segment `--color-text` fill with `--color-bg` label in athlete; in coach a 2 px ink underline and bold label. Segments at least 44 / 28 px.

**Chips.** Height 32 / 20 px, pill / 2 px. Filter chip: 1 px rule border; selected = `--color-accent` fill, ink label, check glyph. Sport chip: sport glyph plus label, sport colour only on the glyph.

**Race-bib card (athlete).** Paper-2 card, radius 14 px, 2 px `--color-text` inner rule 8 px inside the edge. Two pin holes (12 px circles, `--color-bg` fill, 1.5 px ink ring) at top left and top right, 14 px from the edges. Bib number in display italic 4xl; sport glyph top-centre. A dashed tear line 1.5 px at 70% height separates the details from the stub (date, duration). Used for the next workout and for races.

**Results-sheet table (coach).** Rows 28 px, `border-bottom` 1 px rule, header row sticky, uppercase labels in display wdth 75 at 12.4 px, `--color-surface-sunken` header. Numeric columns right aligned mono 12.5 px; text columns left. Row hover: `--color-surface`. Selected row: 2 px track bar on the left edge. Zebra: none. Rank and delta cells show an arrow glyph with the value.

**Sheet / drawer.** Athlete: bottom sheet, `--color-surface`, top radius 14 px, grab handle 36 x 4 px, max height 90dvh, scrim `--color-scrim`, slide 240 ms. Coach: right drawer 420 px, 1 px left rule, no radius, appears in 90 ms. `--shadow-sheet` only on the athlete sheet. Focus trap, Esc closes, focus returns to the trigger.

**Toast.** Bottom centre (athlete, above the bar) or bottom left (coach). `--color-text` fill, `--color-bg` text (flips in dark), radius control, `--shadow-toast`, 4 s timeout, action button in sun. A text status always accompanies the glyph; `role="status"`.

**Tabs.** Athlete: pill tabs, 44 px, selected = `--color-text` fill with `--color-bg` label. Coach: underline tabs, 28 px, 2 px ink underline, bold label. Arrow keys move, Home/End jump.

**Bottom bar (athlete).** 64 px plus safe-area inset, `--color-surface`, 1 px top rule. Five slots: Today, Week, **Log**, Progress, Me. Log is a 56 px track-fill disc raised 14 px above the bar with a 4 px `--color-bg` ring and an ink plus glyph; label below. Items 44 px minimum, glyph 24 px, label 12 px. Selected item: ink glyph in a sun pill.

**Left rail (coach).** 56 px collapsed, 208 px expanded, `--color-surface`, 1 px right rule. Items 28 px, glyph 20 px, label 14 px; selected has a 2 px track bar on the left edge and bold label. Keyboard hints in mono at the right edge.

**Badges.** Achievement: 56 px circle, ink ring, sun fill, display glyph; earned badges get a finish-tape ribbon (diagonal 45 degree ink and paper stripes, 6 px). Unearned: dashed ring, muted. Count badge: 18 px, track fill, ink numeral.

**Flag rows (coach).** A row 28 px with a severity glyph (triangle for caution, octagon for stop), the rule name, the values ("Form -34 against -30") and the athlete. Left bar 3 px: caution = `--status-partial-text`, stop = `--color-danger`. Never colour only: the glyph shape and the word "Caution" or "Stop" appear. Expand to show rule, values, explanation. AI never creates flags.

**Calendar cells.** Coach cell min 120 x 96 px, 1 px rule grid, date in mono top right, today marked with a 2 px track outline. Workout block: 4 px left bar in sport colour, glyph, title, planned duration; compliance mark at the right (section 2). Athlete cells: 44 px day circles in a week strip; today = sun fill; a workout dot under each day in the sport colour with glyph in the detail.

**Charts.**
- Axes: 1 px `--color-rule-strong` baseline; no y axis line. Tick labels in `--chart-axis`, 12.4 px (coach mono) / 13.6 px (athlete), tabular.
- Gridlines: horizontal only, 1 px `--chart-grid`, at most 5. No vertical grid except week boundaries in the planner.
- Labels: direct-label up to 4 series at the line end in text colour with a coloured 8 px marker. Never write a number on every point.
- Legend: one row above the plot, marker plus label in text colour, always present for 2 or more series.
- Tooltip: `--color-bg` fill, 1 px rule-strong border, radius control, crosshair line 1 px, hit target at least 24 px, appears after 0 ms in coach, 120 ms in athlete.
- Marks: 2 px lines, bars with 4 px rounded data ends and 2 px surface gaps, markers 8 px with a 2 px surface ring.
- Compliance marks: green disc = on plan; yellow disc with ink outline = partial; hatched (45 degree, 2 px lines) = over; hollow ring with the word "Missed" beside it = missed; grey disc = unplanned.
- Every chart has a table view and a text summary for screen readers.

**Empty states.** A small track-lane illustration (4 lane lines, 120 px), one sentence in plain English saying what is missing, one primary action. Athlete: display italic headline. Coach: concise line plus a keyboard hint. Never "Oops".

**Focus.** `:focus-visible` shows a 3 px solid `--color-focus` outline with 2 px offset on every interactive element, in both registers. Never remove it. In forced colours it becomes `Highlight`.

## 5. Layout Principles

- Spacing scale (px): 0, 4, 8, 12, 16, 20, 24, 32, 40, 48, 64 (`--space-*`). Athlete uses 12 to 16 inside cards and 16 to 24 between; coach uses 4 to 8 inside cells and 8 to 16 between.
- Athlete: single column, 16 px gutters, content max 560 px centred on larger screens, bottom bar fixed, content padded by bar height. One primary action per screen.
- Coach: left rail plus content; content on a 12-column grid with 16 px gutters, max 1600 px; page header 40 px; sections separated by a 2 px `--color-text` rule with the label sitting on it.
- Rows: 56 px (athlete list rows), 28 px (coach rows).
- Touch targets: 44 px minimum in athlete; 28 px minimum pointer targets in coach with 8 px spacing.
- Alignment: numbers right aligned in columns; units in muted text immediately after.
- Radii scale: 0, 2, 6, 14, pill (`--radius-*`).
- Dates: week starts Monday. Units: metric. Locale: Malaysian English.

## 6. Depth & Elevation

Hairlines first. Depth is expressed by surface step and rules, not blur.

| Level | Treatment |
|---|---|
| 0 Page | `--color-bg` |
| 1 Card / rail | `--color-surface`, athlete no border, coach 1 px rule |
| 2 Sunken | `--color-surface-sunken` for inputs and wells |
| 3 Sheet | `--shadow-sheet` (1 px rule plus one soft shadow), athlete only |
| 4 Toast | `--shadow-toast` |

Z-index: base 0, sticky 10, bar 20, rail 20, popover 40, sheet 50, toast 60, tooltip 70.

Motion durations (reduced motion sets every one to 0 ms, and base.css also cuts CSS animations to 0.001 ms):

| Token | Athlete | Coach |
|---|---|---|
| `--dur-fast` | 120 ms | 60 ms |
| `--dur-base` | 240 ms | 90 ms |
| `--dur-slow` | 400 ms | 120 ms |
| `--dur-fill` (lap fill) | 600 ms | 120 ms |

Easing: standard `cubic-bezier(0.2, 0, 0, 1)`, out `cubic-bezier(0.1, 0.7, 0.2, 1)`, lap `cubic-bezier(0.45, 0.05, 0.25, 1)`. Animate transform and opacity only.

## 7. Do's and Don'ts

Do:
- Pair sun with ink, track fills with ink labels, red text with `--color-link`.
- Give every colour meaning a glyph, a label or a pattern.
- Use hairlines to separate, and tabular numerals for data.
- Keep the athlete screen to one primary action and the coach screen to one task.
- Write plain English: "Rest day", "On plan", "Load", "Fitness".
- Test each new colour pair in `tokens.test.ts` before using it.

Don't:
- Use track or track-ink for any status, error or missed session. Oxblood appears as `--color-danger` only on destructive controls and their messages, always with a glyph and the word.
- Put white text on track, or small text in track red.
- Use gradients, glass, glows, blobs, emoji icons, or generic card shadows.
- Use Tailwind, shadcn, lucide, or any banned font.
- Use TSS, NP, IF or other TrainingPeaks marks.
- Colour text with a series colour, or use a dual axis.
- Let a streak or badge reward more than the plan asks for.
- Auto-play motion outside a user action; honour reduced motion.

## 8. Responsive Behavior

| Width | Behaviour |
|---|---|
| 0 to 599 | Athlete layout: bottom bar, single column, sheets. Coach pages stack; tables scroll horizontally inside a labelled region; rail becomes a top menu button. |
| 600 to 899 | Athlete content centred at 560 px; coach rail collapsed to 56 px, tables show 6 key columns. |
| 900 to 1279 | Coach rail expanded, 12-column grid at 8 columns of content plus a 4-column side panel as a drawer. |
| 1280 and up | Coach full results sheet, side panel docked, max width 1600 px. |

- The register is chosen by role, not width. An athlete on a desktop sees the athlete register centred; a coach on a phone sees the coach register at 14 px with 44 px minimum targets for primary actions only.
- Supports 200% zoom without horizontal scroll (except labelled data tables) and 320 px width.
- Respect safe-area insets (`env(safe-area-inset-bottom)`) for the bottom bar and sheets.
- `prefers-color-scheme` sets the theme until the user picks; `prefers-reduced-motion` zeroes motion; `forced-colors` keeps shapes, borders and labels.
- Print: coach results sheet prints black on white with hairlines.

## 9. Agent Prompt Guide

Quick reference for any agent: tokens are CSS variables from `src/styles/tokens.css`; no raw hex in components; CSS Modules in `@layer components`; hand-drawn 24 px icons; ink labels on track; status never uses brand red.

**Prompt: build an athlete screen**

> Build the `<name>` screen for the Laree athlete register. Wrap in `data-register="athlete"`. Use tokens only: `--color-*`, `--space-*`, `--radius-card` (14 px), `--text-*` (17 px base, ratio 1.25), `--dur-*`. Headings in Anybody wdth 125, weight 800, italic. Single column, 16 px gutters, 44 px minimum touch targets, one primary action (track fill, ink label, 48 px). Show the next workout as a race-bib card with pin holes. Use compliance marks with glyph and label, never colour alone. Motion: lap fill 600 ms, everything honours reduced motion. Include loading, empty (track lane illustration plus one sentence) and error states. Plain English, metric units. No gradients, glass, glows, shadows beyond `--shadow-sheet`, no emoji icons. Check against section 7.

**Prompt: build a coach screen**

> Build the `<name>` screen for the Laree coach register. Wrap in `data-register="coach"`. Tokens only: 14 px base, ratio 1.125, `--row-h` 28 px, `--radius-card` 2 px, hairlines `--color-rule` (14% ink). Headings in Anybody wdth 75, weight 600. Numbers in Atkinson Hyperlegible Mono at 12.5 px, tabular, right aligned. Use ruled sections (2 px ink rule with label), a results-sheet table with sticky header and 28 px rows, a left rail, and full keyboard support with visible 3 px focus rings. Motion at most 120 ms. Charts: 2 px lines, horizontal grid only, direct labels, a legend, a table view, compliance marks per section 4. Flags show rule, values and explanation; AI never generates flags. Check against section 7.

**Prompt: add a chart**

> Draw the `<chart>` as hand-written SVG with d3-scale and d3-shape. Colours only from `--sport-*`, `--zone-*`, `--status-*`, `--series-*`. Add a legend, direct labels for up to four series, `--chart-axis` tick text, a hover tooltip with 24 px hit targets, a table view, and a text summary. No dual axis. Verify light and dark.

**Prompt: add a colour or token**

> Add the token to both light and dark blocks in `tokens.css` (the media-query block and `html[data-theme="dark"]` must match), add every allowed text or graphic pair to `tokens.test.ts` with its 4.5 or 3 target, document it in section 2 of DESIGN.md, and run `npx vitest run src/styles`.
