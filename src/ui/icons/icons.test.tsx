import { cleanup, render, screen } from '@testing-library/react'
import type { ComponentType, ReactElement } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import * as icons from './index.ts'

type IconComponent = ComponentType<icons.IconProps>

const exported = icons as unknown as Readonly<Record<string, IconComponent | undefined>>

const componentFor = (exportName: string): IconComponent => {
  const component = exported[exportName]
  if (typeof component !== 'function') throw new Error(`${exportName} is not exported`)
  return component
}

const svgOf = (ui: ReactElement): SVGSVGElement => {
  const svg = render(ui).container.querySelector('svg')
  if (!svg) throw new Error('no svg rendered')
  return svg
}

const LEGACY_NAMES = {
  TodayIcon: 'IconToday',
  WeekIcon: 'IconWeek',
  PlusIcon: 'IconPlus',
  ProgressIcon: 'IconProgress',
  MeIcon: 'IconMe',
  OverviewIcon: 'IconOverview',
  CalendarIcon: 'IconCalendar',
  SeasonIcon: 'IconSeason',
  LibraryIcon: 'IconLibrary',
  AnalyticsIcon: 'IconAnalytics',
  CheckInsIcon: 'IconCheckIns',
  SettingsIcon: 'IconSettings',
  MenuIcon: 'IconMenu',
  ChevronDownIcon: 'IconChevronDown',
} as const

afterEach(cleanup)

describe('icon set', () => {
  it('names at least 40 icons, each once', () => {
    expect(icons.ICON_NAMES.length).toBeGreaterThanOrEqual(40)
    expect(new Set(icons.ICON_NAMES).size).toBe(icons.ICON_NAMES.length)
    expect(Object.keys(icons.ICON_PATHS).toSorted()).toEqual(icons.ICON_NAMES.toSorted())
  })

  it.each(icons.ICON_NAMES)('Icon%s draws on the 24 px grid and is hidden without a title', (name) => {
    const Component = componentFor(`Icon${name}`)
    const svg = svgOf(<Component />)
    expect(svg.getAttribute('viewBox')).toBe('0 0 24 24')
    expect(svg.getAttribute('aria-hidden')).toBe('true')
    expect(svg.getAttribute('focusable')).toBe('false')
    expect(svg.hasAttribute('role')).toBe(false)
    expect(svg.querySelector('title')).toBeNull()
    expect(svg.children.length).toBeGreaterThan(0)
  })

  it.each(icons.ICON_NAMES)('Icon%s is an image named by its title', (name) => {
    const Component = componentFor(`Icon${name}`)
    render(<Component title={`${name} icon`} />)
    const img = screen.getByRole('img', { name: `${name} icon` })
    expect(img.tagName.toLowerCase()).toBe('svg')
    expect(img.hasAttribute('aria-hidden')).toBe(false)
    expect(img.querySelector('title')?.id).toBe(img.getAttribute('aria-labelledby'))
  })

  it.each(Object.entries(LEGACY_NAMES))('keeps the T4.1 name %s as %s', (legacy, current) => {
    expect(componentFor(legacy)).toBe(componentFor(current))
  })

  it('draws at the requested size and passes props through to the svg', () => {
    const svg = svgOf(<icons.IconSearch size={20} className="nav-icon" data-testid="search" />)
    expect(svg.getAttribute('width')).toBe('20')
    expect(svg.getAttribute('height')).toBe('20')
    expect(svg.getAttribute('class')).toBe('nav-icon')
    expect(svg.getAttribute('data-testid')).toBe('search')
  })

  it('strokes in currentColor and fills only the small dots', () => {
    const svg = svgOf(<icons.IconInfo />)
    expect(svg.getAttribute('stroke')).toBe('currentColor')
    expect(svg.getAttribute('fill')).toBe('none')
    const filled = [...svg.querySelectorAll('[fill]')].filter((el) => el.getAttribute('fill') !== 'none')
    expect(filled).toHaveLength(1)
    expect(filled[0]?.getAttribute('fill')).toBe('currentColor')
    expect(Number(filled[0]?.getAttribute('r'))).toBeLessThanOrEqual(1.5)
  })

  it('treats an aria-label as a name', () => {
    const svg = svgOf(<icons.IconClose aria-label="Close" />)
    expect(svg.getAttribute('role')).toBe('img')
    expect(svg.hasAttribute('aria-hidden')).toBe(false)
  })

  it('draws the same icon by name', () => {
    const byName = svgOf(<icons.NamedIcon name="Race" />)
    const byComponent = svgOf(<icons.IconRace />)
    expect(byName.innerHTML).toBe(byComponent.innerHTML)
  })
})
