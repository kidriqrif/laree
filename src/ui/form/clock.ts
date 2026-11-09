/** Parse "h:mm:ss", "m:ss" or a bare number of minutes into seconds. Null when it is not a time. */
export function parseClock(text: string, allowHours = true): number | null {
  const t = text.trim()
  if (!t) return null
  const parts = t.split(':')
  if (parts.length > (allowHours ? 3 : 2)) return null
  if (!parts.every((p) => /^\d{1,3}$/.test(p))) return null
  const n = parts.map(Number)
  if (n.length === 1) return (n[0] ?? 0) * 60
  const last = n[n.length - 1] ?? 0
  if (last > 59) return null
  if (n.length === 3) {
    const mid = n[1] ?? 0
    if (mid > 59) return null
    return (n[0] ?? 0) * 3600 + mid * 60 + last
  }
  return (n[0] ?? 0) * 60 + last
}

const pad = (n: number) => String(n).padStart(2, '0')

/** Seconds to "m:ss", or "h:mm:ss" from one hour up. */
export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.round(seconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`
}

export const parseDuration = (text: string): number | null => parseClock(text, true)
export const formatDuration = (seconds: number): string => formatClock(seconds)
export const parsePace = (text: string): number | null => parseClock(text, false)
export const formatPace = (seconds: number): string => formatClock(seconds)
