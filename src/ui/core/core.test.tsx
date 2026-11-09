import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { darkTokens, GRAPHIC, lightTokens, TEXT, tokenContrast } from '../../styles/contrast.ts'
import {
  Badge,
  BibCard,
  Button,
  Card,
  Chip,
  CountBadge,
  EmptyState,
  IconButton,
  Skeleton,
  SportChip,
  SportMark,
  StatusChip,
  Tooltip,
} from './index.ts'
import type { ButtonVariant, SportKey, StatusKey } from './index.ts'

afterEach(cleanup)

const VARIANTS: ButtonVariant[] = ['primary', 'secondary', 'quiet', 'danger']
const STATUSES: StatusKey[] = ['on-plan', 'partial', 'over', 'missed', 'unplanned']
const SPORTS: SportKey[] = ['swim', 'bike', 'run', 'strength']

describe('Button', () => {
  it.each(VARIANTS)('renders the %s variant with an accessible name', (variant) => {
    render(<Button variant={variant}>Save plan</Button>)
    const btn = screen.getByRole('button', { name: 'Save plan' })
    expect(btn.getAttribute('data-variant')).toBe(variant)
  })

  it('passes className and data attributes through', () => {
    render(
      <Button className="extra" data-testid="b">
        Go
      </Button>,
    )
    const btn = screen.getByTestId('b')
    expect(btn.className).toContain('extra')
  })

  it('is disabled when isDisabled', () => {
    render(<Button isDisabled>Go</Button>)
    expect((screen.getByRole('button') as HTMLButtonElement).disabled).toBe(true)
  })

  it('marks a pending button and does not fire presses', () => {
    let presses = 0
    render(
      <Button isPending onPress={() => presses++}>
        Saving
      </Button>,
    )
    const btn = screen.getByRole('button')
    expect(btn.getAttribute('data-pending')).not.toBeNull()
    expect(btn.getAttribute('aria-disabled')).toBe('true')
    btn.click()
    expect(presses).toBe(0)
  })
})

describe('IconButton', () => {
  it('is named by aria-label', () => {
    render(
      <IconButton aria-label="Close">
        <svg />
      </IconButton>,
    )
    expect(screen.getByRole('button', { name: 'Close' })).toBeTruthy()
  })

  it('requires an aria-label at the type level', () => {
    // @ts-expect-error aria-label is required
    const el = <IconButton>x</IconButton>
    expect(el).toBeTruthy()
  })
})

describe('Chip', () => {
  it.each(STATUSES)('status chip %s shows a glyph and a label', (status) => {
    const { container } = render(<StatusChip status={status} />)
    const chip = container.querySelector('[data-tone="status"]')!
    expect(chip.querySelector('svg[data-glyph]')).toBeTruthy()
    expect((chip.textContent ?? '').length).toBeGreaterThan(2)
  })

  it('uses the plain-English status words', () => {
    render(
      <>
        {STATUSES.map((s) => (
          <StatusChip key={s} status={s} />
        ))}
      </>,
    )
    for (const word of ['On plan', 'Partial', 'Over', 'Missed', 'Unplanned']) expect(screen.getByText(word)).toBeTruthy()
  })

  it('renders neutral and sport chips', () => {
    const { container } = render(
      <>
        <Chip>Taper</Chip>
        <SportChip sport="swim" />
      </>,
    )
    expect(screen.getByText('Taper')).toBeTruthy()
    expect(container.querySelector('[data-sport="swim"] svg')).toBeTruthy()
    expect(screen.getByText('Swim')).toBeTruthy()
  })
})

describe('Badge', () => {
  it('names an earned badge', () => {
    render(<Badge label="First 10 km" earned />)
    expect(screen.getByText('First 10 km, earned')).toBeTruthy()
  })

  it('names a locked badge and shows the lock glyph', () => {
    const { container } = render(<Badge label="First 10 km" earned={false} />)
    expect(screen.getByText('First 10 km, locked')).toBeTruthy()
    expect(container.querySelector('[data-glyph="lock"]')).toBeTruthy()
  })

  it('count badge reads the count and its meaning', () => {
    render(<CountBadge count={3} label="open flags" />)
    expect(screen.getByText('3 open flags')).toBeTruthy()
  })
})

describe('Card, BibCard', () => {
  it('Card renders as the requested element', () => {
    render(
      <Card as="section" aria-label="Summary" data-x="1">
        body
      </Card>,
    )
    expect(screen.getByRole('region', { name: 'Summary' }).getAttribute('data-x')).toBe('1')
  })

  it('BibCard shows figure, caption, mark and stub with two decorative pin holes', () => {
    const { container } = render(
      <BibCard figure="1:45:00" caption="Long run" mark={<SportMark sport="run" />} stub={<span>Sun 9 Nov</span>} />,
    )
    expect(screen.getByText('1:45:00')).toBeTruthy()
    expect(screen.getByText('Long run')).toBeTruthy()
    expect(screen.getByText('Sun 9 Nov')).toBeTruthy()
    expect(container.querySelectorAll('[aria-hidden="true"]').length).toBeGreaterThanOrEqual(2)
  })
})

