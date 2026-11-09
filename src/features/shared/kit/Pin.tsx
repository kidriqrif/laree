import { useLayoutEffect, useRef, type ReactNode } from 'react'

export type PinState = 'hover' | 'focus' | 'pressed'

const ATTRS: Record<PinState, readonly string[]> = {
  hover: ['data-hovered'],
  focus: ['data-focused', 'data-focus-visible'],
  pressed: ['data-pressed'],
}

/**
 * Holds a state on the controls inside it by setting the same data attributes that react-aria sets
 * ([data-hovered], [data-focused] with [data-focus-visible], [data-pressed]). The components' own CSS then
 * draws the state without anyone touching the pointer. Real interaction still works on the page.
 */
export function Pin({ state, children }: { state: PinState; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const root = ref.current
    if (!root) return
    const attrs = ATTRS[state]
    const apply = () => {
      for (const el of root.querySelectorAll('*')) {
        if (el instanceof SVGElement || el.hasAttribute('data-pin-skip')) continue
        for (const a of attrs) if (el.getAttribute(a) !== 'true') el.setAttribute(a, 'true')
      }
    }
    apply()
    if (typeof MutationObserver === 'undefined') return
    const mo = new MutationObserver(apply)
    mo.observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: [...attrs] })
    return () => mo.disconnect()
  }, [state])
  return (
    <div ref={ref} data-pin={state} style={{ display: 'contents' }}>
      {children}
    </div>
  )
}
