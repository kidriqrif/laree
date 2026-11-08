/**
 * Serves dist under a sub-path (/some/other/path/) and checks that every file the app needs
 * resolves from there. This proves the build is path-agnostic, so the repo can be renamed.
 *
 * Coverage: the app uses a hash router, so a deep link (#/athlete/today) and a reload both send
 * the same GET for the mount root, and the server never sees the hash. Fetching the mount root
 * twice therefore covers the deep link and the reload. The role picker is drawn by JavaScript
 * after index.html loads, so this script checks that the entry script and styles resolve; it does
 * not run a browser.
 *
 * Usage: node scripts/check-base-path.ts [distDir]   (default: dist at the repo root)
 */
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { extname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const MOUNT = '/some/other/path/'
const DEFAULT_DIST = fileURLToPath(new URL('../dist/', import.meta.url))
const SCAN_EXT = new Set(['.html', '.js', '.mjs', '.css', '.json', '.webmanifest', '.svg', '.txt'])
const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
}

type Icon = { src?: unknown }
type Manifest = {
  start_url?: unknown
  scope?: unknown
  icons?: Icon[]
  shortcuts?: { url?: unknown; icons?: Icon[] }[]
}

/** Root-relative (/x), protocol-relative (//x) and absolute http(s) references break under a sub-path. */
const isAbsoluteRef = (value: string) => value.startsWith('/') || /^https?:/i.test(value)

function listFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    return entry.isDirectory() ? listFiles(path) : [path]
  })
}

/** A static server that answers only under MOUNT, the way a sub-path host would. */
function serve(distDir: string): Server {
  const root = resolve(distDir) + sep
  return createServer((req, res) => {
    let pathname: string
    try {
      pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname)
    } catch {
      res.writeHead(400).end()
      return
    }
    if (!pathname.startsWith(MOUNT)) {
      res.writeHead(404).end()
      return
    }
    let rel = pathname.slice(MOUNT.length)
    if (rel === '' || rel.endsWith('/')) rel += 'index.html'
    const file = resolve(root, rel)
    if (!file.startsWith(root) || !existsSync(file) || !statSync(file).isFile()) {
      res.writeHead(404).end()
      return
    }
    res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' })
    res.end(readFileSync(file))
  })
}

async function probe(url: URL, asText = false): Promise<{ status: number; text: string }> {
  const res = await fetch(url)
  if (!asText) {
    await res.arrayBuffer()
    return { status: res.status, text: '' }
  }
  return { status: res.status, text: await res.text() }
}

