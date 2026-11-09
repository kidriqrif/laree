/**
 * Laree icon geometry, as data. No React here, so scripts and tests can read it too.
 *
 * Grid rules (DESIGN.md: "hand-drawn 24 px icons"):
 * - 24 x 24 grid with a 2 px live-area padding: ink stays inside 2..22.
 * - One stroke weight for the whole set: 2 px, round caps, round joins, currentColor.
 * - No fills, except small dots (`dot: true`).
 * - Straight horizontal and vertical strokes sit on whole-pixel centre lines, so they stay crisp at 24 px.
 * - Containers use a 2 px corner radius; small parts use 1.5.
 * - Circles run a little larger than squares so they look the same size.
 * The running-track language (lanes, bends, staggered starts) shows in Today, Week, Progress,
 * Season, Race and Streak, kept abstract enough to read as icons, not pictures.
 */

/** One drawn element: a stroked path, a stroked circle or a filled dot, or a stroked rectangle. */
export type IconNode =
  | { readonly d: string }
  | { readonly cx: number; readonly cy: number; readonly r: number; readonly dot?: true }
  | { readonly x: number; readonly y: number; readonly w: number; readonly h: number; readonly rx?: number }

export type IconGeometry = readonly IconNode[]

/* Shared parts, so related icons stay identical where they overlap. */
const CALENDAR_BOX: IconNode = { x: 4, y: 5, w: 16, h: 16, rx: 2 }
const CALENDAR_TABS: IconNode = { d: 'M8 3v3M16 3v3' }
const CALENDAR_RULE: IconNode = { d: 'M4 9h16' }
const TRAY: IconNode = { d: 'M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4' }
const OPEN_BOX: IconNode = { d: 'M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4' }

/* ── Athlete navigation ─────────────────────────────────────────────── */

/** The bend sits on the baseline: a half-risen sun over the straight and a second lane. */
export const todayPaths: IconGeometry = [
  { d: 'M3 16h18' },
  { d: 'M7 16a5 5 0 0 1 10 0' },
  { d: 'M12 4v3' },
  { d: 'M3.52 7.52l2.12 2.12' },
  { d: 'M20.48 7.52l-2.12 2.12' },
  { d: 'M7 20h10' },
]

/** A calendar page with one lane running across it: this week. */
export const weekPaths: IconGeometry = [CALENDAR_BOX, CALENDAR_TABS, CALENDAR_RULE, { d: 'M8 15h8' }]

/** A tally of five: logging, lap by lap. */
export const logPaths: IconGeometry = [{ d: 'M6 5v14M10 5v14M14 5v14M18 5v14' }, { d: 'M3 16 21 8' }]

/** Two lanes through the bend, the outer one rising. */
export const progressPaths: IconGeometry = [
  { d: 'M3 20h5a9 9 0 0 0 9-9V4' },
  { d: 'M13 8l4-4 4 4' },
  { d: 'M3 16h5a5 5 0 0 0 4.33-2.5' },
]

export const mePaths: IconGeometry = [{ cx: 12, cy: 8, r: 4 }, { d: 'M5 21v-1a4 4 0 0 1 4-4h6a4 4 0 0 1 4 4v1' }]

/* ── Coach navigation ───────────────────────────────────────────────── */

export const overviewPaths: IconGeometry = [
  { x: 4, y: 4, w: 6, h: 8, rx: 1.5 },
  { x: 14, y: 4, w: 6, h: 4, rx: 1.5 },
  { x: 14, y: 12, w: 6, h: 8, rx: 1.5 },
  { x: 4, y: 16, w: 6, h: 4, rx: 1.5 },
]

export const athletesPaths: IconGeometry = [
  { cx: 9, cy: 8, r: 3.5 },
  { d: 'M3 21v-1a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v1' },
  { d: 'M16 4.5a3.5 3.5 0 0 1 0 7' },
  { d: 'M18 16a3 3 0 0 1 3 3v2' },
]

export const calendarPaths: IconGeometry = [
  CALENDAR_BOX,
  CALENDAR_TABS,
  CALENDAR_RULE,
  { cx: 8, cy: 13, r: 1, dot: true },
  { cx: 12, cy: 13, r: 1, dot: true },
  { cx: 16, cy: 13, r: 1, dot: true },
  { cx: 8, cy: 17, r: 1, dot: true },
  { cx: 12, cy: 17, r: 1, dot: true },
]

