import { Frame } from './glyphs.tsx'

// Its own module, so the coach-only severity marks stay out of the glyph chunk the athlete Today screen loads.
export type SeverityKey = 'act' | 'watch' | 'info'

/**
 * Flag severity mark in currentColor: octagon for Act (stop), triangle for Watch (caution),
 * ring for Info. The shape carries the severity, so colour is never the only cue.
 */
export function SeverityGlyph({ severity, size = 12 }: { severity: SeverityKey; size?: number }) {
  switch (severity) {
    case 'act':
      return (
        <Frame size={size} data-glyph="act">
          <path d="M8 2h8l6 6v8l-6 6H8l-6-6V8z" fill="currentColor" />
          <path d="M12 7v6M12 17h.01" stroke="var(--color-bg)" />
        </Frame>
      )
    case 'watch':
      return (
        <Frame size={size} data-glyph="watch">
          <path d="M12 2.5L22.5 21h-21z" fill="currentColor" />
          <path d="M12 9.5v5M12 18h.01" stroke="var(--color-bg)" />
        </Frame>
      )
    case 'info':
      return (
        <Frame size={size} data-glyph="info">
          <circle cx="12" cy="12" r="9.5" />
          <path d="M12 11v6M12 7.5h.01" />
        </Frame>
      )
  }
}
