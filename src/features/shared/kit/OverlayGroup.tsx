import { useState } from 'react'
import { Button } from '../../../ui/core/index.ts'
import {
  ConfirmDialog,
  Dialog,
  Drawer,
  Popover,
  PopoverTrigger,
  SHEET_NAMES,
  SHEET_PARAM,
  Sheet,
  TOAST_TIMEOUT,
  showToast,
  showUndoToast,
} from '../../../ui/overlay/index.ts'
import type { RegisterName } from '../../../ui/overlay/index.ts'
import { Group, Helpers, Specimen, State } from './Specimen.tsx'
import styles from './KitPage.module.css'

const FROM = 'src/ui/overlay/index.ts'

type Which = 'sheet' | 'drawer' | 'dialog' | 'confirm' | 'confirmSoft' | null

export function OverlayGroup({ register }: { register: RegisterName }) {
  const [open, setOpen] = useState<Which>(null)
  const close = (isOpen: boolean) => {
    if (!isOpen) setOpen(null)
  }
  const footer = (
    <>
      <Button variant="quiet" onPress={() => setOpen(null)}>
        Cancel
      </Button>
      <Button variant="primary" onPress={() => setOpen(null)}>
        Save session
      </Button>
    </>
  )
  const body = (
    <div className={styles.overlayBody}>
      <p>Tempo run, Thursday 12 November. 1 h 45 min planned.</p>
      <p>Everything here is sample data; nothing is saved.</p>
    </div>
  )
  return (
    <Group
      title="Overlays"
      importPath={FROM}
      intro="Sheet, drawer, dialog, popover and toast. Each takes a register so it matches the gallery, even though it renders outside it."
    >
      <Specimen
        name="Sheet, Drawer and Dialog"
        covers={['Sheet', 'Drawer', 'Dialog']}
        from={FROM}
        note="Interactive only: they are modal, so hover and focus cannot be pinned beside other content. Open each one live. Escape or the close button dismisses; focus returns to the button."
      >
        <State label="Sheet (athlete log)">
          <Button variant="secondary" onPress={() => setOpen('sheet')}>
            Open sheet
          </Button>
        </State>
        <State label="Drawer (coach side panel)">
          <Button variant="secondary" onPress={() => setOpen('drawer')}>
            Open drawer
          </Button>
        </State>
        <State label="Dialog">
          <Button variant="secondary" onPress={() => setOpen('dialog')}>
            Open dialog
          </Button>
        </State>
      </Specimen>

      <Specimen name="ConfirmDialog" covers={['ConfirmDialog']} from={FROM} note="Danger actions always sit behind this step.">
        <State label="Destructive">
          <Button variant="danger" onPress={() => setOpen('confirm')}>
            Delete workout
          </Button>
        </State>
        <State label="Not destructive">
          <Button variant="secondary" onPress={() => setOpen('confirmSoft')}>
            Replace week plan
          </Button>
        </State>
      </Specimen>

      <Specimen name="Popover" covers={['Popover', 'PopoverTrigger']} from={FROM} note="Interactive only: anchored to its trigger and closes on outside press or Escape.">
        <State label="Default">
          <PopoverTrigger>
            <Button variant="secondary">Why this Load?</Button>
            <Popover aria-label="About Load">
              <p style={{ margin: 0, maxInlineSize: '22ch' }}>Load is session length weighted by Intensity.</p>
            </Popover>
          </PopoverTrigger>
        </State>
      </Specimen>

      <Specimen name="Toast" covers={['ToastRegion', 'showToast', 'showUndoToast']} from={FROM} note={`Toasts clear after ${TOAST_TIMEOUT / 1000} seconds. The region is mounted once at the top of this page.`}>
        <State label="Plain">
          <Button variant="secondary" onPress={() => showToast('Session saved')}>
            Show toast
          </Button>
        </State>
        <State label="With undo">
          <Button variant="secondary" onPress={() => showUndoToast('Session deleted', () => showToast('Session restored'))}>
            Show undo toast
          </Button>
        </State>
      </Specimen>

      <Helpers
        from={FROM}
        items={[
          ['toastQueue', 'The queue behind the toasts; ToastRegion renders it.'],
          ['TOAST_TIMEOUT', `${TOAST_TIMEOUT} ms`],
          ['useSheetParam', 'Hook: opens a sheet through the ?sheet= query so the back button closes it.'],
          ['isSheetName', 'Narrows a query value to a sheet name.'],
          ['SHEET_NAMES', SHEET_NAMES.join(', ')],
          ['SHEET_PARAM', `?${SHEET_PARAM}=`],
          ['useRegister', 'Hook: reads the register from the nearest data-register, or an override.'],
        ]}
      />

      <Sheet isOpen={open === 'sheet'} onOpenChange={close} title="Log a session" footer={footer} register={register}>
        {body}
      </Sheet>
      <Drawer isOpen={open === 'drawer'} onOpenChange={close} title="Amir, week 17" footer={footer} register={register}>
        {body}
      </Drawer>
      <Dialog isOpen={open === 'dialog'} onOpenChange={close} title="Move this session?" footer={footer} register={register}>
        {body}
      </Dialog>
      <ConfirmDialog
        isOpen={open === 'confirm'}
        onOpenChange={close}
        thing="Tempo run, Thursday"
        description="It leaves Amir's plan. You can undo this for a few seconds."
        onConfirm={() => showUndoToast('Workout deleted', () => showToast('Workout restored'))}
        register={register}
      />
      <ConfirmDialog
        isOpen={open === 'confirmSoft'}
        onOpenChange={close}
        thing="the week 18 plan"
        description="The template replaces the six sessions planned."
        confirmLabel="Replace"
        cancelLabel="Keep current"
        destructive={false}
        onConfirm={() => showToast('Week 18 replaced')}
        register={register}
      />
    </Group>
  )
}
