# Keyboard, zoom, motion and contrast (T11.4)

A reviewer agent audited both apps for accessibility against WCAG 2.2 AA and the web interface guidelines. The design reviews in `athlete.md` and `coach.md` covered the rest of T11.4. Contrast was computed for every token pair. The weak pairs (strength, fatigue, zone 1) are used only for fills and strokes that also carry a label or border.

## What was checked, and how

| Check | How | Result |
|---|---|---|
| Keyboard only, both flows | Reviewer walk-through; unit tests for the role switcher, calendar move path, phase slider and single-key shortcuts | Pass after A2, A3, A4 |
| 200% zoom | Type and spacing moved to rem (A6); the read-only switch now needs a small touch screen (A1). Rendered in the browser at 200% text size in T11.4b (below). | Pass after Z1 to Z11 |
| Reduced motion | The `prefers-reduced-motion` rules turn off the lap fill, sheet slides and badge motion. Emulated in the browser in T11.4b (below). | Pass |
| Colour blindness | Every status has a glyph or pattern as well as a colour (F3, F4). Simulated in the browser in T11.4b (below). | Pass |
| Contrast | Token pairs computed by the reviewer; rendered text checked by `impeccable detect` on four screens | Pass |

## Findings

| ID | Severity | Finding | Outcome |
|---|---|---|---|
| A1 | High | Coach editing disappeared below 1024 CSS px, so 200% zoom on a desktop made the coach app read-only. | **Fixed.** Read-only only on small touch screens; a zoomed or narrow window with a mouse stays editable. |
| A2 | Medium | Route changes only changed the document title; focus stayed put and nothing was announced. | **Fixed.** Focus moves to the page heading and a polite live region names the new page. |
| A3 | Medium | Arrow keys in the role switcher switched the viewer at once. | **Fixed.** Arrows move focus; Space or Enter commits. |
| A4 | Medium | The sticky bars could cover a focused element. | **Fixed.** Scroll padding keeps focused elements clear of the bars. |
| A4b | Medium | Field errors were plain text, not announced. | **Fixed.** Fields set `aria-invalid` and the error is an alert. |
| A5 | Medium | The coach phase slider thumb was 16 × 20 px. | **Fixed.** The thumb keeps its look; an invisible hit area around it reaches the 28 px coach target. |
| A6 | Medium | Base sizes were fixed px, so browser text size had no effect. | **Fixed.** Type and spacing use rem. |
| A7 | Medium | The Calendar board went from h1 to h3. | **Fixed.** |
| A9 | Low | Three toast regions sit at the same edge and can stack. | **Deferred.** They rarely appear together in the prototype; one toast queue belongs with the MVP's notification work. |
| A10 | Low | Short Season phases clip their names. | **Deferred.** The full name is in the phase table and the accessible label. |
| Q4 | Low | Headings that only take focus from script drew a focus ring. | **Fixed.** No ring on programmatic focus; interactive elements keep theirs. |
| Q15 | Low | The skip link was below the target size. | **Fixed.** 44 px in the athlete register, 36 px on the coach desk. |

A8, A11 and A12 are listed in `athlete.md` and `coach.md`.

## Browser checks for zoom, motion and colour (T11.4b)

Run in the built-in browser on a production build of `agent-staging`, 13 November 2026, in the light and dark themes.

### 200% zoom

**How.**
- **Athlete.** Every page, the Log and Check-in sheets, and the workout and activity pages, for Amir, Danial and Irfan. Each at 390, 360 and 320 px wide, with the browser text size at 100% and at 200%.
- **Coach.** Every section at 1440 × 900, at 100% and 200% text size. Every section again at 768 × 432 at 100%, which is what a 1536 × 864 laptop shows at 200% page zoom.

On each screen a script looked for four things:
- anything past the right edge that no scrolling box contains;
- any box that scrolls sideways;
- text spilling out of its box;
- on the athlete side, a word in a heading, big figure, label or title broken across two lines.

**Result.** After the fixes below, no screen scrolls sideways at either size, and nothing spills.

Three wide grids scroll sideways inside their own box: the coach data tables, the check-in grid and the Calendar week grid. They are two-dimensional data, which WCAG 1.4.10 exempts from reflow, and arrow keys bring each cell into view. At the default size every button keeps its 48 px athlete height and 28 px coach height, and the flag inbox keeps its columns.

