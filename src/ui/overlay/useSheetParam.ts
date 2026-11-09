import { useCallback } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router'

/** Sheets that may open from the ?sheet= search param. Unknown values are ignored. */
export const SHEET_NAMES = ['log', 'check-in'] as const
export type SheetName = (typeof SHEET_NAMES)[number]

export const SHEET_PARAM = 'sheet'

export function isSheetName(value: string | null): value is SheetName {
  return value !== null && (SHEET_NAMES as readonly string[]).includes(value)
}

export interface SheetParam {
  isOpen: boolean
  /** Pushes ?sheet=name, so the back button closes the sheet. */
  open: () => void
  /** Removes the param, keeping every other search param. */
  close: () => void
  /** Shape react-aria overlays expect for onOpenChange. */
  onOpenChange: (isOpen: boolean) => void
}

/** Drives one sheet from the ?sheet= search param. */
export function useSheetParam(name: SheetName): SheetParam {
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const location = useLocation()
  const pushed = (location.state as { sheetPushed?: boolean } | null)?.sheetPushed === true
  const current = params.get(SHEET_PARAM)
  const isOpen = isSheetName(current) && current === name

  const open = useCallback(() => {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.set(SHEET_PARAM, name)
        return next
      },
      { preventScrollReset: true, state: { sheetPushed: true } },
    )
  }, [name, setParams])

  const close = useCallback(() => {
    // We pushed the entry, so go back to it: no duplicate left in the history.
    if (pushed) {
      void navigate(-1)
      return
    }
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.delete(SHEET_PARAM)
        return next
      },
      { replace: true, preventScrollReset: true },
    )
  }, [setParams, navigate, pushed])

  const onOpenChange = useCallback((next: boolean) => (next ? open() : close()), [open, close])

  return { isOpen, open, close, onOpenChange }
}
