import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { isDialogOpen, isModifierKey, isTypingTarget, parseKeys, SEQUENCE_WINDOW_MS } from './keys.ts'

export type HotkeyScope = 'global' | 'page'

export interface HotkeyBinding {
  /** One key ("n", "?") or a sequence ("g c"). Keys are the typed character. */
  keys: string
  /** Plain English, shown in Keyboard help. */
  description: string
  handler: (event: KeyboardEvent) => void
  /** False hides the key from help and stops it firing. Default true. */
  enabled?: boolean
}

export interface HotkeyEntry {
  id: string
  keys: string
  description: string
  scope: HotkeyScope
}

interface Registered extends HotkeyEntry {
  tokens: string[]
}

export interface HotkeysContextValue {
  /** Everything currently registered, in registration order. */
  entries: readonly HotkeyEntry[]
  /** The first key of a sequence that is waiting for its second, or null. */
  pending: string | null
  /** Options reachable from the pending key, for the hint. */
  pendingOptions: readonly HotkeyEntry[]
  singleKeysEnabled: boolean
  register: (id: string, scope: HotkeyScope, bindings: readonly HotkeyBinding[]) => () => void
}

const HotkeysContext = createContext<HotkeysContextValue | null>(null)

export interface HotkeyProviderProps {
  children?: ReactNode
  /** Settings can turn single-key shortcuts off (WCAG 2.1.4). Default true. */
  singleKeys?: boolean
  /** Where key events are heard. Default document. */
  target?: Document | HTMLElement
}

function strip(r: Registered): HotkeyEntry {
  return { id: r.id, keys: r.keys, description: r.description, scope: r.scope }
}

/**
 * Listens for single keys and two-key sequences and runs whatever pages registered.
 * It ignores typing in fields, open comboboxes and open dialogs, and keys with Ctrl, Meta or Alt held.
 * It owns no keys itself: see useHotkeys.
 */
export function HotkeyProvider({ children, singleKeys = true, target }: HotkeyProviderProps) {
  const [registry, setRegistry] = useState<ReadonlyMap<string, readonly Registered[]>>(new Map())
  const handlers = useRef(new Map<string, (event: KeyboardEvent) => void>())
  const [pending, setPending] = useState<string[] | null>(null)
  const pendingRef = useRef<string[] | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const registryRef = useRef(registry)
  const enabledRef = useRef(singleKeys)
  useEffect(() => {
    registryRef.current = registry
    enabledRef.current = singleKeys
  })

  const register = useCallback<HotkeysContextValue['register']>((id, scope, bindings) => {
    const live = bindings.filter((b) => b.enabled !== false)
    const rows: Registered[] = live.map((b, i) => ({
      id: `${id}:${i}`,
      keys: b.keys,
      description: b.description,
      scope,
      tokens: parseKeys(b.keys),
    }))
    rows.forEach((r, i) => {
      const binding = live[i]
      if (binding) handlers.current.set(r.id, binding.handler)
    })
    // Keep the ref current at once so a key pressed straight after mounting is heard.
    setRegistry((prev) => {
      const next = new Map(prev).set(id, rows)
      registryRef.current = next
      return next
    })
    return () => {
      rows.forEach((r) => handlers.current.delete(r.id))
      setRegistry((prev) => {
        const next = new Map(prev)
        next.delete(id)
        registryRef.current = next
        return next
      })
    }
  }, [])

  const clearPending = useCallback(() => {
    clearTimeout(timer.current)
    pendingRef.current = null
    setPending(null)
  }, [])

  useEffect(() => {
    const node: Document | HTMLElement = target ?? document
    const onKeyDown = (e: Event) => {
      const event = e as KeyboardEvent
      if (event.ctrlKey || event.metaKey || event.altKey || event.isComposing) return
      if (isModifierKey(event.key)) return
      if (isTypingTarget(event.target) || isDialogOpen(document)) {
        if (pendingRef.current) clearPending()
        return
      }
      if (!enabledRef.current || event.repeat) return

      // Page keys come before global ones, so a page may shadow a global key.
      const all = [...registryRef.current.values()].flat()
      const ordered = [...all.filter((r) => r.scope === 'page'), ...all.filter((r) => r.scope === 'global')]
      const attempt = (seq: string[]): boolean => {
        const hit = ordered.find((r) => r.tokens.length === seq.length && r.tokens.every((t, i) => t === seq[i]))
        if (hit) {
          clearPending()
          event.preventDefault()
          handlers.current.get(hit.id)?.(event)
          return true
        }
        const longer = ordered.some((r) => r.tokens.length > seq.length && seq.every((t, i) => t === r.tokens[i]))
        if (longer) {
          clearTimeout(timer.current)
          pendingRef.current = seq
          setPending(seq)
          timer.current = setTimeout(clearPending, SEQUENCE_WINDOW_MS)
          event.preventDefault()
          return true
        }
        return false
      }

      const before = pendingRef.current
      if (before && attempt([...before, event.key])) return
      if (before) clearPending()
      attempt([event.key])
    }
    node.addEventListener('keydown', onKeyDown)
    return () => {
      node.removeEventListener('keydown', onKeyDown)
      clearTimeout(timer.current)
    }
  }, [target, clearPending])

  const entries = useMemo(() => [...registry.values()].flat().map(strip), [registry])
  const pendingKey = pending ? pending.join(' ') : null
  const pendingOptions = useMemo(() => {
    if (!pending) return []
    return [...registry.values()]
      .flat()
      .filter((r) => r.tokens.length > pending.length && pending.every((t, i) => t === r.tokens[i]))
      .map(strip)
  }, [pending, registry])

  const value = useMemo<HotkeysContextValue>(
    () => ({
      entries,
      pending: pendingKey,
      pendingOptions,
      singleKeysEnabled: singleKeys,
      register,
    }),
    [entries, pendingKey, pendingOptions, singleKeys, register],
  )
  return <HotkeysContext.Provider value={value}>{children}</HotkeysContext.Provider>
}

export function useHotkeysContext(): HotkeysContextValue {
  const ctx = useContext(HotkeysContext)
  if (!ctx) throw new Error('useHotkeysContext must be used inside a HotkeyProvider')
  return ctx
}

export interface UseHotkeysOptions {
  /** "page" (default) keys show first in help. Only the shell registers "global" keys. */
  scope?: HotkeyScope
}

/**
 * Register keys while the calling component is mounted. They appear in Keyboard help only for that time.
 * Handlers may change on every render; the registration only changes when keys, text or enabled change.
 */
export function useHotkeys(bindings: readonly HotkeyBinding[], options: UseHotkeysOptions = {}): void {
  const { register } = useHotkeysContext()
  const scope = options.scope ?? 'page'
  const id = useId()
  const latest = useRef(bindings)
  useEffect(() => {
    latest.current = bindings
  })
  const signature = bindings.map((b) => `${b.keys}|${b.description}|${b.enabled === false ? 0 : 1}`).join('||')

  useEffect(() => {
    const stable = latest.current.map((b, i) => ({
      ...b,
      handler: (event: KeyboardEvent) => latest.current[i]?.handler(event),
    }))
    return register(id, scope, stable)
    // The signature stands for the bindings' keys and descriptions.
  }, [register, id, scope, signature])
}