/** Training phases as overlapping blocks, staggered like the start of a 400. */
export const seasonPaths: IconGeometry = [
  { x: 3.5, y: 3, w: 7, h: 4, rx: 2 },
  { x: 8.5, y: 10, w: 7, h: 4, rx: 2 },
  { x: 13.5, y: 17, w: 7, h: 4, rx: 2 },
]

export const libraryPaths: IconGeometry = [{ d: 'M5 4v16' }, { d: 'M9 7v13' }, { d: 'M13 4v16' }, { d: 'M16 6l4 14' }]

/** A workout profile: warm-up, two efforts, cool-down. */
export const builderPaths: IconGeometry = [{ d: 'M3 18h3V9h4v9h3V6h4v12h4' }]

export const analyticsPaths: IconGeometry = [{ d: 'M3 3v18h18' }, { d: 'M7 15l4-5 3 3 6-7' }]

export const checkInsPaths: IconGeometry = [
  { d: 'M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2' },
  { x: 9, y: 3, w: 6, h: 4, rx: 1.5 },
  { d: 'M9 13l2 2 4-4' },
]

export const settingsPaths: IconGeometry = [
  { d: 'M3 7h9.5M17.5 7H21' },
  { cx: 15, cy: 7, r: 2.5 },
  { d: 'M3 17h3.5M11.5 17H21' },
  { cx: 9, cy: 17, r: 2.5 },
]

export const brandPaths: IconGeometry = [
  { d: 'M12 21a9 9 0 1 1 9-9c0 2.2-1.8 3.5-4 3.5h-1.5a2 2 0 0 0-1.6 3.2c.9 1.2.1 2.3-1.9 2.3z' },
  { cx: 6.5, cy: 12, r: 1.25, dot: true },
  { cx: 8.11, cy: 8.11, r: 1.25, dot: true },
  { cx: 12, cy: 6.5, r: 1.25, dot: true },
  { cx: 15.89, cy: 8.11, r: 1.25, dot: true },
]

export const kitPaths: IconGeometry = [
  { cx: 7, cy: 7, r: 3.5 },
  { x: 14, y: 4, w: 6, h: 6, rx: 1.5 },
  { d: 'M7 13.5l4 6.5H3z' },
  { d: 'M17 13.5v7M13.5 17h7' },
]

/** Back round to the start line. */
export const resetPaths: IconGeometry = [{ d: 'M5.5 9.25A7.5 7.5 0 1 0 12 5.5' }, { d: 'M14.12 7.62 12 5.5l2.12-2.12' }]

export const menuPaths: IconGeometry = [{ d: 'M4 6h16M4 12h16M4 18h16' }]

/* ── Sports ─────────────────────────────────────────────────────────── */

export const swimPaths: IconGeometry = [
  { cx: 16.5, cy: 8, r: 2 },
  { d: 'M5 12l4.5-3.5 4.5 4' },
  { d: 'M3 18c1.5-2 3-2 4.5 0s3 2 4.5 0 3-2 4.5 0 3 2 4.5 0' },
]

export const bikePaths: IconGeometry = [
  { cx: 6.5, cy: 16, r: 3.5 },
  { cx: 17.5, cy: 16, r: 3.5 },
  { d: 'M6.5 16 10 9h5.5l2 7' },
  { d: 'M10 9l2 7 3.5-7' },
  { d: 'M6.5 16H12' },
  { d: 'M10 9V6M8.5 6h3' },
]

export const runPaths: IconGeometry = [
  { cx: 15.5, cy: 5, r: 2 },
  { d: 'M5.5 12.5 8.5 9h4l2.5 3.5 3.5.5' },
  { d: 'M12.5 9 10 14.5' },
  { d: 'M10 14.5l3.5 2.5-1 4' },
  { d: 'M10 14.5 7.5 18H4' },
]

export const strengthPaths: IconGeometry = [{ d: 'M4 9v6M8 6v12M16 6v12M20 9v6M8 12h8' }]

/** Bike then run, stacked like bricks. */
export const brickPaths: IconGeometry = [{ x: 3, y: 5, w: 18, h: 14, rx: 2 }, { d: 'M3 12h18M12 5v7M8 12v7M16 12v7' }]

