import { useEffect } from 'react'

/** The document title for a page name. */
export const docTitle = (name?: string) => (name ? `${name} · Laree` : 'Laree')

/** The current route's handle title, as AppFrame last wrote it. */
let routeTitle: string | undefined

/** AppFrame calls this in a layout effect when the route's handle title changes. */
export function writeRouteTitle(title: string | undefined) {
  routeTitle = title
  document.title = docTitle(title)
}

/**
 * Names the page more specifically than its route handle (a workout, an activity, a person).
 * AppFrame writes the handle title in a layout effect, so this passive effect runs after it and wins.
 * With no name (the record is missing) it puts the handle title back, so a previous record's
 * title never stays on a not-found state.
 */
export function usePageTitle(name: string | undefined) {
  useEffect(() => {
    document.title = docTitle(name || routeTitle)
  }, [name])
}
