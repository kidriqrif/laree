import { Logo } from '../../../ui/brand/Logo.tsx'
import { buttonClass } from '../../../ui/core/Button.tsx'
import { FILE_BYTES, PNG_URLS, SVG_URLS, formatBytes, resolveHref } from './assets.ts'
import {
  BRAND_COLOURS,
  LOGO_FILES,
  MISUSE,
  RULES,
  SEMANTIC,
  SPORTS,
  STATUSES,
  TAGLINE,
  TAGLINE_RULES,
  ZONES,
} from './content.ts'
import type { Ground, LogoFile } from './content.ts'
import styles from './BrandPage.module.css'

const GROUND_CLASS: Record<Ground, string> = {
  paper: styles.groundPaper ?? '',
  'paper-2': styles.groundPaper2 ?? '',
  sand: styles.groundSand ?? '',
  ink: styles.groundInk ?? '',
  night: styles.groundNight ?? '',
}

const GROUND_NAME: Record<Ground, string> = {
  paper: 'paper',
  'paper-2': 'paper 2',
  sand: 'sand',
  ink: 'ink',
  night: 'night',
}

function DownloadLink({ file, url, label }: { file: string; url: string | undefined; label: string }) {
  if (!url) return null
  const bytes = FILE_BYTES[file]
  return (
    <a
      className={buttonClass('secondary', styles.download)}
      href={resolveHref(url)}
      download={file}
      data-file={file}
      aria-label={`Download ${file}${bytes ? `, ${formatBytes(bytes)}` : ''}`}
    >
      <span>{label}</span>
      <span className={styles.size} data-numeric>
        {bytes ? formatBytes(bytes) : ''}
      </span>
    </a>
  )
}

function LogoTile({ item }: { item: LogoFile }) {
  const url = SVG_URLS[item.file]
  return (
    <figure className={styles.tile}>
      <div className={`${styles.ground} ${GROUND_CLASS[item.ground]}`} data-ground={item.ground}>
        {url ? (
          <img
            src={resolveHref(url)}
            alt={`${item.title}: ${item.file.replace('.svg', '')}`}
            style={{ blockSize: item.height }}
            className={styles.art}
          />
        ) : null}
      </div>
      <figcaption className={styles.caption}>
        <h4 className={styles.tileTitle}>{item.title}</h4>
        <p className={styles.use}>{item.use}</p>
        <p className={styles.meta}>
          On {GROUND_NAME[item.ground]}. <code>{item.file}</code>
        </p>
        <div className={styles.downloads}>
          <DownloadLink file={item.file} url={url} label="SVG" />
          {item.png?.map((png) => (
            <DownloadLink key={png} file={png} url={PNG_URLS[png]} label={pngLabel(png)} />
          ))}
        </div>
      </figcaption>
    </figure>
  )
}

function pngLabel(file: string): string {
  const m = /(@\dx|-\d+)\.png$/.exec(file)
  return m?.[1] ? `PNG ${m[1].replace('-', '')}` : 'PNG'
}

function Section({ id, title, lede, children }: { id: string; title: string; lede?: string; children: React.ReactNode }) {
  return (
    <section className={styles.section} aria-labelledby={`${id}-h`} id={id}>
      <header className={styles.sectionHead}>
        <h2 id={`${id}-h`}>{title}</h2>
        {lede ? <p className={styles.lede}>{lede}</p> : null}
      </header>
      {children}
    </section>
  )
}

function Chip2({ light, dark, name }: { light: string; dark: string; name: string }) {
  return (
    <div className={styles.split} title={`${name}: ${light} in light, ${dark} in dark`} aria-hidden="true">
      <span style={{ background: light }} />
      <span style={{ background: dark }} />
    </div>
  )
}