/* ── Actions ────────────────────────────────────────────────────────── */

export const closePaths: IconGeometry = [{ d: 'M6 6l12 12M18 6 6 18' }]
export const chevronDownPaths: IconGeometry = [{ d: 'M6 9l6 6 6-6' }]
export const chevronUpPaths: IconGeometry = [{ d: 'M6 15l6-6 6 6' }]
export const chevronLeftPaths: IconGeometry = [{ d: 'M15 6l-6 6 6 6' }]
export const chevronRightPaths: IconGeometry = [{ d: 'M9 6l6 6-6 6' }]
export const checkPaths: IconGeometry = [{ d: 'M4 12l5 5L20 6' }]
export const plusPaths: IconGeometry = [{ d: 'M12 5v14M5 12h14' }]
export const minusPaths: IconGeometry = [{ d: 'M5 12h14' }]
export const searchPaths: IconGeometry = [{ cx: 11, cy: 11, r: 7 }, { d: 'M16 16l5 5' }]
export const uploadPaths: IconGeometry = [{ d: 'M12 15V4M7 9l5-5 5 5' }, TRAY]
export const downloadPaths: IconGeometry = [{ d: 'M12 4v11M7 10l5 5 5-5' }, TRAY]
export const exportPaths: IconGeometry = [OPEN_BOX, { d: 'M11 13l9-9M15 4h5v5' }]
export const importPaths: IconGeometry = [OPEN_BOX, { d: 'M20 4l-9 9M11 8v5h5' }]
export const dragHandlePaths: IconGeometry = [
  { cx: 9, cy: 6, r: 1.5, dot: true },
  { cx: 15, cy: 6, r: 1.5, dot: true },
  { cx: 9, cy: 12, r: 1.5, dot: true },
  { cx: 15, cy: 12, r: 1.5, dot: true },
  { cx: 9, cy: 18, r: 1.5, dot: true },
  { cx: 15, cy: 18, r: 1.5, dot: true },
]
export const morePaths: IconGeometry = [
  { cx: 5, cy: 12, r: 1.5, dot: true },
  { cx: 12, cy: 12, r: 1.5, dot: true },
  { cx: 19, cy: 12, r: 1.5, dot: true },
]
export const editPaths: IconGeometry = [
  { d: 'M4 20l1-4.5L15.5 5a2.5 2.5 0 0 1 3.5 3.5L8.5 19z' },
  { d: 'M13 7.5l3.5 3.5' },
]
export const trashPaths: IconGeometry = [
  { d: 'M4 6h16' },
  { d: 'M9 6V4.5A1.5 1.5 0 0 1 10.5 3h3A1.5 1.5 0 0 1 15 4.5V6' },
  { d: 'M6 6l1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13' },
  { d: 'M10 10v7M14 10v7' },
]
export const copyPaths: IconGeometry = [
  { x: 9, y: 9, w: 12, h: 12, rx: 2 },
  { d: 'M5 15a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2' },
]
export const linkPaths: IconGeometry = [{ d: 'M9 8H7a4 4 0 0 0 0 8h2M15 8h2a4 4 0 0 1 0 8h-2M8 12h8' }]
export const undoPaths: IconGeometry = [{ d: 'M9 14 4 9l5-5' }, { d: 'M4 9h10.5a5.5 5.5 0 0 1 0 11H11' }]

/* ── Status and feedback ────────────────────────────────────────────── */

export const infoPaths: IconGeometry = [
  { cx: 12, cy: 12, r: 9 },
  { d: 'M12 11v5' },
  { cx: 12, cy: 7.5, r: 1.25, dot: true },
]
export const warningPaths: IconGeometry = [
  { d: 'M13.73 5.16 20.64 16.99A2 2 0 0 1 18.92 20H5.08a2 2 0 0 1-1.72-3.01L10.27 5.16a2 2 0 0 1 3.46 0z' },
  { d: 'M12 9v4' },
  { cx: 12, cy: 16.5, r: 1.25, dot: true },
]
export const flagPaths: IconGeometry = [{ d: 'M6 21V4' }, { d: 'M6 4h12l-3 4.5 3 4.5H6' }]
export const lockPaths: IconGeometry = [
  { x: 5, y: 11, w: 14, h: 10, rx: 2 },
  { d: 'M8 11V7a4 4 0 0 1 8 0v4' },
  { cx: 12, cy: 16, r: 1.25, dot: true },
]

