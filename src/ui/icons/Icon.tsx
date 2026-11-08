import type { ReactNode } from 'react'

export interface IconProps {
  /** Rendered size in CSS pixels. The drawing is always 24 x 24. */
  size?: number
  className?: string
  /** Accessible name. Leave out when the icon sits next to a visible label. */
  title?: string
}

/** Shared frame for hand-drawn 24 px icons: 2 px round strokes in currentColor. */
export function IconFrame({ size = 24, className, title, children }: IconProps & { children: ReactNode }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      {children}
    </svg>
  )
}
