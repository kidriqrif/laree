import { IconFrame, type IconProps } from './Icon.tsx'

export function TodayIcon(p: IconProps) {
  return (
    <IconFrame {...p}>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 7.5V12l3 2" />
    </IconFrame>
  )
}
export function WeekIcon(p: IconProps) {
  return (
    <IconFrame {...p}>
      <rect x="3.5" y="5" width="17" height="15" rx="2" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
    </IconFrame>
  )
}
export function PlusIcon(p: IconProps) {
  return (
    <IconFrame {...p}>
      <path d="M12 5v14M5 12h14" />
    </IconFrame>
  )
}
export function ProgressIcon(p: IconProps) {
  return (
    <IconFrame {...p}>
      <path d="M4 19V5M4 19h16" />
      <path d="M8 15l3-4 3 2 5-6" />
    </IconFrame>
  )
}
export function MeIcon(p: IconProps) {
  return (
    <IconFrame {...p}>
      <circle cx="12" cy="8.5" r="3.5" />
      <path d="M5 20c.8-3.6 3.6-5.5 7-5.5s6.2 1.9 7 5.5" />
    </IconFrame>
  )
}
export function OverviewIcon(p: IconProps) {
  return (
    <IconFrame {...p}>
      <rect x="4" y="4" width="7" height="7" rx="1" />
      <rect x="13" y="4" width="7" height="7" rx="1" />
      <rect x="4" y="13" width="7" height="7" rx="1" />
      <rect x="13" y="13" width="7" height="7" rx="1" />
    </IconFrame>
  )
}
export function CalendarIcon(p: IconProps) {
  return (
    <IconFrame {...p}>
      <rect x="3.5" y="5" width="17" height="15" rx="1" />
      <path d="M3.5 10h17M8 3v4M16 3v4M8 14h2M14 14h2M8 17h2" />
    </IconFrame>
  )
}
export function SeasonIcon(p: IconProps) {
  return (
    <IconFrame {...p}>
      <path d="M3 17h18" />
      <path d="M5 17v-4M10 17V9M15 17v-6M20 17V6" />
    </IconFrame>
  )
}
export function LibraryIcon(p: IconProps) {
  return (
    <IconFrame {...p}>
      <path d="M5 4v16M10 4v16" />
      <path d="M14.5 5.5l4.5 1-3 13.5-4.5-1z" />
    </IconFrame>
  )
}
export function AnalyticsIcon(p: IconProps) {
  return (
    <IconFrame {...p}>
      <path d="M4 20h16" />
      <path d="M5 15l4-5 4 3 6-7" />
    </IconFrame>
  )
}
export function CheckInsIcon(p: IconProps) {
  return (
    <IconFrame {...p}>
      <rect x="4" y="3.5" width="16" height="17" rx="2" />
      <path d="M8 9l1.8 1.8L13 7.5M8 15h8" />
    </IconFrame>
  )
}
export function SettingsIcon(p: IconProps) {
  return (
    <IconFrame {...p}>
      <path d="M4 7h9M17 7h3M4 17h3M11 17h9" />
      <circle cx="15" cy="7" r="2" />
      <circle cx="9" cy="17" r="2" />
    </IconFrame>
  )
}
export function MenuIcon(p: IconProps) {
  return (
    <IconFrame {...p}>
      <path d="M4 7h16M4 12h16M4 17h16" />
    </IconFrame>
  )
}
export function ChevronDownIcon(p: IconProps) {
  return (
    <IconFrame {...p}>
      <path d="M6 9l6 6 6-6" />
    </IconFrame>
  )
}
