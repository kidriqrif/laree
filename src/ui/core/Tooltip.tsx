import type { ReactElement, ReactNode } from 'react'
import { Tooltip as AriaTooltip, TooltipTrigger } from 'react-aria-components/Tooltip'
import type { TooltipProps as AriaTooltipProps } from 'react-aria-components/Tooltip'
import styles from './Tooltip.module.css'

export interface TooltipProps extends Omit<AriaTooltipProps, 'children' | 'className'> {
  /** Text shown in the tooltip. Keep it short; it must not be the only home of important information. */
  content: ReactNode
  /** One focusable element (a Button or IconButton) that the tooltip describes. */
  children: ReactElement
  /** Delay in ms before it opens. */
  delay?: number
  className?: string
}

/** Tooltip around one focusable child. Shows on hover and keyboard focus; Escape closes it. */
export function Tooltip({ content, children, delay = 300, className, placement = 'top', offset = 6, ...rest }: TooltipProps) {
  return (
    <TooltipTrigger delay={delay} closeDelay={0}>
      {children}
      <AriaTooltip
        {...rest}
        placement={placement}
        offset={offset}
        className={[styles.tooltip, className].filter(Boolean).join(' ')}
      >
        {content}
      </AriaTooltip>
    </TooltipTrigger>
  )
}
