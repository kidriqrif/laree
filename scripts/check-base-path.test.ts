// @vitest-environment node
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { checkBase } from './check-base-path.ts'

const INDEX = `<!doctype html>
<html><head>
<meta property="og:image" content="./og.png" />
<link rel="icon" href="./favicon.ico" />
<link rel="manifest" href="./manifest.webmanifest">
</head><body><script type="module" src="./assets/app.js"></script></body></html>`

const MANIFEST = JSON.stringify({
  start_url: './',
  scope: './',
  icons: [{ src: 'pwa-192.png', sizes: '192x192' }],
  shortcuts: [{ name: 'Today', url: './#/athlete/today', icons: [{ src: 'pwa-192.png' }] }],
})

let dir: string

function write(rel: string, content: string) {
  const path = join(dir, rel)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, content)
}

function buildFixture() {
  write('index.html', INDEX)
  write('manifest.webmanifest', MANIFEST)
  write('assets/app.js', 'console.log("app")')
  write('favicon.ico', 'ico')
  write('og.png', 'png')
  write('pwa-192.png', 'png')
  write('sw.js', 'self.skipWaiting()')
}

describe('checkBase', () => {
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'laree-base-'))
  })
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('passes a relative build under a sub-path', async () => {
    buildFixture()
    await expect(checkBase(dir)).resolves.toEqual([])
  })

  it('fails when index.html has a root-relative reference', async () => {
    buildFixture()
    write('index.html', INDEX.replace('./favicon.ico', '/favicon.ico'))
    const failures = await checkBase(dir)
    expect(failures.join('\n')).toContain('absolute reference')
  })

  it('fails when a referenced file is missing', async () => {
    buildFixture()
    write('index.html', INDEX.replace('./assets/app.js', './assets/gone.js'))
    const failures = await checkBase(dir)
    expect(failures.join('\n')).toContain('returned 404')
  })

  it('fails when a built file hard-codes /assets/', async () => {
    buildFixture()
    write('assets/chunk.js', 'import("/assets/other.js")')
    const failures = await checkBase(dir)
    expect(failures.join('\n')).toContain('absolute /assets/ reference in assets')
  })

  it('fails when a manifest icon does not resolve', async () => {
    buildFixture()
    write('manifest.webmanifest', JSON.stringify({ start_url: './', scope: './', icons: [{ src: 'missing.png' }] }))
    const failures = await checkBase(dir)
    expect(failures.join('\n')).toContain('/some/other/path/missing.png returned 404')
  })

  it('fails when there is no index.html', async () => {
    await expect(checkBase(dir)).resolves.toEqual([expect.stringContaining('no index.html')])
  })
})
