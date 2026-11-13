/**
 * Geometry for the icons on the athlete's first screen: the shell's nav, Today, panels and toasts.
 * Kept apart from paths.ts (the full set, which the kit page draws by name) so Today ships only these.
 * Same grid rules as paths.ts.
 */

/** One drawn element: a stroked path, a stroked circle or a filled dot, or a stroked rectangle. */
export type IconNode =
  | { readonly d: string }
  | { readonly cx: number; readonly cy: number; readonly r: number; readonly dot?: true }
  | { readonly x: number; readonly y: number; readonly w: number; readonly h: number; readonly rx?: number }

export type IconGeometry = readonly IconNode[]

/* Shared parts, so related icons stay identical where they overlap. */
export const CALENDAR_BOX: IconNode = { x: 4, y: 5, w: 16, h: 16, rx: 2 }
export const CALENDAR_TABS: IconNode = { d: 'M8 3v3M16 3v3' }
export const CALENDAR_RULE: IconNode = { d: 'M4 9h16' }

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

/** Two lanes through the bend, the outer one rising. */
export const progressPaths: IconGeometry = [
  { d: 'M3 20h5a9 9 0 0 0 9-9V4' },
  { d: 'M13 8l4-4 4 4' },
  { d: 'M3 16h5a5 5 0 0 0 4.33-2.5' },
]

export const mePaths: IconGeometry = [{ cx: 12, cy: 8, r: 4 }, { d: 'M5 21v-1a4 4 0 0 1 4-4h6a4 4 0 0 1 4 4v1' }]

export const plusPaths: IconGeometry = [{ d: 'M12 5v14M5 12h14' }]

export const chevronDownPaths: IconGeometry = [{ d: 'M6 9l6 6 6-6' }]

export const chevronLeftPaths: IconGeometry = [{ d: 'M15 6l-6 6 6 6' }]

export const chevronRightPaths: IconGeometry = [{ d: 'M9 6l6 6-6 6' }]

export const closePaths: IconGeometry = [{ d: 'M6 6l12 12M18 6 6 18' }]

export const sleepPaths: IconGeometry = [{ d: 'M3 12h7l-7 8h7' }, { d: 'M14 4h6l-6 6h6' }]

/** Three lanes, staggered starts, one finish post. */
export const racePaths: IconGeometry = [{ d: 'M20 3v18' }, { d: 'M20 3l-5 2.5 5 2.5' }, { d: 'M3 11h13M6 15h10M9 19h7' }]
