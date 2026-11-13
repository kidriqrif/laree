import { Icon, type IconProps } from './Icon.tsx'
import {
  analyticsPaths,
  assistPaths,
  athletesPaths,
  bikePaths,
  brandPaths,
  brickPaths,
  builderPaths,
  calendarPaths,
  checkInsPaths,
  checkPaths,
  chevronUpPaths,
  copyPaths,
  downloadPaths,
  dragHandlePaths,
  editPaths,
  exportPaths,
  filePaths,
  filterPaths,
  flagPaths,
  heartPaths,
  importPaths,
  infoPaths,
  keyboardPaths,
  kitPaths,
  kudosPaths,
  libraryPaths,
  linkPaths,
  lockPaths,
  logPaths,
  medalPaths,
  menuPaths,
  minusPaths,
  moodPaths,
  moonPaths,
  morePaths,
  overviewPaths,
  powerPaths,
  resetPaths,
  runPaths,
  searchPaths,
  seasonPaths,
  settingsPaths,
  sorenessPaths,
  sortPaths,
  streakPaths,
  strengthPaths,
  sunPaths,
  swimPaths,
  trashPaths,
  undoPaths,
  uploadPaths,
  warningPaths,
  watchPaths,
} from './paths.ts'

export * from './icons-core.tsx'

/* Thin wrappers, one per icon, so a screen only ships the geometry it draws. */

/* Athlete navigation */
export function IconLog(props: IconProps) {
  return <Icon paths={logPaths} {...props} />
}

/* Coach navigation */
export function IconOverview(props: IconProps) {
  return <Icon paths={overviewPaths} {...props} />
}
export function IconAthletes(props: IconProps) {
  return <Icon paths={athletesPaths} {...props} />
}
export function IconCalendar(props: IconProps) {
  return <Icon paths={calendarPaths} {...props} />
}
export function IconSeason(props: IconProps) {
  return <Icon paths={seasonPaths} {...props} />
}
export function IconLibrary(props: IconProps) {
  return <Icon paths={libraryPaths} {...props} />
}
export function IconBuilder(props: IconProps) {
  return <Icon paths={builderPaths} {...props} />
}
export function IconAnalytics(props: IconProps) {
  return <Icon paths={analyticsPaths} {...props} />
}
export function IconCheckIns(props: IconProps) {
  return <Icon paths={checkInsPaths} {...props} />
}
export function IconSettings(props: IconProps) {
  return <Icon paths={settingsPaths} {...props} />
}
export function IconBrand(props: IconProps) {
  return <Icon paths={brandPaths} {...props} />
}
export function IconKit(props: IconProps) {
  return <Icon paths={kitPaths} {...props} />
}
export function IconReset(props: IconProps) {
  return <Icon paths={resetPaths} {...props} />
}
export function IconMenu(props: IconProps) {
  return <Icon paths={menuPaths} {...props} />
}

/* Sports */
export function IconSwim(props: IconProps) {
  return <Icon paths={swimPaths} {...props} />
}
export function IconBike(props: IconProps) {
  return <Icon paths={bikePaths} {...props} />
}
export function IconRun(props: IconProps) {
  return <Icon paths={runPaths} {...props} />
}
export function IconStrength(props: IconProps) {
  return <Icon paths={strengthPaths} {...props} />
}
export function IconBrick(props: IconProps) {
  return <Icon paths={brickPaths} {...props} />
}

/* Actions */
export function IconChevronUp(props: IconProps) {
  return <Icon paths={chevronUpPaths} {...props} />
}
export function IconCheck(props: IconProps) {
  return <Icon paths={checkPaths} {...props} />
}
export function IconMinus(props: IconProps) {
  return <Icon paths={minusPaths} {...props} />
}
export function IconSearch(props: IconProps) {
  return <Icon paths={searchPaths} {...props} />
}
export function IconUpload(props: IconProps) {
  return <Icon paths={uploadPaths} {...props} />
}
export function IconDownload(props: IconProps) {
  return <Icon paths={downloadPaths} {...props} />
}
export function IconExport(props: IconProps) {
  return <Icon paths={exportPaths} {...props} />
}
export function IconImport(props: IconProps) {
  return <Icon paths={importPaths} {...props} />
}
export function IconDragHandle(props: IconProps) {
  return <Icon paths={dragHandlePaths} {...props} />
}
export function IconMore(props: IconProps) {
  return <Icon paths={morePaths} {...props} />
}
export function IconEdit(props: IconProps) {
  return <Icon paths={editPaths} {...props} />
}
export function IconTrash(props: IconProps) {
  return <Icon paths={trashPaths} {...props} />
}
export function IconCopy(props: IconProps) {
  return <Icon paths={copyPaths} {...props} />
}
export function IconLink(props: IconProps) {
  return <Icon paths={linkPaths} {...props} />
}
export function IconUndo(props: IconProps) {
  return <Icon paths={undoPaths} {...props} />
}

/* Status and feedback */
export function IconInfo(props: IconProps) {
  return <Icon paths={infoPaths} {...props} />
}
export function IconWarning(props: IconProps) {
  return <Icon paths={warningPaths} {...props} />
}
export function IconFlag(props: IconProps) {
  return <Icon paths={flagPaths} {...props} />
}
export function IconLock(props: IconProps) {
  return <Icon paths={lockPaths} {...props} />
}

/* Check-ins and body */
export function IconHeart(props: IconProps) {
  return <Icon paths={heartPaths} {...props} />
}
export function IconPower(props: IconProps) {
  return <Icon paths={powerPaths} {...props} />
}
export function IconMood(props: IconProps) {
  return <Icon paths={moodPaths} {...props} />
}
export function IconSoreness(props: IconProps) {
  return <Icon paths={sorenessPaths} {...props} />
}

/* Praise and progress */
export function IconKudos(props: IconProps) {
  return <Icon paths={kudosPaths} {...props} />
}
export function IconMedal(props: IconProps) {
  return <Icon paths={medalPaths} {...props} />
}
export function IconStreak(props: IconProps) {
  return <Icon paths={streakPaths} {...props} />
}

/* Devices, files and tools */
export function IconWatch(props: IconProps) {
  return <Icon paths={watchPaths} {...props} />
}
export function IconFile(props: IconProps) {
  return <Icon paths={filePaths} {...props} />
}
export function IconKeyboard(props: IconProps) {
  return <Icon paths={keyboardPaths} {...props} />
}
export function IconFilter(props: IconProps) {
  return <Icon paths={filterPaths} {...props} />
}
export function IconSort(props: IconProps) {
  return <Icon paths={sortPaths} {...props} />
}

/* Theme and helper */
export function IconSun(props: IconProps) {
  return <Icon paths={sunPaths} {...props} />
}
export function IconMoon(props: IconProps) {
  return <Icon paths={moonPaths} {...props} />
}
/** The opt-in AI helper. */
export function IconAssist(props: IconProps) {
  return <Icon paths={assistPaths} {...props} />
}