describe('SportMark', () => {
  it.each(SPORTS)('%s has a glyph and a name', (sport) => {
    const { container } = render(<SportMark sport={sport} />)
    expect(container.querySelector(`svg[data-glyph="${sport}"]`)).toBeTruthy()
    expect(screen.getByRole('img').getAttribute('aria-label')).toBeTruthy()
  })

  it('shows a text label when asked, so colour is never alone', () => {
    render(<SportMark sport="bike" showLabel />)
    expect(screen.getByText('Bike')).toBeTruthy()
  })
})

describe('Tooltip', () => {
  it('keeps the trigger named by its own label', () => {
    render(
      <Tooltip content="Delete session">
        <IconButton aria-label="Delete">
          <svg />
        </IconButton>
      </Tooltip>,
    )
    expect(screen.getByRole('button', { name: 'Delete' })).toBeTruthy()
  })
})

describe('Skeleton and EmptyState', () => {
  it('skeleton is hidden from assistive tech', () => {
    const { container } = render(<Skeleton width="50%" />)
    expect(container.firstElementChild?.getAttribute('aria-hidden')).toBe('true')
  })

  it('empty state has a title, a sentence and one action', () => {
    render(<EmptyState title="No sessions this week" description="Add a session to get started." action={<Button variant="primary">Add session</Button>} />)
    expect(screen.getByRole('heading', { name: 'No sessions this week' })).toBeTruthy()
    expect(screen.getByText('Add a session to get started.')).toBeTruthy()
    expect(screen.getAllByRole('button')).toHaveLength(1)
  })
})

// Text and graphic pairs these components use (foreground, background, minimum ratio).
const PAIRS: [string, string, number][] = [
  // Button
  ['--color-on-action', '--color-action', TEXT],
  ['--color-on-action', '--color-action-hover', TEXT],
  ['--color-text', '--color-bg', TEXT],
  ['--color-text', '--color-surface', TEXT],
  ['--color-link', '--color-bg', TEXT],
  ['--color-link', '--color-surface', TEXT],
  ['--color-on-danger', '--color-danger', TEXT],
  // Chip, Badge, EmptyState, Card
  ['--color-text-muted', '--color-bg', TEXT],
  ['--color-text-muted', '--color-surface', TEXT],
  ['--color-text-muted', '--color-surface-sunken', TEXT],
  ['--color-on-accent', '--color-accent', TEXT],
  ['--color-control-border', '--color-bg', GRAPHIC],
  // Tooltip: page colour on the text-colour fill
  ['--color-bg', '--color-text', TEXT],
  // Status chip text on every surface it may sit on
  ...STATUSES.flatMap((s): [string, string, number][] =>
    ['--color-bg', '--color-surface', '--color-surface-sunken'].map((bg) => [`--status-${s}-text`, bg, TEXT] as [string, string, number]),
  ),
  // Status glyph marks and their inner strokes
  ['--status-on-plan', '--color-bg', GRAPHIC],
  ['--color-bg', '--status-on-plan', GRAPHIC],
  ['--status-over', '--color-bg', GRAPHIC],
  ['--color-bg', '--status-over', GRAPHIC],
  ['--status-missed', '--color-bg', GRAPHIC],
  ['--status-unplanned', '--color-bg', GRAPHIC],
  ['--color-bg', '--status-unplanned', GRAPHIC],
  ['--color-on-accent', '--status-partial', TEXT],
  ['--status-partial-outline', '--color-bg', GRAPHIC],
  // Sport glyphs on page and card
  ...SPORTS.flatMap((s): [string, string, number][] => [
    [`--sport-${s}`, '--color-bg', GRAPHIC],
    [`--sport-${s}`, '--color-surface', GRAPHIC],
  ]),
  // Focus ring on the surfaces the controls sit on
  ['--color-focus', '--color-bg', GRAPHIC],
  ['--color-focus', '--color-surface', GRAPHIC],
]

describe('WCAG AA contrast of every token pair the core components use', () => {
  for (const [mode, theme] of [['light', lightTokens], ['dark', darkTokens]] as const) {
    describe(`${mode} theme`, () => {
      for (const [fg, bg, min] of PAIRS) {
        it(`${fg} on ${bg} >= ${min}`, () => {
          expect(tokenContrast(theme, fg, bg)).toBeGreaterThanOrEqual(min)
        })
      }
    })
  }
})
