import { useCallback, useEffect, useState } from 'react'
import { SegmentedControl } from '../../../ui/form/index.ts'
import { ToastRegion } from '../../../ui/overlay/index.ts'
import type { RegisterName } from '../../../ui/overlay/index.ts'
import { ChartsGroup } from './ChartsGroup.tsx'
import { CoreGroup } from './CoreGroup.tsx'
import { DataGroup } from './DataGroup.tsx'
import { FormGroup } from './FormGroup.tsx'
import { IconsGroup } from './IconsGroup.tsx'
import { OverlayGroup } from './OverlayGroup.tsx'
import styles from './KitPage.module.css'

type Theme = 'light' | 'dark'

interface TocGroup {
  id: string
  title: string
  items: Array<{ id: string; name: string }>
}

const REGISTER_OPTIONS = [
  { id: 'athlete', label: 'Race day' },
  { id: 'coach', label: 'Results sheet' },
]
const THEME_OPTIONS = [
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
]

function systemTheme(): Theme {
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  } catch {
    return 'light'
  }
}

/** Reads the headings that are on the page, so the contents list can never drift from the content. */
function readToc(root: HTMLElement): TocGroup[] {
  return [...root.querySelectorAll<HTMLElement>('[data-group]')].map((g) => ({
    id: g.id,
    title: g.dataset.group ?? '',
    items: [...g.querySelectorAll<HTMLElement>('[data-spec]')]
      .filter((s) => s.id && s.dataset.spec !== 'Helpers and hooks')
      .map((s) => ({ id: s.id, name: s.dataset.spec ?? '' })),
  }))
}

/**
 * S4: every building block and chart, in both registers and both themes. The register toggle sets
 * data-register on the gallery only. The theme toggle sets data-theme on the document root and puts it
 * back when you leave.
 */
export default function KitPage() {
  const [register, setRegister] = useState<RegisterName>('athlete')
  const [theme, setTheme] = useState<Theme>(() => (document.documentElement.dataset.theme === 'dark' ? 'dark' : document.documentElement.dataset.theme === 'light' ? 'light' : systemTheme()))
  const [toc, setToc] = useState<TocGroup[]>([])

  useEffect(() => {
    const el = document.documentElement
    const before = el.getAttribute('data-theme')
    return () => {
      if (before === null) el.removeAttribute('data-theme')
      else el.setAttribute('data-theme', before)
    }
  }, [])

  const chooseTheme = (id: string) => {
    const next: Theme = id === 'dark' ? 'dark' : 'light'
    document.documentElement.setAttribute('data-theme', next)
    setTheme(next)
  }

  const mainRef = useCallback((el: HTMLDivElement | null) => {
    if (el) setToc(readToc(el))
  }, [])

  const jump = useCallback((id: string) => {
    document.getElementById(id)?.scrollIntoView({ block: 'start' })
  }, [])

  return (
    <div className={styles.kit} data-register={register} data-kit="">
      <aside className={styles.rail} aria-label="Gallery controls">
        <div className={styles.toggles}>
          <SegmentedControl
            ariaLabel="Register"
            options={REGISTER_OPTIONS}
            value={register}
            onChange={(id) => setRegister(id === 'coach' ? 'coach' : 'athlete')}
          />
          <SegmentedControl ariaLabel="Theme" options={THEME_OPTIONS} value={theme} onChange={chooseTheme} />
        </div>
        <nav className={styles.toc} aria-label="Contents">
          <ol>
            {toc.map((g) => (
              <li key={g.id}>
                <button type="button" className={`${styles.tocLink} ${styles.tocGroup}`} onClick={() => jump(g.id)}>
                  {g.title}
                </button>
                <ol>
                  {g.items.map((i) => (
                    <li key={i.id}>
                      <button type="button" className={styles.tocLink} onClick={() => jump(i.id)}>
                        {i.name}
                      </button>
                    </li>
                  ))}
                </ol>
              </li>
            ))}
          </ol>
        </nav>
      </aside>

      <div className={styles.main} ref={mainRef}>
        <header className={styles.top}>
          <h1>UI kit</h1>
          <p>
            Every component and chart in Laree, in the athlete register (Race day) and the coach register (Results
            sheet), light and dark. Hover, focus and pressed are pinned with the same data attributes react-aria sets;
            overlays and tooltips are live because they only exist while open.
          </p>
        </header>
        <CoreGroup />
        <IconsGroup />
        <OverlayGroup register={register} />
        <FormGroup />
        <DataGroup />
        <ChartsGroup />
      </div>
      <ToastRegion register={register} />
    </div>
  )
}