/** Runs every check against a served copy of dist. Returns the failures; an empty list means pass. */
export async function checkBase(distDir: string): Promise<string[]> {
  const dir = resolve(distDir)
  if (!existsSync(join(dir, 'index.html'))) return [`${dir} has no index.html; run npm run build first`]

  const failures: string[] = []
  const server = serve(dir)
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', () => done()))
  const address = server.address() as AddressInfo
  const base = new URL(`http://127.0.0.1:${address.port}${MOUNT}`)

  const expectOk = async (url: URL, label: string) => {
    const { status } = await probe(url)
    if (status !== 200) failures.push(`${label} ${url.pathname} returned ${status}, expected 200`)
  }

  try {
    // Deep link and reload both arrive as this GET (the hash never reaches the server).
    const first = await probe(base, true)
    const second = await probe(base, true)
    if (first.status !== 200 || second.status !== 200) {
      failures.push(`${MOUNT} returned ${first.status} then ${second.status}, expected 200 twice`)
      return failures
    }
    const html = first.text

    // Scripts, styles, icons and links in index.html.
    for (const match of html.matchAll(/<[a-z][^>]*?\s(?:src|href)\s*=\s*["']([^"']*)["']/gi)) {
      const value = match[1] ?? ''
      if (value === '' || value.startsWith('data:')) continue
      if (isAbsoluteRef(value)) {
        failures.push(`index.html has an absolute reference: ${value}`)
        continue
      }
      await expectOk(new URL(value, base), `index.html reference ${value}`)
    }

    // Open Graph image: relative values must resolve. Absolute https values are allowed,
    // because crawlers need a full URL and the brand guide asks for one at deploy time.
    for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
      if (!/property=["']og:image["']/i.test(tag)) continue
      const content = /content=["']([^"']*)["']/i.exec(tag)?.[1] ?? ''
      if (content === '' || /^https?:\/\//i.test(content)) continue
      if (isAbsoluteRef(content)) failures.push(`og:image is an absolute path: ${content}`)
      else await expectOk(new URL(content, base), `og:image ${content}`)
    }

    // Manifest: start_url and scope must sit under the mount, and every icon must resolve.
    const manifestTag = /<link\b[^>]*rel=["']manifest["'][^>]*>/i.exec(html)?.[0]
    const manifestHref = manifestTag ? /href=["']([^"']*)["']/i.exec(manifestTag)?.[1] : undefined
    if (!manifestHref) {
      failures.push('index.html has no manifest link')
    } else if (isAbsoluteRef(manifestHref)) {
      failures.push(`manifest link is an absolute path: ${manifestHref}`)
    } else {
      const manifestUrl = new URL(manifestHref, base)
      const res = await probe(manifestUrl, true)
      if (res.status !== 200) {
        failures.push(`manifest ${manifestUrl.pathname} returned ${res.status}, expected 200`)
      } else {
        let manifest: Manifest = {}
        try {
          manifest = JSON.parse(res.text) as Manifest
        } catch {
          failures.push('manifest is not valid JSON')
        }

        const scope = typeof manifest.scope === 'string' ? new URL(manifest.scope, manifestUrl) : undefined
        if (!scope) failures.push('manifest has no scope')

        const start = typeof manifest.start_url === 'string' ? manifest.start_url : ''
        if (!start) {
          failures.push('manifest has no start_url')
        } else if (isAbsoluteRef(start)) {
          failures.push(`manifest start_url is an absolute path: ${start}`)
        } else {
          const startUrl = new URL(start, manifestUrl)
          if (scope && !startUrl.href.startsWith(scope.href)) {
            failures.push(`manifest start_url ${start} is outside scope`)
          }
          await expectOk(startUrl, 'manifest start_url')
        }

        const iconSources = [
          ...(manifest.icons ?? []),
          ...(manifest.shortcuts ?? []).flatMap((s) => s.icons ?? []),
        ].flatMap((icon) => (typeof icon.src === 'string' ? [icon.src] : []))
        if ((manifest.icons ?? []).length === 0) failures.push('manifest has no icons')
        for (const src of iconSources) {
          if (isAbsoluteRef(src)) failures.push(`manifest icon is an absolute path: ${src}`)
          else await expectOk(new URL(src, manifestUrl), `manifest icon ${src}`)
        }

        for (const shortcut of manifest.shortcuts ?? []) {
          if (typeof shortcut.url !== 'string') continue
          if (isAbsoluteRef(shortcut.url)) failures.push(`shortcut url is an absolute path: ${shortcut.url}`)
          else await expectOk(new URL(shortcut.url, manifestUrl), `shortcut url ${shortcut.url}`)
        }
      }
    }

    // Service worker, if this build has one.
    if (existsSync(join(dir, 'sw.js'))) await expectOk(new URL('sw.js', base), 'service worker')
  } finally {
    server.closeAllConnections()
    await new Promise<void>((done) => server.close(() => done()))
  }

  // Absolute /assets/ references in the built text files would load from the host root.
  for (const file of listFiles(dir)) {
    if (!SCAN_EXT.has(extname(file))) continue
    if (/["'`(=]\/assets\//.test(readFileSync(file, 'utf8'))) {
      failures.push(`absolute /assets/ reference in ${relative(dir, file)}`)
    }
  }

  return failures
}

async function main(): Promise<void> {
  const dir = process.argv[2] ?? DEFAULT_DIST
  const failures = await checkBase(dir)
  if (failures.length > 0) {
    console.error(`Base path check failed (served under ${MOUNT}):\n- ${failures.join('\n- ')}`)
    process.exitCode = 1
    return
  }
  console.log(`Base path check passed: ${dir} works under ${MOUNT}.`)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((error: unknown) => {
    console.error(error)
    process.exitCode = 1
  })
}
