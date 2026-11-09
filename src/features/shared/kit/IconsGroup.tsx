import { createElement, type ReactNode } from 'react'
import * as iconIndex from '../../../ui/icons/index.ts'
import { Icon, IconFrame, ICON_NAMES, ICON_PATHS, NamedIcon } from '../../../ui/icons/index.ts'
import { Group, Specimen, State } from './Specimen.tsx'
import styles from './KitPage.module.css'

const FROM = 'src/ui/icons/index.ts'
const NOT_GLYPHS = new Set(['Icon', 'IconFrame', 'NamedIcon'])

/** Every `Icon<Name>` wrapper and the older nav aliases, found by walking the index so none is skipped. */
const GLYPH_EXPORTS = Object.entries(iconIndex)
  .filter(([key, value]) => typeof value === 'function' && /Icon/.test(key) && !NOT_GLYPHS.has(key))
  .map(([key, value]) => [key, value as (props: { size?: number }) => ReactNode] as const)

export function IconsGroup() {
  return (
    <Group
      title="Icons"
      importPath={FROM}
      intro="Hand-drawn 24 px set: 2 px round strokes in the current text colour, no fill. Import the named wrappers so a screen ships only the icons it draws."
    >
      <Specimen
        name="Icon grid"
        covers={[]}
        importLine={`import { IconToday, IconRun, ... } from '${FROM}'`}
        from={FROM}
        wide
        note="One wrapper per icon, plus the older nav names that point at the same drawings."
      >
        <State label="Default" wide>
          <ul className={styles.iconGrid}>
            {GLYPH_EXPORTS.map(([key, Comp]) => (
              <li key={key} className={styles.iconCell} data-covers={key}>
                {createElement(Comp, { size: 24 })}
                <code>{key}</code>
              </li>
            ))}
          </ul>
        </State>
      </Specimen>

      <Specimen name="NamedIcon" covers={['NamedIcon', 'ICON_NAMES', 'ICON_PATHS']} from={FROM} wide note="Picks an icon by name for data-driven lists. It pulls in the whole set, so use it only where the name is data.">
        <State label="Default" wide>
          <ul className={styles.iconGrid}>
            {ICON_NAMES.map((name) => (
              <li key={name} className={styles.iconCell}>
                <NamedIcon name={name} />
                <code>{name}</code>
              </li>
            ))}
          </ul>
        </State>
      </Specimen>

      <Specimen name="Icon and IconFrame" covers={['Icon', 'IconFrame']} from={FROM}>
        <State label="From geometry">
          <Icon paths={ICON_PATHS.Today} size={32} title="Today" />
        </State>
        <State label="Custom drawing in the frame">
          <IconFrame size={32} title="Finish line">
            <path d="M5 21V4M5 5h14l-3 4 3 4H5" />
          </IconFrame>
        </State>
        <State label="Named for assistive tech">
          <IconFrame size={32} aria-label="Distance in kilometres">
            <path d="M4 12h16M8 8l-4 4 4 4M16 8l4 4-4 4" />
          </IconFrame>
        </State>
      </Specimen>

    </Group>
  )
}
