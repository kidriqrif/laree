import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { MemoryRouter, useLocation } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CoachKeyboard, HotkeyProvider, useHotkeys } from './index.ts'

afterEach(() => {
  vi.useRealTimers()
  cleanup()
})

const press = (key: string, target: Element | Document = document.body) => fireEvent.keyDown(target, { key })

function Where() {
  return <p data-testid="where">{useLocation().pathname}</p>
}

function Page({ onN }: { onN: () => void }) {
  useHotkeys([{ keys: 'n', description: 'New workout', handler: onN }])
  return <input aria-label="Notes" />
}

function App({ withPage = true, onN = () => {} }: { withPage?: boolean; onN?: () => void }) {
  return (
    <MemoryRouter initialEntries={['/coach/overview']}>
      <CoachKeyboard>
        <Where />
        {withPage ? <Page onN={onN} /> : null}
      </CoachKeyboard>
    </MemoryRouter>
  )
}

describe('hotkeys', () => {
  it.each([
    ['o', '/coach/overview'],
    ['c', '/coach/calendar/amir'],
    ['s', '/coach/season/amir'],
    ['l', '/coach/library'],
    ['a', '/coach/analytics/amir'],
    ['i', '/coach/check-ins'],
    ['t', '/coach/settings'],
  ])('g then %s goes to %s', (second, path) => {
    render(<App />)
    press('g')
    press('t')
    press('g')
    press(second)
    expect(screen.getByTestId('where').textContent).toBe(path)
  })

  it('fires single keys and two-key sequences', () => {
    const onN = vi.fn<() => void>()
    render(<App onN={onN} />)
    press('n')
    expect(onN).toHaveBeenCalledOnce()
    press('g')
    press('c')
    expect(screen.getByTestId('where').textContent).toBe('/coach/calendar/amir')
    press('g')
    press('t')
    expect(screen.getByTestId('where').textContent).toBe('/coach/settings')
    press('g')
    press('o')
    expect(screen.getByTestId('where').textContent).toBe('/coach/overview')
  })

  it('drops a sequence after one second', () => {
    vi.useFakeTimers()
    render(<App />)
    press('g')
    act(() => {
      vi.advanceTimersByTime(1100)
    })
    press('c')
    expect(screen.getByTestId('where').textContent).toBe('/coach/overview')
  })

  it('ignores typing in fields and keys with Ctrl held', () => {
    const onN = vi.fn<() => void>()
    render(<App onN={onN} />)
    const field = screen.getByLabelText('Notes')
    press('n', field)
    press('g', field)
    press('c', field)
    expect(onN).not.toHaveBeenCalled()
    expect(screen.getByTestId('where').textContent).toBe('/coach/overview')
    fireEvent.keyDown(document.body, { key: 'n', ctrlKey: true })
    expect(onN).not.toHaveBeenCalled()
  })

  it('does nothing when single keys are off', () => {
    const onN = vi.fn<() => void>()
    function Off() {
      useHotkeys([{ keys: 'n', description: 'New', handler: onN }])
      return null
    }
    render(
      <HotkeyProvider singleKeys={false}>
        <Off />
      </HotkeyProvider>,
    )
    press('n')
    expect(onN).not.toHaveBeenCalled()
  })

  it('lists page keys in help only while their page is mounted, global keys after', async () => {
    function Toggle() {
      const [on, setOn] = useState(true)
      return (
        <>
          <button onClick={() => setOn(false)}>Leave page</button>
          {on ? <Page onN={() => {}} /> : null}
        </>
      )
    }
    render(
      <MemoryRouter>
        <CoachKeyboard>
          <Toggle />
        </CoachKeyboard>
      </MemoryRouter>,
    )
    press('?')
    const help = await screen.findByRole('dialog', { name: 'Keyboard help' })
    const text = () => help.textContent ?? ''
    expect(text()).toContain('New workout')
    expect(text().indexOf('New workout')).toBeLessThan(text().indexOf('Go to Overview'))
    expect(text()).toContain('g then c')
    fireEvent.keyDown(document.body, { key: "?" })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    fireEvent.click(screen.getByRole('button', { name: 'Leave page' }))
    press('?')
    const again = await screen.findByRole('dialog', { name: 'Keyboard help' })
    expect(again.textContent).not.toContain('New workout')
    expect(again.textContent).toContain('This screen has no keys of its own.')
  })

  it('opens Jump to with / and navigates with arrow keys and Enter', async () => {
    render(<App withPage={false} />)
    press('/')
    const box = await screen.findByRole('combobox', {
      name: 'Search athletes and sections',
    })
    expect(screen.getAllByRole('option').length).toBe(10)
    fireEvent.change(box, { target: { value: 'dan' } })
    expect(screen.getAllByRole('option')).toHaveLength(1)
    fireEvent.change(box, { target: { value: 'a' } })
    fireEvent.keyDown(box, { key: 'ArrowDown' })
    fireEvent.keyDown(box, { key: 'Enter' })
    await waitFor(() => expect(screen.getByTestId('where').textContent).toMatch(/^\/coach\//))
    expect(screen.getByTestId('where').textContent).not.toBe('/coach/overview')
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('says when nothing matches', async () => {
    render(<App withPage={false} />)
    press('/')
    const box = await screen.findByRole('combobox')
    fireEvent.change(box, { target: { value: 'xyz' } })
    expect(screen.getByText(/Nothing matches/)).toBeTruthy()
  })
})
