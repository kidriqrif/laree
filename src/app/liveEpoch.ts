/**
 * Side effect, imported first by main.tsx: in the live app, day 0 is one fixed Monday, so day
 * offsets saved to the database never move. 27 July 2026 is 16 weeks before launch week, so the
 * week numbers match the demo's at launch and simply keep counting after it.
 * Days are read in the device's own time zone, so a day ends at the person's own midnight wherever
 * they are. The demo keeps Kuala Lumpur, which its seed is written for.
 */
import { isoToEpochDay, setFixedStart, setTimeZone } from '../domain/time.ts'
import { isLive } from './mode.ts'

export const LIVE_DAY_ZERO = '2026-07-27'

/** The device's IANA time zone, or null when the browser does not say. */
function deviceZone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null
  } catch {
    return null
  }
}

if (isLive) {
  setFixedStart(isoToEpochDay(LIVE_DAY_ZERO))
  setTimeZone(deviceZone())
}
