import { Button } from '../core/Button.tsx'
import type { RegisterName } from './useRegister.ts'
import { Panel } from './Panel.tsx'

export interface ConfirmDialogProps {
  isOpen: boolean
  onOpenChange: (isOpen: boolean) => void
  /** The thing being deleted or changed, for example "the Tuesday tempo run". Named in the title and button. */
  thing: string
  /** Extra sentence of consequence. */
  description?: string
  /** Verb on the confirm button. Default "Delete". */
  confirmLabel?: string
  cancelLabel?: string
  /** Destructive uses the danger button. Default true. */
  destructive?: boolean
  onConfirm: () => void
  register?: RegisterName
}

export function ConfirmDialog({
  isOpen,
  onOpenChange,
  thing,
  description,
  confirmLabel = 'Delete',
  cancelLabel = 'Keep it',
  destructive = true,
  onConfirm,
  register,
}: ConfirmDialogProps) {
  return (
    <Panel
      kind="dialog"
      role="alertdialog"
      hideClose
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      title={`${confirmLabel} ${thing}?`}
      register={register}
      footer={
        <>
          <Button variant="quiet" onPress={() => onOpenChange(false)}>
            {cancelLabel}
          </Button>
          <Button
            variant={destructive ? 'danger' : 'primary'}
            onPress={() => {
              onConfirm()
              onOpenChange(false)
            }}
          >
            {`${confirmLabel} ${thing}`}
          </Button>
        </>
      }
    >
      <p>{description ?? (destructive ? 'This cannot be undone.' : '')}</p>
    </Panel>
  )
}
