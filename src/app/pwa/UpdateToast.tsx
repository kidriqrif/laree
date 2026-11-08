import { useRegisterSW } from 'virtual:pwa-register/react'
import styles from './UpdateToast.module.css'

/**
 * Update toast (S7). Registers the service worker and, when a new version is
 * waiting, offers "Reload". The page never reloads by itself, and the toast
 * never takes focus or times out. "Later" hides it until the next launch.
 */
export function UpdateToast() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW()

  return (
    <output className={styles.region}>
      {needRefresh ? (
        <div className={styles.toast}>
          <p className={styles.text}>A new version of Laree is ready.</p>
          <div className={styles.actions}>
            <button type="button" className={styles.primary} onClick={() => void updateServiceWorker(true)}>
              Reload
            </button>
            <button type="button" className={styles.secondary} onClick={() => setNeedRefresh(false)}>
              Later
            </button>
          </div>
        </div>
      ) : null}
    </output>
  )
}
