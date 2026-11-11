import { useLayoutEffect } from 'react'
import { useLaree } from '../data/store.ts'
import { useViewer, viewerChoice } from './viewer.ts'

/**
 * Applies the saved theme of whoever is viewing to the document, on every screen and from the first
 * paint. Settings are one per person, so switching viewer can switch the theme. Renders nothing.
 */
export function ThemeSync() {
  const owner = useViewer(viewerChoice)
  const theme = useLaree((s) => s.data.settings[owner]?.theme ?? 'system')

  useLayoutEffect(() => {
    const root = document.documentElement
    if (theme === 'system') root.removeAttribute('data-theme')
    else root.setAttribute('data-theme', theme)
  }, [theme])

  return null
}
