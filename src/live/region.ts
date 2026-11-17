/**
 * Where the device is, as far as onboarding needs to know. Only Malaysia's PDPA asks for a separate
 * agreement to keep data abroad, so only a device set to a Malaysian time zone is asked for it.
 */
const MALAYSIA_ZONES = new Set(['Asia/Kuala_Lumpur', 'Asia/Kuching'])

/** The device's IANA time zone, such as "Europe/London". Empty when the browser does not say. */
export function deviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? ''
  } catch {
    return ''
  }
}

export const inMalaysia = (timeZone: string = deviceTimeZone()): boolean => MALAYSIA_ZONES.has(timeZone)

/** The device's language tag, such as "en-GB", within the profile's 20 characters. */
export function deviceLocale(): string {
  const tag = globalThis.navigator?.language ?? ''
  return tag.length > 0 && tag.length <= 20 ? tag : 'en'
}