/* ── Check-ins and body ─────────────────────────────────────────────── */

export const heartPaths: IconGeometry = [{ d: 'M12 20 4.28 11.74A4.75 4.75 0 1 1 12 6.38a4.75 4.75 0 1 1 7.72 5.36z' }]
export const powerPaths: IconGeometry = [{ d: 'M13 3 5 13h7l-1 8 8-10h-7z' }]
export const sleepPaths: IconGeometry = [{ d: 'M3 12h7l-7 8h7' }, { d: 'M14 4h6l-6 6h6' }]
export const moodPaths: IconGeometry = [
  { cx: 12, cy: 12, r: 9 },
  { cx: 9, cy: 10, r: 1.25, dot: true },
  { cx: 15, cy: 10, r: 1.25, dot: true },
  { d: 'M8.5 14.5a4.5 4.5 0 0 0 7 0' },
]
/** A plaster, laid on the diagonal. */
export const sorenessPaths: IconGeometry = [
  { d: 'M5.63 12.71 12.71 5.63a4 4 0 0 1 5.66 5.66l-7.08 7.08a4 4 0 0 1-5.66-5.66z' },
  { d: 'M10.94 7.4l5.66 5.66M7.4 10.94l5.66 5.66' },
]

/* ── Praise and progress ────────────────────────────────────────────── */

export const kudosPaths: IconGeometry = [
  { x: 3, y: 11, w: 4, h: 10, rx: 1.5 },
  { d: 'M7 12l3.5-7.5a2 2 0 0 1 3 2.2L12.8 10H18a2 2 0 0 1 2 2.3l-1.2 7a2 2 0 0 1-2 1.7H7' },
]
export const medalPaths: IconGeometry = [{ cx: 12, cy: 15, r: 6 }, { d: 'M8 3h8M8 3l2.5 6.5M16 3l-2.5 6.5' }]

/** A flame in two lanes: the inner bend runs on into the straight, inside the outer one. */
export const streakPaths: IconGeometry = [
  { d: 'M12 3c1.5 3 7 6 7 11a7 7 0 0 1-14 0c0-3 1.5-5.2 3-6.5.3 1.3 1 2.2 2 2.5C10 7.5 10.8 5 12 3z' },
  { d: 'M9 14a3 3 0 0 0 6 0c0-1.4-.7-2.6-1.8-3.6' },
]

/** Three lanes, staggered starts, one finish post. */
export const racePaths: IconGeometry = [{ d: 'M20 3v18' }, { d: 'M20 3l-5 2.5 5 2.5' }, { d: 'M3 11h13M6 15h10M9 19h7' }]

/* ── Devices, files and tools ───────────────────────────────────────── */

