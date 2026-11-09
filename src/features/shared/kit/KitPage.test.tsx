import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import * as charts from '../../../charts/index.ts'
import * as core from '../../../ui/core/index.ts'
import * as data from '../../../ui/data/index.ts'
import * as form from '../../../ui/form/index.ts'
import * as icons from '../../../ui/icons/index.ts'
import * as overlay from '../../../ui/overlay/index.ts'
import KitPage from './KitPage.tsx'

afterEach(() => {
  cleanup()
  document.documentElement.removeAttribute('data-theme')
})

const renderKit = () =>
  render(
    <MemoryRouter>
      <KitPage />
    </MemoryRouter>,
  )

const INDEXES: Array<[string, object]> = [
  ['ui/core', core],
  ['ui/icons', icons],
  ['ui/overlay', overlay],
  ['ui/form', form],
  ['ui/data', data],
  ['charts', charts],
]

// Each test renders the whole gallery, which can pass 5 s when the full suite shares the CPU.
describe('KitPage', { timeout: 20_000 }, () => {
  it('shows every export of every index at least once', () => {
    const { container } = renderKit()
    const covered = new Set<string>()
    for (const el of container.querySelectorAll('[data-covers]')) {
      for (const name of (el.getAttribute('data-covers') ?? '').split(/\s+/)) if (name) covered.add(name)
    }
    for (const [label, mod] of INDEXES) {
      const missing = Object.keys(mod).filter((k) => !covered.has(k))
      expect(missing, `exports of ${label} missing from the gallery`).toEqual([])
    }
  })

  it('names each section with its import path and builds a contents list that points at real sections', () => {
    const { container } = renderKit()
    const groups = [...container.querySelectorAll('[data-group]')]
    expect(groups.length).toBe(6)
    for (const g of groups) expect(g.querySelector('code')?.textContent).toMatch(/^src\//)
    const toc = screen.getByRole('navigation', { name: 'Contents' })
    const links = within(toc).getAllByRole('button')
    expect(links.length).toBeGreaterThan(20)
    for (const spec of container.querySelectorAll('[data-spec]')) expect(spec.id).toBeTruthy()
  })

  it('switches the register on the gallery', () => {
    const { container } = renderKit()
    const kit = container.querySelector('[data-kit]')
    expect(kit?.getAttribute('data-register')).toBe('athlete')
    fireEvent.click(screen.getByRole('radio', { name: 'Results sheet' }))
    expect(kit?.getAttribute('data-register')).toBe('coach')
    fireEvent.click(screen.getByRole('radio', { name: 'Race day' }))
    expect(kit?.getAttribute('data-register')).toBe('athlete')
  })

  it('switches the theme on the document root and restores it on leaving', () => {
    document.documentElement.setAttribute('data-theme', 'light')
    const { unmount } = renderKit()
    fireEvent.click(screen.getByRole('radio', { name: 'Dark' }))
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
    unmount()
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
  })

  it('pins hover and focus with the data attributes react-aria sets', () => {
    const { container } = renderKit()
    expect(container.querySelector('[data-pin="hover"] [data-hovered="true"]')).not.toBeNull()
    expect(container.querySelector('[data-pin="focus"] [data-focus-visible="true"]')).not.toBeNull()
  })
})
