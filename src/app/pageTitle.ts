import { useEffect } from 'react'

/** The document title for a page name. */
export const docTitle = (name?: string) => (name ? `${name} · Laree` : 'Laree')

/**
 * Names the page more specifically than its route handle (a workout, an activity, a person).
 * AppFrame writes the handle title in a layout effect, so this passive effect runs after it and wins.
 */
export function usePageTitle(name: string | undefined) {
  useEffect(() => {
    if (name) document.title = docTitle(name)
  }, [name])
}
