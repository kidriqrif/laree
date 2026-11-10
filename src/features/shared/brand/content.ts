export type Ground = 'paper' | 'paper-2' | 'ink' | 'night' | 'sand'

export interface LogoFile {
  file: string
  title: string
  use: string
  ground: Ground
  /** Rendered height in CSS pixels, so each file is seen at a size it is meant for. */
  height: number
  /** Matching PNG files, if any. */
  png?: string[]
}

export const LOGO_FILES: { heading: string; blurb: string; files: LogoFile[] }[] = [
  {
    heading: 'Wordmark',
    blurb: 'The l is a 400 m track bend with lane lines. The letters are drawn on the same grid, never typed.',
    files: [
      { file: 'laree-wordmark.svg', title: 'Primary', use: 'The default, on paper and other light surfaces.', ground: 'paper', height: 72, png: ['laree-wordmark@1x.png', 'laree-wordmark@2x.png', 'laree-wordmark@4x.png'] },
      { file: 'laree-wordmark-on-paper.svg', title: 'On paper', use: 'When the background is unknown. Clear space is built in.', ground: 'sand', height: 72 },
      { file: 'laree-wordmark-reversed.svg', title: 'Reversed', use: 'On ink, the night theme and dark photographs.', ground: 'ink', height: 72 },
      { file: 'laree-wordmark-mono-ink.svg', title: 'One colour, ink', use: 'One-colour print, foil and engraving.', ground: 'paper-2', height: 72 },
      { file: 'laree-wordmark-mono-paper.svg', title: 'One colour, paper', use: 'White foil or white ink on dark grounds.', ground: 'ink', height: 72 },
      { file: 'laree-wordmark-small.svg', title: 'Small', use: 'Heights under 64 px. Two wider lanes.', ground: 'paper', height: 32 },
      { file: 'laree-wordmark-solid.svg', title: 'Solid', use: 'Embroidery, debossing and rubber stamps.', ground: 'paper-2', height: 48 },
    ],
  },
  {
    heading: 'Mark',
    blurb: 'The l on its own, when the name is already on screen or the space is square.',
    files: [
      { file: 'laree-mark.svg', title: 'Mark', use: 'Four lanes from 128 px, three from 48 px.', ground: 'paper', height: 96, png: ['laree-mark-512.png', 'laree-mark-1024.png'] },
      { file: 'laree-mark-mono.svg', title: 'Mark, one colour', use: 'One-colour work.', ground: 'paper-2', height: 96 },
      { file: 'laree-mark-solid.svg', title: 'Mark, solid', use: 'Stamps and embroidery.', ground: 'sand', height: 96 },
    ],
  },
  {
    heading: 'App icons',
    blurb: 'Three lanes, track red on an ink tile.',
    files: [
      { file: 'laree-app-icon.svg', title: 'App icon', use: 'Home screens and app stores.', ground: 'paper', height: 120, png: ['laree-app-icon-1024.png'] },
      { file: 'laree-app-icon-maskable.svg', title: 'Maskable icon', use: 'Android adaptive icons. The l stays inside the safe circle.', ground: 'paper-2', height: 120 },
      { file: 'laree-icon-monochrome.svg', title: 'Monochrome icon', use: 'Android themed icons. The system supplies the colour.', ground: 'sand', height: 120 },
    ],
  },
  {
    heading: 'Favicons',
    blurb: 'Drawn for whole pixels at 16, 32 and 48 px. Shown at their real size.',
    files: [
      { file: 'favicon-16.svg', title: 'Favicon 16', use: 'Browser tabs.', ground: 'paper', height: 16 },
      { file: 'favicon-32.svg', title: 'Favicon 32', use: 'Bookmarks and high-density tabs.', ground: 'paper', height: 32 },
      { file: 'favicon-48.svg', title: 'Favicon 48', use: 'Site lists and shortcuts.', ground: 'paper', height: 48 },
    ],
  },
  {
    heading: 'Social image',
    blurb: '1200 by 630. Link previews.',
    files: [{ file: 'og-image.svg', title: 'Social image', use: 'Link previews. The tagline sits under the wordmark.', ground: 'night', height: 180 }],
  },
  {
    heading: 'Drawings',
    blurb: 'For reference, not for use.',
    files: [
      { file: 'construction.svg', title: 'Construction', use: 'How the l is built: bend radii, lane pitch and stagger.', ground: 'paper', height: 240 },
      { file: 'misuse.svg', title: 'Misuse', use: 'Six ways not to use the logo.', ground: 'paper', height: 240 },
    ],
  },
]

