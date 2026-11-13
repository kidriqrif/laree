# PWA and rename safety (T11.5)

| Check | How | Result |
|---|---|---|
| Manifest | `npm run check:manifest`: start URL and scope `./`, maskable and monochrome icons, shortcuts | Pass |
| Rename safety | `npm run check:base`: serves `dist` under a different path and loads the app | Pass |
| Precache | Service worker inspected in the browser during M11 | Pass: 230 entries |
| Log shortcut | Opened `#/athlete/today?sheet=log`, the shortcut's target | Pass: the "Log a session" sheet opens |
| Update flow | After each new build the old worker keeps serving until the update toast is accepted. Seen during QA as stale styles until the caches were cleared. | Works as designed: the app never reloads under the user |
| Offline reload | Not emulated this round. The precache covers every route's files. | Not re-tested |
| Install | The built-in browser cannot install apps. | Not tested; check on a phone during M12 |

## Findings

| ID | Severity | Finding | Outcome |
|---|---|---|---|
| P1 | Low | `og:image` is a relative URL, which some link-preview crawlers ignore. | **Deferred.** An absolute URL ties the build to one host and breaks rename safety. Revisit with a custom domain. |
| P2 | Low | The manifest background colour is light only. | **Deferred.** Manifests take one background colour; the splash shows for a moment and the paper colour matches the default theme. |
