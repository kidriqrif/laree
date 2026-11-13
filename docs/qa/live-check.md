# Live-site check (T12.2)

13 November 2026. Two parts: the release build served the way GitHub Pages serves it, and the live site as it stands today.

## Release build under a Pages-style path

The build of `agent-staging` at `c3afe95` (entry `assets/index-iZtaJ7Kg.js`), served by `vite preview` under `/laree/`, the same path Pages uses. Checked in the built-in browser after clearing the service worker, caches and storage.

| Check | How | Result |
|---|---|---|
| Rename safety | `node scripts/check-base-path.ts <build>`: every file resolves under `/some/other/path/` | Pass |
| Start page | Open `/laree/` | Pass: role picker, "Who are you today?" |
| Manifest | Fetch the linked manifest | Pass: 200, start URL and scope `./`, 4 icons, shortcuts for Log and Today |
| Deep links reload | Full reload on `#/athlete/today`, `#/athlete/week?w=-1`, `#/coach/calendar/irfan`, `#/coach/season/amir`, `#/coach/library/new` | Pass: each reloads to its own page and tab title |
| Not found | Full reload on `#/coach/nope` | Pass: "Off course" inside the coach shell, tab "Not found · Laree" |
| Role switch | Switcher: Danial from Overview, then Coach | Pass: Danial lands on Today; Coach returns to Overview, the coach page left |
| Reset | `#/reset`, Reset demo data, confirm | Pass: "Demo data reset." with a link to choose who to view as; the viewer goes back to the default |
| Service worker | Registration after first load | Pass: active, scope `/laree/`, 242 files precached, including the lazy FIT, import and export chunks |
| Offline reload | Stop the server, reload on `#/coach/analytics/danial` | Pass: the page and its three fonts load from the cache; an uncached request fails as expected |
| Console | Errors during the run | None from the app. One refused connection, from the offline test. |

## README demo walk

All 28 steps of the README demo were walked on the same Pages-style setup, phone-sized for the athlete steps and 1440 × 900 for the coach steps. Each fix below was rebuilt and the step walked again. Every step passes, and each fix has a test.

| Where | Found | Fixed |
|---|---|---|
| Any page change | A new page opened at the old page's scroll position, so Week or the calendar could open half-way down. | A new page now opens at the top. Back and Forward keep the browser's own restore, and a sheet opening leaves the page where it is. |
| Flags (steps 9 to 11, 15) | Flag values said "today" and "last night" even when the values were from an earlier day, such as on an older check-in. | Values measured before today now carry their date, for example "54 bpm on 9 Nov, 53 bpm the day before". The AI facts use the same line. |
| Step 17 | "Fill from library" spilled off the right of the screen: the table was 1,152 px wide inside a 480 px dialog, and "Apply" sat off-screen. | Dialogs have a wide size, up to 72 rem, and the fill dialog uses it. |
| Step 19 | With unsaved edits, switching "Preview for athlete" asked "Leave without saving?". | Only leaving the page asks. Switching the preview stays on the page. |
| Step 22 | "Add to calendar" opened on the coach's last athlete, not the one being previewed, and the toast gave the date as 2026-11-16. | It opens on the previewed athlete, as Export does, and the toast reads "on Monday 16 Nov". |
| Step 26 | The check-in summary quoted the stored HRV baseline (72 ms) while the drawer above it showed the usual HRV from the last 28 days (71 ms). | The summary uses the same 28-day usual values as the drawer and the flags. |

Small notes, left as they are:

- On the calendar, focusing a session's "Move" button from a script lets the grid take the focus back. A real click on "Move", or `m` on a focused session, works.
- Dropping a session onto a day that has one announces the drop before the "Keep both" or "Swap" choice.

## Live site today

`https://kidriqrif.github.io/laree/` serves `main`, which is at M6. The role picker loads, the manifest returns 200 and there are no console errors. The M7 to M11 screens are still stubs there (for example Check-ins reads "This screen is coming"), because they live on `agent-staging` until the pull request is merged.

## Still to do after the merge

1. Re-run the table above on the live URL once the Pages deploy of the merge commit succeeds.
2. Install the app on a phone (Add to Home Screen on iOS, Install on Android), open it from the icon, try the Log shortcut and reload in airplane mode.
3. Walk the README demo script on the live site.
4. Tag `v0.1.0-prototype` on that merge commit (T12.3).