export interface Swatch {
  name: string
  light: string
  dark: string
  role: string
  pair?: string
}

export const BRAND_COLOURS: { name: string; hex: string; role: string; text: 'ink' | 'paper'; token: string }[] = [
  { name: 'Track', hex: '#E4572E', role: 'The l. Large type, graphics and button fills. Never small text.', text: 'ink', token: '--palette-track' },
  { name: 'Track ink', hex: '#B5391A', role: 'Red text and links on paper.', text: 'paper', token: '--palette-track-ink' },
  { name: 'Sun', hex: '#FFC83D', role: 'Highlights. Always paired with ink.', text: 'ink', token: '--palette-sun' },
  { name: 'Ink', hex: '#1A1714', role: 'Text, the letters, hairlines and the icon tile.', text: 'paper', token: '--palette-ink' },
  { name: 'Paper', hex: '#FBF6EE', role: 'The page.', text: 'ink', token: '--palette-paper' },
  { name: 'Paper 2', hex: '#F3EBDD', role: 'Raised and sunken surfaces.', text: 'ink', token: '--palette-paper-2' },
  { name: 'Sand', hex: '#EADFC8', role: 'Sunken surface and zone 1.', text: 'ink', token: '--palette-sand' },
  { name: 'Night', hex: '#14110E', role: 'Dark page.', text: 'paper', token: '--palette-night' },
  { name: 'Night 2', hex: '#1E1A16', role: 'Dark surface.', text: 'paper', token: '--palette-night-2' },
  { name: 'Night 3', hex: '#29241F', role: 'Dark raised surface.', text: 'paper', token: '--palette-night-3' },
  { name: 'Chalk', hex: '#F2EADC', role: 'Text on the night theme.', text: 'ink', token: '--palette-chalk' },
]

export const SEMANTIC: Swatch[] = [
  { name: 'Page', light: '#FBF6EE', dark: '#14110E', role: 'Background' },
  { name: 'Surface', light: '#F3EBDD', dark: '#1E1A16', role: 'Cards, sheets and rail' },
  { name: 'Sunken', light: '#EADFC8', dark: '#0E0C0A', role: 'Inputs, wells and table headers' },
  { name: 'Text', light: '#1A1714', dark: '#F2EADC', role: 'Body text', pair: 'On page, surface and sunken' },
  { name: 'Muted text', light: '#6B6157', dark: '#A89D8E', role: 'Secondary text', pair: '4.5:1 on page, surface and sunken' },
  { name: 'Link', light: '#B5391A', dark: '#F26B45', role: 'Links and red text', pair: '5.5:1 on paper' },
  { name: 'Action', light: '#E4572E', dark: '#E4572E', role: 'Primary button fill', pair: 'Ink label, 4.9:1' },
  { name: 'Accent', light: '#FFC83D', dark: '#FFC83D', role: 'Highlights and chips', pair: 'Ink label, 11.5:1' },
  { name: 'Control edge', light: '#7D746A', dark: '#8A8174', role: 'Input and checkbox edges', pair: '3:1 on page' },
  { name: 'Danger', light: '#8E2A17', dark: '#FF8A6B', role: 'Destructive text and fill' },
]

