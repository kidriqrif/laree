import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const dir = import.meta.dirname
const css = readFileSync(join(dir, 'tokens.css'), 'utf8')

type Tokens = Record<string, string>

/** Returns the body of the first block whose selector line starts with `selector`. */
function block(selector: string): string {
  const start = css.indexOf(selector + ' {')
  if (start < 0) throw new Error(`block not found: ${selector}`)
  const open = css.indexOf('{', start)
  let depth = 0
  for (let i = open; i < css.length; i++) {
    if (css[i] === '{') depth++
    else if (css[i] === '}') {
      depth--
      if (depth === 0) return css.slice(open + 1, i)
    }
  }
  throw new Error(`unterminated block: ${selector}`)
}

function decls(body: string): Tokens {
  const out: Tokens = {}
  for (const m of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) out[m[1]!] = m[2]!.trim()
  return out
}

const palette = decls(block(':root')) // first :root block is the primitives
const light: Tokens = { ...palette }
// the second :root block holds the light semantic tokens
const rootBlocks = [...css.matchAll(/^ {2}:root \{/gm)].map((m) => m.index)
function nth(i: number): Tokens {
  const idx = rootBlocks[i]
  const open = css.indexOf('{', idx)
  let depth = 0
  for (let j = open; j < css.length; j++) {
    if (css[j] === '{') depth++
    else if (css[j] === '}' && --depth === 0) return decls(css.slice(open + 1, j))
  }
  throw new Error('bad block')
}
Object.assign(light, nth(1))
const darkOverride = decls(block(':root[data-theme="dark"]'))
const darkMedia = decls(block(':root:not([data-theme="light"])'))
const dark: Tokens = { ...light, ...darkOverride }

const hex = (v: string) => /^#[0-9a-f]{6}$/i.test(v)
function lum(h: string): number {
  const c = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
  return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!
}
function contrast(a: string, b: string): number {
  const [hi, lo] = [lum(a), lum(b)].toSorted((x, y) => y - x)
  return (hi! + 0.05) / (lo! + 0.05)
}

// [foreground token, background token, minimum ratio, why]
type Pair = [string, string, number]
const TEXT = 4.5
const GRAPHIC = 3

const pairs: Pair[] = [
  ['--color-text', '--color-bg', TEXT],
  ['--color-text', '--color-surface', TEXT],
  ['--color-text', '--color-surface-sunken', TEXT],
  ['--color-text-muted', '--color-bg', TEXT],
  ['--color-text-muted', '--color-surface', TEXT],
  ['--color-link', '--color-bg', TEXT],
  ['--color-link', '--color-surface', TEXT],
  ['--color-on-action', '--color-action', TEXT],
  ['--color-on-action', '--color-action-hover', TEXT],
  ['--color-on-accent', '--color-accent', TEXT],
  ['--color-on-danger', '--color-danger', TEXT],
  ['--color-danger', '--color-bg', TEXT],
  ['--color-on-selection', '--color-selection', TEXT],
  ['--color-display-accent', '--color-bg', GRAPHIC], // large display type only
  ['--color-action', '--color-bg', GRAPHIC],
  ['--color-focus', '--color-bg', GRAPHIC],
  ['--color-focus', '--color-surface', GRAPHIC],
  ['--color-text-muted', '--color-surface-sunken', TEXT],
  ['--color-danger', '--color-surface', TEXT],
  ['--color-focus', '--color-surface-sunken', GRAPHIC],
  // control borders (WCAG 1.4.11): inputs, checkboxes, segmented tracks
  ['--color-control-border', '--color-bg', GRAPHIC],
  ['--color-control-border', '--color-surface', GRAPHIC],
  ['--color-control-border', '--color-surface-sunken', GRAPHIC],
  ['--chart-axis', '--color-surface-sunken', TEXT],
  ['--chart-axis', '--color-bg', TEXT],
  ['--chart-axis', '--color-surface', TEXT],
  // sport colours as graphics
  ['--sport-swim', '--color-bg', GRAPHIC],
  ['--sport-bike', '--color-bg', GRAPHIC],
  ['--sport-run', '--color-bg', GRAPHIC],
  ['--sport-strength', '--color-bg', GRAPHIC],
  ...['swim', 'bike', 'run', 'strength'].map((s): Pair => [`--sport-${s}`, '--color-surface', GRAPHIC]),
  // zone labels on zone fills
  ...[1, 2, 3, 4, 5].map((n): Pair => [`--zone-on-${n}`, `--zone-${n}`, TEXT]),
  // zones 4-5 stand alone against the page; 1-3 need the ink outline (documented)
  ['--zone-4', '--color-bg', GRAPHIC],
  ['--zone-5', '--color-bg', GRAPHIC],
  // status marks
  ['--status-on-plan', '--color-bg', GRAPHIC],
  ['--status-over', '--color-bg', GRAPHIC],
  ['--status-missed', '--color-bg', GRAPHIC],
  ['--status-unplanned', '--color-bg', GRAPHIC],
  ['--status-partial-outline', '--color-bg', GRAPHIC],
  ['--status-partial-outline', '--color-surface', GRAPHIC],
  ...['on-plan', 'over', 'missed', 'unplanned'].map((s): Pair => [`--status-${s}`, '--color-surface', GRAPHIC]),
  // status text
  ...['on-plan', 'partial', 'over', 'missed', 'unplanned'].flatMap((s): Pair[] => [
    [`--status-${s}-text`, '--color-bg', TEXT],
    [`--status-${s}-text`, '--color-surface', TEXT],
    [`--status-${s}-text`, '--color-surface-sunken', TEXT],
  ]),
  // chart series
  ['--series-fitness', '--color-bg', GRAPHIC],
  ['--series-fatigue', '--color-bg', GRAPHIC],
  ['--series-form', '--color-bg', GRAPHIC],
  ...['fitness', 'fatigue', 'form'].map((s): Pair => [`--series-${s}`, '--color-surface', GRAPHIC]),
]

describe('token files', () => {
  it('dark tokens under the media query equal the data-theme override', () => {
    expect(darkMedia).toEqual(darkOverride)
  })

  it('every dark override token also exists in light', () => {
    for (const k of Object.keys(darkOverride)) expect(k in light).toBe(true)
  })

  it('the athlete register switches at least 15 tokens', () => {
    const a = Object.keys(decls(block('[data-register="athlete"]'))).filter((k) => k !== '--text-xs')
    expect(a.length).toBeGreaterThanOrEqual(15)
  })

  for (const [mode, tokens] of [['light', light], ['dark', dark]] as const) {
    describe(`contrast in ${mode}`, () => {
      for (const [fg, bg, min] of pairs) {
        it(`${fg} on ${bg} >= ${min}`, () => {
          const f = tokens[fg]
          const b = tokens[bg]
          expect(f && hex(f), `${fg} must be a hex colour`).toBe(true)
          expect(b && hex(b), `${bg} must be a hex colour`).toBe(true)
          const ratio = contrast(f!, b!)
          expect(ratio, `${fg} ${f} on ${bg} ${b} = ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(min)
        })
      }
    })
  }
})

describe('fonts', () => {
  const banned = ['Inter', 'Geist', 'Space Grotesk', 'DM Sans', 'Manrope', 'Poppins', 'Bricolage Grotesque']
  const files = readdirSync(dir).filter((f) => f !== 'tokens.test.ts' && /\.(css|ts)$/.test(f))
  it('uses no banned font family', () => {
    for (const f of files) {
      const text = readFileSync(join(dir, f), 'utf8')
      for (const name of banned) {
        const re = new RegExp(`(^|[^A-Za-z])${name}([^A-Za-z]|$)`, 'i')
        expect(re.test(text), `${name} in ${f}`).toBe(false)
      }
    }
  })
})

describe('partial mark', () => {
  it('light: ink outline reads against the yellow fill', () => {
    expect(contrast(light['--status-partial-outline']!, light['--status-partial']!)).toBeGreaterThanOrEqual(GRAPHIC)
  })
})

describe('registers', () => {
  it('coach and athlete override the same tokens', () => {
    const a = Object.keys(decls(block('[data-register="athlete"]'))).toSorted()
    const c = Object.keys(decls(block('[data-register="coach"]'))).filter((k) => a.includes(k)).toSorted()
    expect(c.length).toBeGreaterThanOrEqual(15)
  })
})

const isSemantic = (k: string) => /^--(color|sport|zone|status|series|chart)-/.test(k)

describe('theme completeness', () => {
  it('every semantic colour in light has an explicit dark value', () => {
    expect(Object.keys(nth(1)).filter((k) => isSemantic(k) && !(k in darkOverride))).toEqual([])
  })
  it('dark defines nothing that light does not', () => {
    const lightKeys = new Set(Object.keys(nth(1)))
    expect(Object.keys(darkOverride).filter((k) => !lightKeys.has(k))).toEqual([])
  })
})

describe('registers switch only semantic tokens', () => {
  for (const reg of ['athlete', 'coach']) {
    it(`${reg} block has no raw colours and no palette or colour tokens`, () => {
      const bad = Object.entries(decls(block(`[data-register="${reg}"]`))).filter(
        ([k, val]) => /#[0-9a-f]{3,8}b/i.test(val) || /^--(palette|color|sport|zone|status|series)-/.test(k),
      )
      expect(bad).toEqual([])
    })
  }
})

describe('status colours never use brand red', () => {
  const brand = ['--palette-track', '--palette-track-ink', '--palette-oxblood'].map((k) => light[k]!.toLowerCase())
  it('no status token equals track, track-ink or oxblood, in either theme', () => {
    const keys = Object.keys(nth(1)).filter((k) => k.startsWith('--status-'))
    const bad = [light, dark].flatMap((t) => keys.filter((k) => brand.includes(t[k]!.toLowerCase())))
    expect(bad).toEqual([])
  })
})

describe('DESIGN.md matches tokens.css', () => {
  const design = readFileSync(join(dir, '..', '..', 'DESIGN.md'), 'utf8').toLowerCase()
  const known = new Set([...css.matchAll(/#[0-9a-f]{6}b/gi)].map((m) => m[0].toLowerCase()))
  it('every hex quoted in DESIGN.md exists in tokens.css', () => {
    const stale = [...design.matchAll(/#[0-9a-f]{6}b/g)].map((m) => m[0]).filter((h) => !known.has(h))
    expect(stale).toEqual([])
  })
  it('every palette primitive is documented', () => {
    const missing = Object.entries(palette).filter(([, val]) => hex(val) && !design.includes(val.toLowerCase()))
    expect(missing).toEqual([])
  })
})