export const watchPaths: IconGeometry = [
  { x: 6, y: 6, w: 12, h: 12, rx: 3 },
  { d: 'M9 6l.5-3h5l.5 3M9 18l.5 3h5l.5-3' },
  { d: 'M12 9.5V12l1.5 1.5' },
]
export const filePaths: IconGeometry = [
  { d: 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z' },
  { d: 'M14 3v5h5' },
]
export const keyboardPaths: IconGeometry = [
  { x: 3, y: 6, w: 18, h: 12, rx: 2 },
  { cx: 8, cy: 10, r: 1, dot: true },
  { cx: 12, cy: 10, r: 1, dot: true },
  { cx: 16, cy: 10, r: 1, dot: true },
  { d: 'M8 14h8' },
]
export const filterPaths: IconGeometry = [{ d: 'M3 4h18l-7 8.5V20l-4-2v-5.5z' }]
export const sortPaths: IconGeometry = [{ d: 'M8 20V4M4 8l4-4 4 4' }, { d: 'M16 4v16M12 16l4 4 4-4' }]

/* ── Theme and helper ───────────────────────────────────────────────── */

export const sunPaths: IconGeometry = [
  { cx: 12, cy: 12, r: 4 },
  {
    d: 'M12 3v2M12 19v2M3 12h2M19 12h2M5.64 5.64l1.41 1.41M16.95 16.95l1.41 1.41M5.64 18.36l1.41-1.41M16.95 7.05l1.41-1.41',
  },
]
export const moonPaths: IconGeometry = [{ d: 'M20.5 12.27A8.5 8.5 0 1 1 11.73 3.5a6.5 6.5 0 0 0 8.77 8.77z' }]

/** The opt-in AI helper: a plain bulb, for suggestions. No sparkles. */
export const assistPaths: IconGeometry = [
  { d: 'M9 16q0-1.52-1.24-2.76a6 6 0 1 1 8.48 0Q15 14.48 15 16z' },
  { d: 'M10 20h4' },
]

/* ── Index ──────────────────────────────────────────────────────────── */

/** Every icon name. `Icon<Name>` is the matching component in `index.ts`. */
export const ICON_NAMES = [
  'Today',
  'Week',
  'Log',
  'Progress',
  'Me',
  'Overview',
  'Athletes',
  'Calendar',
  'Season',
  'Library',
  'Builder',
  'Analytics',
  'CheckIns',
  'Settings',
  'Brand',
  'Kit',
  'Reset',
  'Menu',
  'Swim',
  'Bike',
  'Run',
  'Strength',
  'Brick',
  'Close',
  'ChevronDown',
  'ChevronUp',
  'ChevronLeft',
  'ChevronRight',
  'Check',
  'Plus',
  'Minus',
  'Search',
  'Upload',
  'Download',
  'Export',
  'Import',
  'DragHandle',
  'More',
  'Edit',
  'Trash',
  'Copy',
  'Link',
  'Undo',
  'Info',
  'Warning',
  'Flag',
  'Lock',
  'Heart',
  'Power',
  'Sleep',
  'Mood',
  'Soreness',
  'Kudos',
  'Medal',
  'Streak',
  'Race',
  'Watch',
  'File',
  'Keyboard',
  'Filter',
  'Sort',
  'Sun',
  'Moon',
  'Assist',
] as const

export type IconName = (typeof ICON_NAMES)[number]

/** Every icon's geometry by name. Importing this pulls in the whole set; prefer the named `*Paths`. */
export const ICON_PATHS: { readonly [K in IconName]: IconGeometry } = {
  Today: todayPaths,
  Week: weekPaths,
  Log: logPaths,
  Progress: progressPaths,
  Me: mePaths,
  Overview: overviewPaths,
  Athletes: athletesPaths,
  Calendar: calendarPaths,
  Season: seasonPaths,
  Library: libraryPaths,
  Builder: builderPaths,
  Analytics: analyticsPaths,
  CheckIns: checkInsPaths,
  Settings: settingsPaths,
  Brand: brandPaths,
  Kit: kitPaths,
  Reset: resetPaths,
  Menu: menuPaths,
  Swim: swimPaths,
  Bike: bikePaths,
  Run: runPaths,
  Strength: strengthPaths,
  Brick: brickPaths,
  Close: closePaths,
  ChevronDown: chevronDownPaths,
  ChevronUp: chevronUpPaths,
  ChevronLeft: chevronLeftPaths,
  ChevronRight: chevronRightPaths,
  Check: checkPaths,
  Plus: plusPaths,
  Minus: minusPaths,
  Search: searchPaths,
  Upload: uploadPaths,
  Download: downloadPaths,
  Export: exportPaths,
  Import: importPaths,
  DragHandle: dragHandlePaths,
  More: morePaths,
  Edit: editPaths,
  Trash: trashPaths,
  Copy: copyPaths,
  Link: linkPaths,
  Undo: undoPaths,
  Info: infoPaths,
  Warning: warningPaths,
  Flag: flagPaths,
  Lock: lockPaths,
  Heart: heartPaths,
  Power: powerPaths,
  Sleep: sleepPaths,
  Mood: moodPaths,
  Soreness: sorenessPaths,
  Kudos: kudosPaths,
  Medal: medalPaths,
  Streak: streakPaths,
  Race: racePaths,
  Watch: watchPaths,
  File: filePaths,
  Keyboard: keyboardPaths,
  Filter: filterPaths,
  Sort: sortPaths,
  Sun: sunPaths,
  Moon: moonPaths,
  Assist: assistPaths,
}
