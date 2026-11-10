import { readdirSync, statSync } from 'node:fs'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { FILE_BYTES } from './assets.ts'
import BrandPage from './BrandPage.tsx'

afterEach(cleanup)

const root = `${process.cwd().replaceAll(String.fromCharCode(92), '/')}/brand/`
const svgs = readdirSync(`${root}svg`).filter((f) => f.endsWith('.svg'))
const pngs = readdirSync(`${root}png`).filter((f) => f.endsWith('.png'))

function links(): HTMLAnchorElement[] {
  return [...document.querySelectorAll<HTMLAnchorElement>('a[download]')]
}

describe('BrandPage', () => {
  it('has a download link for every SVG in brand/svg', () => {
    render(<BrandPage />)
    const names = links().map((a) => a.getAttribute('download'))
    for (const svg of svgs) expect(names).toContain(svg)
  })

  it('has a download link for every PNG in brand/png', () => {
    render(<BrandPage />)
    const names = links().map((a) => a.getAttribute('download'))
    for (const png of pngs) expect(names).toContain(png)
  })

  it('never links to a root-relative path', () => {
    render(<BrandPage />)
    for (const a of links()) expect(a.getAttribute('href')?.startsWith('/')).toBe(false)
    for (const img of document.querySelectorAll('img')) expect(img.getAttribute('src')?.startsWith('/')).toBe(false)
  })

  it('lists exact file sizes', () => {
    for (const f of [...svgs.map((s) => `svg/${s}`), ...pngs.map((p) => `png/${p}`)]) {
      expect(FILE_BYTES[f.split('/')[1] ?? '']).toBe(statSync(`${root}${f}`).size)
    }
  })

  it('shows the heading, the tagline and a hex for every palette entry', () => {
    render(<BrandPage />)
    expect(screen.getByRole('heading', { level: 1, name: 'Brand board' })).toBeTruthy()
    // Under the logo in the hero, and again in its own section.
    expect(screen.getAllByText('Every lane counts.')).toHaveLength(2)
    // The other candidate is named in a rule, never set as a line of its own.
    expect(screen.queryByText('Lap by lap.')).toBeNull()
    expect(screen.getAllByText('#E4572E').length).toBeGreaterThan(0)
  })
})
