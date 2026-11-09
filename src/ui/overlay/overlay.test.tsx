import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { MemoryRouter, useLocation } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ConfirmDialog, Drawer, Sheet, ToastRegion, showUndoToast, toastQueue, useSheetParam } from './index.ts'

afterEach(() => {
  act(() => toastQueue.clear())
  cleanup()
})

function Harness({ kind }: { kind: 'sheet' | 'drawer' }) {
  const [open, setOpen] = useState(false)
  const Comp = kind === 'sheet' ? Sheet : Drawer
  return (
    <div data-register={kind === 'sheet' ? 'athlete' : 'coach'}>
      <button onClick={() => setOpen(true)}>Open it</button>
      <Comp isOpen={open} onOpenChange={setOpen} title="Log a session">
        <input aria-label="Notes" />
      </Comp>
    </div>
  )
}

describe.each(['sheet', 'drawer'] as const)('%s', (kind) => {
  it('moves focus in, closes on Escape and returns focus to the trigger', async () => {
    render(<Harness kind={kind} />)
    const trigger = screen.getByRole('button', { name: 'Open it' })
    trigger.focus()
    fireEvent.click(trigger)
    const dialog = await screen.findByRole('dialog', { name: 'Log a session' })
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true))
    expect(dialog.closest('[data-register]')?.getAttribute('data-register')).toBe(
      kind === 'sheet' ? 'athlete' : 'coach',
    )
    fireEvent.keyDown(document.activeElement ?? dialog, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    await waitFor(() => expect(document.activeElement).toBe(trigger))
  })

  it('closes from the Close button', async () => {
    render(<Harness kind={kind} />)
    fireEvent.click(screen.getByRole('button', { name: 'Open it' }))
    await screen.findByRole('dialog')
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })
})

describe('ConfirmDialog', () => {
  it('names the thing, confirms and closes', async () => {
    const onConfirm = vi.fn<() => void>()
    function C() {
      const [open, setOpen] = useState(true)
      return <ConfirmDialog isOpen={open} onOpenChange={setOpen} thing="the Tuesday run" onConfirm={onConfirm} />
    }
    render(<C />)
    const dialog = await screen.findByRole('alertdialog', { name: 'Delete the Tuesday run?' })
    expect(dialog).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Delete the Tuesday run' }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
  })
})

function Probe() {
  const log = useSheetParam('log')
  const loc = useLocation()
  return (
    <div>
      <output data-testid="url">{loc.pathname + loc.search}</output>
      <output data-testid="open">{String(log.isOpen)}</output>
      <button onClick={log.open}>open log</button>
      <Sheet isOpen={log.isOpen} onOpenChange={log.onOpenChange} title="Log">
        body
      </Sheet>
    </div>
  )
}

describe('useSheetParam', () => {
  it('opens from the URL', async () => {
    render(
      <MemoryRouter initialEntries={['/athlete/today?sheet=log']}>
        <Probe />
      </MemoryRouter>,
    )
    expect(screen.getByTestId('open').textContent).toBe('true')
    expect(await screen.findByRole('dialog', { name: 'Log' })).toBeTruthy()
  })

  it('ignores unknown values', () => {
    render(
      <MemoryRouter initialEntries={['/athlete/today?sheet=nonsense']}>
        <Probe />
      </MemoryRouter>,
    )
    expect(screen.getByTestId('open').textContent).toBe('false')
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('pushes the param on open and removes it on close', async () => {
    render(
      <MemoryRouter initialEntries={['/athlete/today?w=2']}>
        <Probe />
      </MemoryRouter>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'open log' }))
    await screen.findByRole('dialog')
    expect(screen.getByTestId('url').textContent).toBe('/athlete/today?w=2&sheet=log')
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    await waitFor(() => expect(screen.getByTestId('url').textContent).toBe('/athlete/today?w=2'))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })
})

describe('Toast', () => {
  it('runs Undo and dismisses itself', async () => {
    const onUndo = vi.fn<() => void>()
    render(<ToastRegion />)
    act(() => {
      showUndoToast('Session moved to Thursday', onUndo)
    })
    expect(await screen.findByText('Session moved to Thursday')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(onUndo).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(screen.queryByText('Session moved to Thursday')).toBeNull())
  })

  it('times out on its own', async () => {
    render(<ToastRegion />)
    act(() => {
      showUndoToast('Saved', () => {}, 50)
    })
    expect(await screen.findByText('Saved')).toBeTruthy()
    await waitFor(() => expect(screen.queryByText('Saved')).toBeNull(), { timeout: 2000 })
  })
})