export const SPORTS: { name: string; light: string; dark: string; cue: string }[] = [
  { name: 'Swim', light: '#2B6CB0', dark: '#6FA3DC', cue: 'Wave glyph and the word Swim' },
  { name: 'Bike', light: '#3A3632', dark: '#D9D0C3', cue: 'Wheel glyph and the word Bike' },
  { name: 'Run', light: '#E4572E', dark: '#F26B45', cue: 'Foot glyph and the word Run' },
  { name: 'Strength', light: '#857A6C', dark: '#9A8F80', cue: 'Weight glyph and the word Strength' },
]

export const ZONES: { zone: string; light: string; dark: string }[] = [
  { zone: 'Z1', light: '#EADFC8', dark: '#4A4034' },
  { zone: 'Z2', light: '#FFC83D', dark: '#FFC83D' },
  { zone: 'Z3', light: '#EB9100', dark: '#EB9100' },
  { zone: 'Z4', light: '#E4572E', dark: '#E4572E' },
  { zone: 'Z5', light: '#8E2A17', dark: '#B83C24' },
]

export const STATUSES: { name: string; light: string; dark: string; mark: string }[] = [
  { name: 'On plan', light: '#2F7D4F', dark: '#5FBF86', mark: 'Filled disc and check' },
  { name: 'Partial', light: '#FFC83D', dark: '#FFC83D', mark: 'Yellow disc, ink outline, half disc' },
  { name: 'Over', light: '#5B4B8A', dark: '#A99BD6', mark: 'Hatched disc and up arrow' },
  { name: 'Missed', light: '#5C534A', dark: '#C4BAAB', mark: 'Hollow ring' },
  { name: 'Unplanned', light: '#8A8278', dark: '#766D63', mark: 'Grey disc and plus' },
]

export const MISUSE: string[] = [
  'Do not stretch, squash, slant or rotate the logo.',
  'Do not swap the colours. The l is red, and the letters are ink, or paper on a dark ground.',
  'Do not draw the lanes as outlines or the lane lines as strokes. The lane lines are gaps.',
  'Do not set the logo on track red, where the l disappears, or on a photograph that fights the lanes.',
  'Do not retype "laree" in a font, even Anybody.',
  'Do not change the lane count by hand or redraw the bend. Use the supplied cuts.',
  'Do not add gradients, shadows, glows, bevels or motion lines.',
  'Do not put a running figure, a bolt or a tick beside the logo.',
  'Do not use the l or track red to mean wrong, late or missed.',
]

export const RULES: { title: string; body: string }[] = [
  { title: 'The l is always track red', body: 'Or the same single colour as the letters in one-colour work. Never ink beside red letters.' },
  { title: 'Clear space', body: 'Leave 12 units on every side: the band plus one lane line, or a quarter of the logo height. On a 48 px wordmark that is 12 px.' },
  { title: 'Minimum size', body: 'Four-lane wordmark from 64 px tall. Two-lane wordmark down to 24 px. Below that, use the favicons. In print, 35 mm wide for the four-lane wordmark.' },
  { title: 'Red never signals status', body: 'Track red is the brand, not an alarm. Missed, over and errors each have their own colour, shape and word.' },
  { title: 'Colour is never the only signal', body: 'Anything that matters also has a word, a shape or a number.' },
  { title: 'No effects', body: 'No gradients, shadows, glows, bevels or 3D, and no purple in brand artwork.' },
]

/** The tagline, chosen by the product owner in November 2026. */
export const TAGLINE = {
  line: 'Every lane counts.',
  meaning: 'Every athlete matters equally, just as every lane in the logo runs the same distance.',
}

export const TAGLINE_RULES: { title: string; body: string }[] = [
  { title: 'Where it goes', body: 'Under the wordmark on the social image, in store listings and on sign-in, and wherever the logo is explained.' },
  { title: 'How to write it', body: 'Sentence case, with its full stop. In artwork, set it in Anybody at width 125, weight 800, italic.' },
  { title: 'Not these', body: 'Never "Lari lah" or "Jom lari": apps called Lari La and JomRun already exist. "Lap by lap." was the other candidate and is not a tagline.' },
]
