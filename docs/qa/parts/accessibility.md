# Keyboard, zoom, motion and contrast (T11.4)

A reviewer agent audited both apps for accessibility against WCAG 2.2 AA and the web interface guidelines. The design reviews in `athlete.md` and `coach.md` covered the rest of T11.4. Contrast was computed for every token pair. The weak pairs (strength, fatigue, zone 1) are used only for fills and strokes that also carry a label or border.

## What was checked, and how

| Check | How | Result |
|---|---|---|
| Keyboard only, both flows | Reviewer walk-through; unit tests for the role switcher, calendar move path, phase slider and single-key shortcuts | Pass after A2, A3, A4 |
| 200% zoom | Type and spacing moved to rem (A6); the read-only switch now needs a small touch screen (A1). Not re-rendered at 200% in the browser this round. | Pass by construction; not re-measured |
| Reduced motion | The `prefers-reduced-motion` rule in `tokens.css` turns off the lap fill and badge motion. Not emulated in the browser this round. | Rule present; not emulated |
| Colour blindness | Every status has a glyph or pattern as well as a colour (F3, F4). No simulator was run. | Pass by rule; not simulated |
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
