/**
 * Side effect, imported first by main.tsx: in the live app, day 0 is one fixed Monday, so day
 * offsets saved to the database never move. 27 July 2026 is 16 weeks before launch week, so the
 * week numbers match the demo's at launch and simply keep counting after it.
 */
import { isoToEpochDay, setFixedStart } from '../domain/time.ts'
import { isLive } from './mode.ts'

export const LIVE_DAY_ZERO = '2026-07-27'

if (isLive) setFixedStart(isoToEpochDay(LIVE_DAY_ZERO))