export default function BrandPage() {
  return (
    <div className={styles.page} data-register="athlete" data-screen="S3">
      <header className={styles.hero}>
        <div className={styles.heroLogo}>
          <Logo size={88} title="Laree" />
        </div>
        <h1 className={styles.title}>Brand board</h1>
        <p className={styles.tagline}>{TAGLINE.line}</p>
        <p className={styles.heroNote}>
          The l is a 400 m track bend, drawn with lane lines and a real track stagger. This page holds every logo file,
          the colours, the type and the rules for using them.
        </p>
        <nav aria-label="Brand board sections" className={styles.jump}>
          <a href="#logo">Logo</a>
          <a href="#colour">Colour</a>
          <a href="#type">Type</a>
          <a href="#rules">Rules</a>
          <a href="#voice">Tagline</a>
        </nav>
      </header>

      <Section id="logo" title="The logo" lede="Each file is shown on the ground it is meant for. Download the SVG for anything that scales, the PNG for tools that cannot take SVG.">
        {LOGO_FILES.map((group) => (
          <div key={group.heading} className={styles.group}>
            <h3>{group.heading}</h3>
            <p className={styles.blurb}>{group.blurb}</p>
            <div className={styles.tiles}>
              {group.files.map((item) => (
                <LogoTile key={item.file} item={item} />
              ))}
            </div>
          </div>
        ))}
      </Section>

      <Section id="colour" title="Colour" lede="Warm paper and ink, with track red doing the work. Every colour comes with its job.">
        <div className={styles.palette}>
          {BRAND_COLOURS.map((c) => (
            <div key={c.name} className={styles.swatch}>
              <div
                className={styles.swatchChip}
                style={{ background: `var(${c.token}, ${c.hex})`, color: c.text === 'ink' ? 'var(--palette-ink)' : 'var(--palette-paper)' }}
              >
                <span className={styles.swatchName}>{c.name}</span>
                <span data-numeric>{c.hex}</span>
              </div>
              <p className={styles.swatchRole}>{c.role}</p>
            </div>
          ))}
        </div>

        <h3>Light and dark</h3>
        <p className={styles.blurb}>Left half is light, right half is dark.</p>
        <ul className={styles.rows}>
          {SEMANTIC.map((s) => (
            <li key={s.name} className={styles.row}>
              <Chip2 light={s.light} dark={s.dark} name={s.name} />
              <div>
                <p className={styles.rowName}>{s.name}</p>
                <p className={styles.rowRole}>
                  {s.role}
                  {s.pair ? `. ${s.pair}` : ''}
                </p>
              </div>
              <p className={styles.hexes} data-numeric>
                {s.light}
                <br />
                {s.dark}
              </p>
            </li>
          ))}
        </ul>

        <h3>Sport</h3>
        <p className={styles.blurb}>Sport is never colour alone. Every colour comes with a glyph and a label.</p>
        <ul className={styles.rows}>
          {SPORTS.map((s) => (
            <li key={s.name} className={styles.row}>
              <Chip2 light={s.light} dark={s.dark} name={s.name} />
              <div>
                <p className={styles.rowName}>{s.name}</p>
                <p className={styles.rowRole}>{s.cue}</p>
              </div>
              <p className={styles.hexes} data-numeric>
                {s.light}
                <br />
                {s.dark}
              </p>
            </li>
          ))}
        </ul>

        <h3>Intensity, easy to hard</h3>
        <p className={styles.blurb}>Sand to oxblood. Zones are always labelled Z1 to Z5.</p>
        <ol className={styles.zones} aria-label="Intensity zones">
          {ZONES.map((z) => (
            <li key={z.zone} style={{ background: z.light }} className={`${styles.zone} ${z.zone === 'Z5' ? styles.onPaper : styles.onInk}`}>
              <span>{z.zone}</span>
              <span data-numeric>{z.light}</span>
            </li>
          ))}
        </ol>
        <ol className={styles.zones} aria-label="Intensity zones, dark theme">
          {ZONES.map((z) => (
            <li key={z.zone} style={{ background: z.dark }} className={`${styles.zone} ${z.zone === 'Z1' || z.zone === 'Z5' ? styles.onChalk : styles.onInk}`}>
              <span>{z.zone}</span>
              <span data-numeric>{z.dark}</span>
            </li>
          ))}
        </ol>

        <h3>Status</h3>
        <p className={styles.blurb}>Compliance only, never brand red. Each has its own shape and word.</p>
        <ul className={styles.rows}>
          {STATUSES.map((s) => (
            <li key={s.name} className={styles.row}>
              <Chip2 light={s.light} dark={s.dark} name={s.name} />
              <div>
                <p className={styles.rowName}>{s.name}</p>
                <p className={styles.rowRole}>{s.mark}</p>
              </div>
              <p className={styles.hexes} data-numeric>
                {s.light}
                <br />
                {s.dark}
              </p>
            </li>
          ))}
        </ul>
      </Section>

      <Section id="type" title="Type" lede="One display family runs both halves of the product. Two more families do the reading and the numbers.">
        <div className={styles.specimens}>
          <article className={styles.specimen}>
            <p className={styles.specLabel}>Display, athlete. Anybody, expanded italic, 125 wide, 800.</p>
            <p className={styles.athleteDisplay}>45 min easy run</p>
            <p className={styles.athleteDisplay} data-numeric>
              0123456789
            </p>
          </article>
          <article className={styles.specimen}>
            <p className={styles.specLabel}>Display, coach. Anybody, condensed, 75 wide, 600.</p>
            <p className={styles.coachDisplay}>Weekly load by athlete</p>
            <p className={styles.coachDisplay} data-numeric>
              0123456789
            </p>
          </article>
          <article className={styles.specimen}>
            <p className={styles.specLabel}>Text. Atkinson Hyperlegible Next.</p>
            <p className={styles.text}>
              Keep it easy enough to talk the whole way. Il1 O0 rn m: similar letters stay distinct, so a number reads at
              a glance mid-session.
            </p>
          </article>
          <article className={styles.specimen}>
            <p className={styles.specLabel}>Numbers. Atkinson Hyperlegible Mono, tabular figures.</p>
            <table className={styles.mono}>
              <caption className={styles.srOnly}>Sample splits in tabular figures</caption>
              <tbody>
                <tr>
                  <th scope="row">Fitness</th>
                  <td>54</td>
                  <td>1:05:42</td>
                </tr>
                <tr>
                  <th scope="row">Fatigue</th>
                  <td>71</td>
                  <td>0:48:10</td>
                </tr>
                <tr>
                  <th scope="row">Form</th>
                  <td>-17</td>
                  <td>11:11:11</td>
                </tr>
              </tbody>
            </table>
          </article>
        </div>
      </Section>

      <Section id="rules" title="Using the logo" lede="A few rules keep it recognisable.">
        <ul className={styles.rules}>
          {RULES.map((r) => (
            <li key={r.title} className={styles.rule}>
              <h3>{r.title}</h3>
              <p>{r.body}</p>
            </li>
          ))}
        </ul>
        <div className={styles.misuse}>
          <div className={`${styles.ground} ${styles.groundPaper}`}>
            {SVG_URLS['misuse.svg'] ? (
              <img
                className={styles.misuseArt}
                src={resolveHref(SVG_URLS['misuse.svg'])}
                alt="Six ways not to use the logo: stretched, colours swapped, lanes drawn as outlines, slanted, set on track red, and the name retyped in a font"
              />
            ) : null}
          </div>
          <div>
            <h3>Please don&rsquo;t</h3>
            <ul className={styles.dont}>
              {MISUSE.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          </div>
        </div>
      </Section>

      <Section id="voice" title="The tagline" lede="One line. It says in words what the logo shows.">
        <figure className={styles.taglineCard}>
          <blockquote className={styles.taglineText}>{TAGLINE.line}</blockquote>
          <figcaption>{TAGLINE.meaning}</figcaption>
        </figure>
        <ul className={styles.rules}>
          {TAGLINE_RULES.map((r) => (
            <li key={r.title} className={styles.rule}>
              <h3>{r.title}</h3>
              <p>{r.body}</p>
            </li>
          ))}
        </ul>
      </Section>
    </div>
  )
}
