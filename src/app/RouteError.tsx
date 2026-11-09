import { useEffect, useRef, useState } from 'react'
import { isRouteErrorResponse, useLocation, useNavigate, useRouteError } from 'react-router'
import { isStorageFailed } from '../data/persist.ts'
import { MAIN, NotFound, type NotFoundScope } from './NotFound.tsx'
import styles from './Fallback.module.css'

/** sessionStorage key holding when this tab last reloaded itself to fetch a newer version. */
export const CHUNK_RELOAD_KEY = 'laree:v1:chunk-reload'

/** A second missing-code failure inside this window shows the notice instead of reloading again. */
const RELOAD_WINDOW_MS = 30_000

// Chrome, Safari and Firefox word a failed dynamic import differently. The last is Vite's CSS preload.
const CHUNK_ERROR =
  /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Unable to preload CSS/i

/** True when a screen's code could not be fetched, usually because a newer version was published. */
export function isChunkLoadError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : ''
  return CHUNK_ERROR.test(message)
}

/** A reload is allowed when it loses nothing, it can be recorded, and none happened just now. */
function mayReload(): boolean {
  // Changes held only in memory would be lost.
  if (isStorageFailed()) return false
  try {
    const last = Number(sessionStorage.getItem(CHUNK_RELOAD_KEY)) || 0
    return Date.now() - last > RELOAD_WINDOW_MS
  } catch {
    // Without a record, one reload could turn into a loop.
    return false
  }
}

function recordReload(): boolean {
  try {
    sessionStorage.setItem(CHUNK_RELOAD_KEY, String(Date.now()))
    return true
  } catch {
    return false
  }
}

function errorText(error: unknown): string {
  if (isRouteErrorResponse(error)) return `${error.status} ${error.statusText}`.trim()
  if (error instanceof Error) return error.message
  return typeof error === 'string' ? error : ''
}

/**
 * A screen that crashed (IA 8.5). It renders inside the side's shell, so the switcher, bottom bar
 * and rail keep working. Code that went missing because a new version was published reloads once.
 */
export function RouteError({ scope }: { scope: NotFoundScope }) {
  const error = useRouteError()
  if (isRouteErrorResponse(error) && error.status === 404) return <NotFound scope={scope} />
  return <CrashNotice scope={scope} error={error} />
}

/** Last resort above every frame, for when a whole shell fails to load. */
export function RootError() {
  return (
    <main id="main" tabIndex={-1} className={styles.root}>
      <RouteError scope="standalone" />
    </main>
  )
}

function CrashNotice({ scope, error }: { scope: NotFoundScope; error: unknown }) {
  const chunk = isChunkLoadError(error)
  const [updating, setUpdating] = useState(() => chunk && mayReload())
  const heading = useRef<HTMLHeadingElement>(null)
  const navigate = useNavigate()
  const { key } = useLocation()

  useEffect(() => {
    if (!updating) {
      heading.current?.focus()
      return
    }
    if (recordReload()) {
      window.location.reload()
      return
    }
    // Storage refused the record, so show the notice rather than risk a reload loop.
    // oxlint-disable-next-line react/set-state-in-effect
    setUpdating(false)
  }, [updating])

  if (updating) {
    return (
      <section className={styles.screen}>
        {/* oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- a live region, not an output */}
        <p role="status">Loading the newest version of Laree…</p>
      </section>
    )
  }

  const home = MAIN[scope]
  // The first entry has nothing behind it inside the app, so offer the side's main page instead.
  const hasHistory = key !== 'default'
  const detail = errorText(error)
  return (
    <section className={styles.screen}>
      <h1 ref={heading} tabIndex={-1} className={styles.quiet}>
        Something went wrong on this screen
      </h1>
      <p>
        {chunk
          ? "This screen didn't load. You may be offline, or Laree was just updated."
          : 'Reload to try again.'}{' '}
        {isStorageFailed()
          ? "This browser isn't saving changes, so reloading loses anything you did since opening Laree."
          : 'Everything you saved is still on this device.'}
      </p>
      <div className={styles.links}>
        <button type="button" className={styles.primary} onClick={() => window.location.reload()}>
          Reload
        </button>
        <button
          type="button"
          className={styles.secondary}
          onClick={() => void (hasHistory ? navigate(-1) : navigate(home.to))}
        >
          {hasHistory ? 'Back' : home.label}
        </button>
      </div>
      {detail ? (
        <details className={styles.details}>
          <summary>Details for a bug report</summary>
          <code>{detail}</code>
        </details>
      ) : null}
    </section>
  )
}
