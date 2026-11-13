import {
  Text,
  UNSTABLE_Toast as AriaToast,
  UNSTABLE_ToastContent as ToastContent,
  UNSTABLE_ToastQueue as ToastQueue,
  UNSTABLE_ToastRegion as AriaToastRegion,
} from 'react-aria-components/Toast'
import { IconClose } from '../icons/icons-core.tsx'
import { Button } from '../core/Button.tsx'
import { IconButton } from '../core/IconButton.tsx'
import type { RegisterName } from './useRegister.ts'
import styles from './Toast.module.css'

export interface ToastContentData {
  message: string
  actionLabel?: string
  onAction?: () => void
}

export const TOAST_TIMEOUT = 4000

/** One queue for the whole app. Call showToast from anywhere; mount ToastRegion once in each shell. */
export const toastQueue = new ToastQueue<ToastContentData>({ maxVisibleToasts: 3 })

export interface ShowToastOptions {
  actionLabel?: string
  onAction?: () => void
  /** Milliseconds before it dismisses itself. Default 4000. */
  timeout?: number
}

/** Shows a toast and returns a function that dismisses it. */
export function showToast(message: string, options: ShowToastOptions = {}): () => void {
  const { timeout = TOAST_TIMEOUT, actionLabel, onAction } = options
  const key = toastQueue.add({ message, actionLabel, onAction }, { timeout })
  return () => toastQueue.close(key)
}

/** Shows a message with an Undo button. Undo runs onUndo then dismisses the toast. */
export function showUndoToast(message: string, onUndo: () => void, timeout?: number): () => void {
  return showToast(message, { actionLabel: 'Undo', onAction: onUndo, timeout })
}

export interface ToastRegionProps {
  className?: string
  /**
   * The register of the shell that mounts it. The region is drawn in a portal on the body, outside
   * the shell, so it carries the register itself: tokens and position follow it.
   */
  register?: RegisterName
}

export function ToastRegion({ className, register }: ToastRegionProps) {
  return (
    <AriaToastRegion
      queue={toastQueue}
      aria-label="Notifications"
      data-register={register}
      className={[styles.region, className].filter(Boolean).join(' ')}
    >
      {({ toast }) => (
        <AriaToast toast={toast} className={styles.toast}>
          <ToastContent className={styles.content}>
            <output className={styles.message}>
              <Text slot="title">{toast.content.message}</Text>
            </output>
          </ToastContent>
          {toast.content.actionLabel ? (
            <Button
              variant="quiet"
              className={styles.action}
              onPress={() => {
                toast.content.onAction?.()
                toastQueue.close(toast.key)
              }}
            >
              {toast.content.actionLabel}
            </Button>
          ) : null}
          <IconButton slot="close" aria-label="Dismiss" className={styles.dismiss}>
            <IconClose aria-hidden="true" />
          </IconButton>
        </AriaToast>
      )}
    </AriaToastRegion>
  )
}
