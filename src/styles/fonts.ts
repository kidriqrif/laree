// Self-hosted variable fonts (OFL). Each file below declares latin, latin-ext
// and (Anybody) vietnamese faces with unicode-range, so the browser fetches only
// the latin file unless a page uses other characters.
//
// First-paint payload (woff2, latin only; see DESIGN.md section 3):
//   athlete: Anybody wdth italic 62.1 KB + Atkinson Next 34.0 KB            = 96.1 KB
//   coach:   Anybody wdth normal 56.9 KB + Atkinson Next 34.0 KB + Mono 17.8 KB = 108.7 KB
// Both stay under the 110 KB budget because faces download only when used.
import "@fontsource-variable/anybody/wdth.css";
import "@fontsource-variable/anybody/wdth-italic.css";
import "@fontsource-variable/atkinson-hyperlegible-next/wght.css";
import "@fontsource-variable/atkinson-hyperlegible-mono/wght.css";