| ID | Severity | Finding | Outcome |
|---|---|---|---|
| Z1 | Medium | Log sheet: the Quick log / Import file / Sync device control ran 11 px off a 390 px screen at 200%. At the default size it would also overflow a 360 px phone. | **Fixed.** Segments wrap onto a second row, and their side padding narrows on small screens first. |
| Z2 | Medium | Log sheet: a long session name in "Which session?" spilled over the field's border at 200%. | **Fixed.** The field grows to fit its text. |
| Z3 | Medium | Button labels never wrapped. "Send to device (simulated)" made the Workout page 19 px too wide at 360 px and 200%. | **Fixed.** A label wraps and the button grows when it would be wider than its space. |
| Z4 | Medium | Chips never wrapped. "On plan, 96% of planned" ran off the Activity page at 360 px and 200%. | **Fixed.** Same as Z3. A one-line chip is still a pill. |
| Z5 | Low | Display words at 200%: "Kudos" was wider than its badge bib, and the date pushed "Today" off the line. | **Fixed.** Display sizes follow the text size with no cap (a cap in screen widths would stop text reaching 200%). When the page or sheet is narrow for its text size, the display face switches from its expanded width to a condensed one, and narrower again at about twice the text size on a phone, so words keep their full size and fit. A word still wider than the screen breaks, as a last resort. The date wraps under the heading and keeps to the end. |
| Z6 | Low | The "viewing as" switcher cut off the athlete's name before its prefix. | **Fixed.** The prefix shortens first; the name always shows. |
| Z7 | Low | Tab bar labels grew until five no longer fit across a phone. | **Fixed.** Labels grow with the text size with no cap. A column is never narrower than its label, so a long label ("Progress") takes room from the short ones instead of breaking mid-word, and the icon pill narrows first. The bar grows with the text size, with room for two lines of label. |
| Z8 | Medium | Coach rail at 200%: the Jump to field was squashed, the 208 px rail wrapped its rows, and the athlete initials outgrew their 24 px box. | **Fixed.** The rail widens with the text size, rows keep their height and the rail scrolls, and the initial boxes grow. |
| Z9 | Medium | Check-ins flag inbox: the fixed columns squeezed the flag title to nothing at 200%. The same happened at the default size in windows of about 1024 to 1300 px. | **Fixed.** The row layout follows the width of the list rather than the screen. A narrow list puts the title on its own line, and the parts wrap if needed. |
| Z10 | Low | Season: the race letters outgrew their 20 px circles at 200%. | **Fixed.** The circle grows with the letter. |
| Z11 | Medium | Today at 200%: a missed-session row (chip, text and "Log it") and the check-in strip's two buttons stayed on one line. With a missed session the page was 39 px too wide at 360 px; at 320 px the check-in buttons alone made it 2 px too wide. | **Fixed.** Both wrap: the row's parts stack and the two buttons go one above the other, only when they do not fit. |

### Reduced motion

**How.**
- Every `prefers-reduced-motion` rule in the loaded style sheets, including those of screens loaded later, was switched to "reduce".
- `matchMedia` answered the same, so the script checks agreed with the style sheets.

**Result.**

| What | With motion | Reduced motion |
|---|---|---|
| Duration tokens | `--dur-fast` 120 ms, `--dur-fill` 600 ms | 0 ms |
| Any animation or transition | Normal timing | 0.001 ms, played once |
| Today, Week, Progress, Me | Lap fill, sheet slides | No animation running |
| Log sheet | Slides up | Opens at its end position |
| "Saved" stamp after a log | Plays its stamp animation | Already at its end state |

The track lap reads the same setting through `matchMedia` and draws its end state. The badge finish tape animates only under `no-preference`, so it shows already broken. The tape was not triggered live.

### Colour blindness

**How.** Full-page colour filters stood in for four kinds of colour blindness:
- protanopia, deuteranopia and tritanopia, using the Machado, Oliveira and Fernandes (2009) matrices at full severity;
- achromatopsia, as plain luminance.

| Screen | Filter | What it covers |
|---|---|---|
| Athlete Week | Deuteranopia | The lap and the status chips |
| Coach Check-ins | Greyscale | The sleep grid and the flag inbox |
| Coach Overview | Protanopia and tritanopia | The compliance and form columns |

The closest pair of status colours was also computed under each filter, as an OKLab distance:
- In greyscale, "over" and "missed" (fills) and "on plan" and "unplanned" (text) are the same grey: a distance of 0.002.
- Under deuteranopia, the "on plan" and "unplanned" text colours are 0.018 apart.

**Result.** Pass. Colour alone would not carry these states, and it never has to:
- every status chip has a glyph and a word;
- the compliance column has a filled-circle glyph and a percentage;
- form shows a word ("Steady", "Overreaching", with a warning glyph);
- flags read ACT, WATCH or INFO;
- sleep cells print their number;
- each lap lane has a positioned swatch and a name in the key.
