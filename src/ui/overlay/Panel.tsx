import type { ReactNode } from 'react'
import { Dialog } from 'react-aria-components/Dialog'
import { Heading } from 'react-aria-components/Heading'
import { Modal, ModalOverlay } from 'react-aria-components/Modal'
import { IconClose } from '../icons/icons-core.tsx'
import { IconButton } from '../core/IconButton.tsx'
import { useRegister } from './useRegister.ts'
import type { RegisterName } from './useRegister.ts'
import styles from './Overlay.module.css'

export interface PanelProps {
  isOpen: boolean
  onOpenChange: (isOpen: boolean) => void
  /** Names the dialog and shows as its heading. */
  title: string
  children?: ReactNode
  /** Pinned under the scrolling body, for Save and Cancel. */
  footer?: ReactNode
  className?: string
  /** Defaults to the register of the shell the overlay opened from. */
  register?: RegisterName
  'data-testid'?: string
}

interface InternalProps extends PanelProps {
  kind: 'sheet' | 'drawer' | 'dialog'
  role?: 'dialog' | 'alertdialog'
  hideClose?: boolean
}

/** Shared shell behind Sheet, Drawer, Dialog and ConfirmDialog. */
export function Panel({
  kind,
  role = 'dialog',
  hideClose,
  isOpen,
  onOpenChange,
  title,
  children,
  footer,
  className,
  register,
  'data-testid': testId,
}: InternalProps) {
  const reg = useRegister(isOpen, register)
  return (
    <ModalOverlay
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      isDismissable
      className={styles.overlay}
      data-kind={kind}
      data-register={reg}
    >
      <Modal className={styles.modal} data-kind={kind}>
        <Dialog
          role={role}
          className={[styles.dialog, className].filter(Boolean).join(' ')}
          data-testid={testId}
        >
          {kind === 'sheet' ? <span className={styles.grab} aria-hidden="true" /> : null}
          <header className={styles.header}>
            <Heading slot="title" className={styles.title}>
              {title}
            </Heading>
            {hideClose ? null : (
              <IconButton aria-label="Close" onPress={() => onOpenChange(false)}>
                <IconClose aria-hidden="true" />
              </IconButton>
            )}
          </header>
          <div className={styles.body}>{children}</div>
          {footer ? <footer className={styles.footer}>{footer}</footer> : null}
        </Dialog>
      </Modal>
    </ModalOverlay>
  )
}
