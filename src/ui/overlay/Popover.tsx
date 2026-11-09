import type { ReactNode, RefObject } from 'react'
import { Dialog } from 'react-aria-components/Dialog'
import { Popover as AriaPopover } from 'react-aria-components/Popover'
import type { Placement } from 'react-aria-components/Popover'
import styles from './Overlay.module.css'

export { DialogTrigger as PopoverTrigger } from 'react-aria-components/Dialog'

export interface PopoverProps {
  /** Names the popover for screen readers. */
  'aria-label': string
  children?: ReactNode
  isOpen?: boolean
  onOpenChange?: (isOpen: boolean) => void
  triggerRef?: RefObject<Element | null>
  placement?: Placement
  className?: string
}

/** Small anchored panel. Use inside PopoverTrigger, or control with isOpen and triggerRef. */
export function Popover({ 'aria-label': label, children, className, ...rest }: PopoverProps) {
  return (
    <AriaPopover {...rest} className={[styles.popover, className].filter(Boolean).join(' ')} offset={6}>
      <Dialog aria-label={label} className={styles.popoverDialog}>
        {children}
      </Dialog>
    </AriaPopover>
  )
}
