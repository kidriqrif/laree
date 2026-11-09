import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Test helpers: read tokens.css and compute WCAG contrast per theme.
 * Node only (used by tests, never imported by the app).
 */
export type Tokens = Record<string, string>

const css = readFileSync(join(import.meta.dirname, 'tokens.css'), 'utf8')

function bodyAt(open: number): string {
  let depth = 0
  for (let i = open; i < css.length; i++) {
    if (css[i] === '{') depth++
    else if (css[i] === '}' && --depth === 0) return css.slice(open + 1, i)
  }
  throw new Error('unterminated block')
}

function decls(body: string): Tokens {
  const out: Tokens = {}
  for (const m of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) out[m[1]!] = m[2]!.trim()
  return out
}

const rootStarts = [...css.matchAll(/^ {2}:root \{/gm)].map((m) => css.indexOf('{', m.index))
const darkStart = css.indexOf('{', css.indexOf(':root[data-theme="dark"] {'))

/** Palette plus the light semantic tokens. */
export const lightTokens: Tokens = { ...decls(bodyAt(rootStarts[0]!)), ...decls(bodyAt(rootStarts[1]!)) }
/** Light tokens with the explicit dark override applied. */
export const darkTokens: Tokens = { ...lightTokens, ...decls(bodyAt(darkStart)) }

export const TEXT = 4.5
export const GRAPHIC = 3

const isHex = (v: string | undefined): v is string => !!v && /^#[0-9a-f]{6}$/i.test(v)

function luminance(h: string): number {
  const c = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
  return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!
}

export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].toSorted((x, y) => y - x)
  return (hi! + 0.05) / (lo! + 0.05)
}

/** Contrast of two tokens in one theme; throws if either is not a hex colour. */
export function tokenContrast(theme: Tokens, fg: string, bg: string): number {
  const f = theme[fg]
  const b = theme[bg]
  if (!isHex(f) || !isHex(b)) throw new Error(`${fg} and ${bg} must both be hex colours`)
  return contrastRatio(f, b)
}
