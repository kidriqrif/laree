import { Panel } from './Panel.tsx'
import type { PanelProps } from './Panel.tsx'

export type SheetProps = PanelProps
export type DrawerProps = PanelProps
export type DialogProps = PanelProps

/** Bottom sheet for the athlete register: grab handle, 90dvh cap, scrolls inside, safe-area padding. */
export function Sheet(props: SheetProps) {
  return <Panel kind="sheet" {...props} />
}

/** Right-hand panel for the coach register: 420 px, hairline edge, no radius. */
export function Drawer(props: DrawerProps) {
  return <Panel kind="drawer" {...props} />
}

/** Centred dialog for short decisions and forms. */
export function Dialog(props: DialogProps) {
  return <Panel kind="dialog" {...props} />
}
