/**
 * The Today budget (docs/dev/tooling.md): the entry script and every chunk Today imports
 * statically, gzipped, must stay at or under 160 KB. Sheets, dialogs and toasts load later and
 * do not count. Reads the Vite manifest, so run it after `build`.
 *
 *   node scripts/check-budget.ts [dist] [--live]
 *
 * With --live, the live gate and its static imports count as well: a signed-in device draws
 * Today inside it. Sign-in, onboarding and the Supabase client load after that and do not count.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'

const args = process.argv.slice(2)
/** A live build: the live gate wraps Today and loads before it can draw, so it counts too. */
const live = args.includes('--live')
const dist = args.find((a) => !a.startsWith('--')) ?? 'dist'
const BUDGET_KB = 160
const TODAY = 'src/features/athlete/today/TodayPage.tsx'
const LIVE_GATE = 'src/live/LiveGate.tsx'

interface Chunk {
  file: string
  isEntry?: boolean
  imports?: string[]
}

const manifestPath = join(dist, '.vite', 'manifest.json')
if (!existsSync(manifestPath)) {
  console.error(`${manifestPath} is missing: build with build.manifest on.`)
  process.exit(1)
}
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Record<string, Chunk>

const seen = new Set<string>()
const walk = (key: string) => {
  if (seen.has(key)) return
  const chunk = manifest[key]
  if (!chunk) throw new Error(`${key} is not in the manifest`)
  seen.add(key)
  for (const next of chunk.imports ?? []) walk(next)
}

const entry = Object.entries(manifest).find(([, c]) => c.isEntry)?.[0]
if (!entry) throw new Error('No entry chunk in the manifest')
walk(entry)
walk(TODAY)
if (live) walk(LIVE_GATE)

let total = 0
const rows: [string, number][] = []
for (const key of seen) {
  const file = (manifest[key] as Chunk).file
  if (!file.endsWith('.js')) continue
  const size = gzipSync(readFileSync(join(dist, file))).length
  total += size
  rows.push([file, size])
}
rows.sort((a, b) => b[1] - a[1])
for (const [file, size] of rows) console.log(`${(size / 1024).toFixed(1).padStart(7)} KB  ${file}`)
const kb = total / 1024
console.log(`Today${live ? ' (live)' : ''}: ${kb.toFixed(1)} KB gzipped, budget ${BUDGET_KB} KB`)
if (kb > BUDGET_KB) {
  console.error(`Over budget by ${(kb - BUDGET_KB).toFixed(1)} KB`)
  process.exit(1)
}
