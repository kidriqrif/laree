/** Reads dist/manifest.webmanifest and exits non-zero on any missing or wrong field. */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const dist = process.argv[2] ?? 'dist'
const errors: string[] = []
const fail = (m: string) => errors.push(m)

const file = join(dist, 'manifest.webmanifest')
let m: Record<string, unknown> = {}
if (!existsSync(file)) {
  fail(`${file} is missing`)
} else {
  try {
    m = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>
  } catch {
    fail('manifest is not valid JSON')
  }
}

const eq = (k: string, v: string) => {
  if (m[k] !== v) fail(`${k} must be ${JSON.stringify(v)}, got ${JSON.stringify(m[k])}`)
}
eq('id', './')
eq('start_url', './')
eq('scope', './')
eq('name', 'Laree')
eq('short_name', 'Laree')
eq('lang', 'en-MY')
eq('display', 'standalone')
for (const k of ['description', 'theme_color', 'background_color']) {
  if (typeof m[k] !== 'string' || !m[k]) fail(`${k} is missing`)
}

type Icon = { src?: string; sizes?: string; type?: string; purpose?: string }
const icons = (Array.isArray(m.icons) ? m.icons : []) as Icon[]
const purposes = (p: Icon) => (p.purpose ?? 'any').split(/\s+/)
const need = (sizes: string, purpose: string) => {
  if (!icons.some((i) => i.sizes === sizes && purposes(i).includes(purpose))) {
    fail(`no ${purpose} icon of ${sizes}`)
  }
}
need('192x192', 'any')
need('512x512', 'any')
need('512x512', 'maskable')
need('512x512', 'monochrome')
for (const i of icons) {
  if (!i.src) fail('an icon has no src')
  else if (/^(\/|[a-z]+:)/i.test(i.src)) fail(`icon src must be relative: ${i.src}`)
  else if (!existsSync(join(dist, i.src))) fail(`icon file missing in ${dist}: ${i.src}`)
}

type Shortcut = { name?: string; url?: string; icons?: Icon[] }
const shortcuts = (Array.isArray(m.shortcuts) ? m.shortcuts : []) as Shortcut[]
const expected: [string, string][] = [
  ['Log a session', './#/athlete/today?sheet=log'],
  ['Today', './#/athlete/today'],
]
for (const [name, url] of expected) {
  const s = shortcuts.find((x) => x.name === name)
  if (!s) fail(`shortcut "${name}" is missing`)
  else {
    if (s.url !== url) fail(`shortcut "${name}" url must be ${url}, got ${s.url}`)
    if (!s.icons?.length) fail(`shortcut "${name}" has no icon`)
    for (const i of s.icons ?? []) {
      if (!i.src || !existsSync(join(dist, i.src))) fail(`shortcut "${name}" icon missing: ${i.src}`)
    }
  }
}
if (shortcuts.length !== 2) fail(`expected 2 shortcuts, got ${shortcuts.length}`)

if (errors.length) {
  console.error('Manifest check failed:\n- ' + errors.join('\n- '))
  process.exit(1)
}
console.log('Manifest check passed.')
