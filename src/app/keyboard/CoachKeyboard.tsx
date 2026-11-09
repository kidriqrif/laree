/* oxlint-disable jsx-a11y/prefer-tag-over-role, jsx-a11y/no-redundant-roles -- role="list" keeps list semantics in Safari; status announces the hint */
import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { useViewer } from '../viewer.ts'
import { GLOBAL_KEYS } from './destinations.ts'
import { HotkeyProvider, useHotkeys, useHotkeysContext } from './HotkeyProvider.tsx'
import { describeKeys } from './keys.ts'
import { JumpTo } from './JumpTo.tsx'
import { KeyboardHelp } from './KeyboardHelp.tsx'
import styles from './Keyboard.module.css'

interface KeyboardDialogs {
  openJumpTo: () => void
  openHelp: () => void
}

const DialogsContext = createContext<KeyboardDialogs | null>(null)

/** Lets a visible control (the rail's Jump to field, the help button) open the same dialogs as the keys. */
export function useKeyboardDialogs(): KeyboardDialogs {
  const ctx = useContext(DialogsContext)
  if (!ctx) throw new Error('useKeyboardDialogs must be used inside CoachKeyboard')
  return ctx
}

export interface CoachKeyboardProps {
  children?: ReactNode
  /** Turn single-key shortcuts off from Settings. Default true. */
  singleKeys?: boolean
}

/** Mounts the provider, the global coach keys, Jump to and Keyboard help. Render inside the router. */
export function CoachKeyboard({ children, singleKeys = true }: CoachKeyboardProps) {
  return (
    <HotkeyProvider singleKeys={singleKeys}>
      <Inner>{children}</Inner>
    </HotkeyProvider>
  )
}

function Inner({ children }: { children?: ReactNode }) {
  const navigate = useNavigate()
  const athleteId = useViewer((s) => s.coachAthleteId)
  const [jumpOpen, setJumpOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)

  useHotkeys(
    [
      ...GLOBAL_KEYS.map((k) => ({
        keys: k.keys,
        description: k.description,
        handler: () => navigate(k.to(athleteId)),
      })),
      {
        keys: '/',
        description: 'Jump to an athlete or section',
        handler: () => setJumpOpen(true),
      },
      {
        keys: '?',
        description: 'Show keyboard help',
        handler: () => setHelpOpen(true),
      },
    ],
    { scope: 'global' },
  )

  const dialogs = useMemo<KeyboardDialogs>(
    () => ({
      openJumpTo: () => setJumpOpen(true),
      openHelp: () => setHelpOpen(true),
    }),
    [],
  )

  return (
    <DialogsContext.Provider value={dialogs}>
      {children}
      <PendingHint />
      <JumpTo isOpen={jumpOpen} onOpenChange={setJumpOpen} />
      <KeyboardHelp isOpen={helpOpen} onOpenChange={setHelpOpen} />
    </DialogsContext.Provider>
  )
}

/** The small hint after "g": lists what the second key can be. */
function PendingHint() {
  const { pending, pendingOptions } = useHotkeysContext()
  return (
    <div className={styles.hint} role="status" data-open={pending ? true : undefined}>
      {pending ? (
        <>
          <span className={styles.hintHead}>{pending} then</span>
          <ul className={styles.hintList} role="list">
            {pendingOptions.map((o) => (
              <li key={o.id}>
                <kbd>{describeKeys(o.keys).split(' then ').slice(-1)[0]}</kbd> {o.description.replace(/^Go to /, '')}
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  )
}
