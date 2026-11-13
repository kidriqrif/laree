import type { ReactNode, SVGProps } from 'react'

export type StatusKey = 'on-plan' | 'partial' | 'over' | 'missed' | 'unplanned'
export type SportKey = 'swim' | 'bike' | 'run' | 'strength'

export const STATUS_LABEL: Record<StatusKey, string> = {
  'on-plan': 'On plan',
  partial: 'Partial',
  over: 'Over',
  missed: 'Missed',
  unplanned: 'Unplanned',
}

export const SPORT_LABEL: Record<SportKey, string> = {
  swim: 'Swim',
  bike: 'Bike',
  run: 'Run',
  strength: 'Strength',
}

interface FrameProps extends Omit<SVGProps<SVGSVGElement>, 'children'> {
  size?: number
  children: ReactNode
}

export function Frame({ size = 16, children, ...rest }: FrameProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={2.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  )
}

/** Compliance mark: shape differs per status so colour is never the only cue. */
export function StatusGlyph({ status, size }: { status: StatusKey; size?: number }) {
  const common = { size, 'data-glyph': status }
  switch (status) {
    case 'on-plan':
      return (
        <Frame {...common}>
          <circle cx="12" cy="12" r="11" fill="var(--status-on-plan)" stroke="none" />
          <path d="M7 12.5l3.4 3.4L17 9" stroke="var(--color-bg)" />
        </Frame>
      )
    case 'partial':
      return (
        <Frame {...common}>
          <circle cx="12" cy="12" r="10" fill="var(--status-partial)" stroke="var(--status-partial-outline)" strokeWidth={2} />
          <path d="M12 2a10 10 0 0 0 0 20z" fill="var(--color-on-accent)" stroke="none" />
        </Frame>
      )
    case 'over':
      return (
        <Frame {...common}>
          <circle cx="12" cy="12" r="11" fill="var(--status-over)" stroke="none" />
          <path d="M12 17V7M7.5 11.5L12 7l4.5 4.5" stroke="var(--color-bg)" />
        </Frame>
      )
    case 'missed':
      return (
        <Frame {...common}>
          <circle cx="12" cy="12" r="9" stroke="var(--status-missed)" strokeWidth={3} />
        </Frame>
      )
    case 'unplanned':
      return (
        <Frame {...common}>
          <circle cx="12" cy="12" r="11" fill="var(--status-unplanned)" stroke="none" />
          <path d="M12 7v10M7 12h10" stroke="var(--color-bg)" />
        </Frame>
      )
  }
}

/** Sport glyph in currentColor; callers set the sport colour. */
export function SportGlyph({ sport, size = 20 }: { sport: SportKey; size?: number }) {
  switch (sport) {
    case 'swim':
      return (
        <Frame size={size} data-glyph="swim">
          <path d="M2 9c2.5-2.5 5-2.5 7.5 0s5 2.5 7.5 0 3.5-1.5 5-.5" />
          <path d="M2 15c2.5-2.5 5-2.5 7.5 0s5 2.5 7.5 0 3.5-1.5 5-.5" />
          <path d="M2 21c2.5-2.5 5-2.5 7.5 0s5 2.5 7.5 0 3.5-1.5 5-.5" />
        </Frame>
      )
    case 'bike':
      return (
        <Frame size={size} data-glyph="bike">
          <circle cx="5.5" cy="16" r="3.5" />
          <circle cx="18.5" cy="16" r="3.5" />
          <path d="M5.5 16L10 8h6l2.5 8M10 8L12.5 16M8.5 8h3" />
        </Frame>
      )
    case 'run':
      return (
        <Frame size={size} data-glyph="run">
          <circle cx="15" cy="4.5" r="2" />
          <path d="M9 21l2.5-5L9 13l2-5 4 3 3 1M11 8L7 10M12.5 16l4 2" />
        </Frame>
      )
    case 'strength':
      return (
        <Frame size={size} data-glyph="strength">
          <path d="M6 7v10M18 7v10M3 10v4M21 10v4M6 12h12" />
        </Frame>
      )
  }
}

export function LockGlyph({ size = 16 }: { size?: number }) {
  return (
    <Frame size={size} data-glyph="lock">
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </Frame>
  )
}

export function MedalGlyph({ size = 24 }: { size?: number }) {
  return (
    <Frame size={size} data-glyph="medal">
      <circle cx="12" cy="15" r="6" />
      <path d="M8.5 9.5L6 2.5h4l2 4.5M15.5 9.5L18 2.5h-4" />
      <path d="M12 12.5l.9 1.8 2 .3-1.4 1.4.3 2-1.8-.9-1.8.9.3-2-1.4-1.4 2-.3z" />
    </Frame>
  )
}
