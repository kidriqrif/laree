/* The icons on Today's path. Screens there import this file directly, not the barrel. */
import { Icon, type IconProps } from './Icon.tsx'
import {
  todayPaths,
  weekPaths,
  progressPaths,
  mePaths,
  plusPaths,
  chevronDownPaths,
  chevronLeftPaths,
  chevronRightPaths,
  closePaths,
  sleepPaths,
  racePaths,
} from './paths-core.ts'

export function IconToday(props: IconProps) {
  return <Icon paths={todayPaths} {...props} />
}
export function IconWeek(props: IconProps) {
  return <Icon paths={weekPaths} {...props} />
}
export function IconProgress(props: IconProps) {
  return <Icon paths={progressPaths} {...props} />
}
export function IconMe(props: IconProps) {
  return <Icon paths={mePaths} {...props} />
}
export function IconPlus(props: IconProps) {
  return <Icon paths={plusPaths} {...props} />
}
export function IconChevronDown(props: IconProps) {
  return <Icon paths={chevronDownPaths} {...props} />
}
export function IconChevronLeft(props: IconProps) {
  return <Icon paths={chevronLeftPaths} {...props} />
}
export function IconChevronRight(props: IconProps) {
  return <Icon paths={chevronRightPaths} {...props} />
}
export function IconClose(props: IconProps) {
  return <Icon paths={closePaths} {...props} />
}
export function IconSleep(props: IconProps) {
  return <Icon paths={sleepPaths} {...props} />
}
export function IconRace(props: IconProps) {
  return <Icon paths={racePaths} {...props} />
}
