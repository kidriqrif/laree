import { describe, expect, it } from 'vitest'
import { checkOutput, facts, safeBaseUrl } from './check.ts'

const draft = { headline: 'A steady week', lines: ['You ran 12 km in 60 minutes.', 'Sleep was 7.5 h on 3 of 4 nights.'] }
const answer = (headline: string, ...lines: string[]) => JSON.stringify({ headline, lines })

describe('the check on a provider answer', () => {
  it('accepts a rewording that keeps every number with its unit', () => {
    expect(checkOutput(answer('Steady week', 'A 12 km run took you 60 min.', 'You slept 7.5 hours on 3 of 4 nights.'), draft)).not.toBeNull()
  })

  it('refuses numbers swapped between facts', () => {
    // Both numbers are in the draft, but not with these units.
    expect(checkOutput(answer('Steady week', 'You ran 60 km in 12 minutes.'), draft)).toBeNull()
  })

  it('refuses a number that is not in the draft', () => {
    expect(checkOutput(answer('Steady week', 'You ran 13 km.'), draft)).toBeNull()
  })

  it('refuses a unit put on a plain count, and a count made from a measurement', () => {
    expect(checkOutput(answer('Steady week', 'You slept well for 3 hours.'), draft)).toBeNull()
    expect(checkOutput(answer('Steady week', 'You had 12 good moments.'), draft)).toBeNull()
  })

  it('reads a decimal comma and a time as one number', () => {
    expect(facts('7,5 h at 5:30 pace')).toEqual(['7.5|h', '5:30|'])
    expect(checkOutput(answer('Steady week', 'Sleep was 7,5 h.'), draft)).not.toBeNull()
  })

  it('refuses anything that is not the asked-for shape', () => {
    expect(checkOutput('not json', draft)).toBeNull()
    expect(checkOutput('null', draft)).toBeNull()
    expect(checkOutput(answer('', 'A line.'), draft)).toBeNull()
    expect(checkOutput(JSON.stringify({ headline: 'Fine', lines: [] }), draft)).toBeNull()
    expect(checkOutput('```json\n' + answer('Steady week', 'You ran 12 km.') + '\n```', draft)).not.toBeNull()
  })
})

describe('a provider address', () => {
  it('must be HTTPS', () => {
    expect(safeBaseUrl('https://openrouter.ai/api/v1', false)).toBe(true)
    expect(safeBaseUrl('http://openrouter.ai/api/v1', false)).toBe(false)
    expect(safeBaseUrl('http://openrouter.ai/api/v1', true)).toBe(false)
    expect(safeBaseUrl('ftp://example.com', true)).toBe(false)
    expect(safeBaseUrl('not a url', true)).toBe(false)
  })

  it('may be plain HTTP only for a mock on this machine, and only when switched on', () => {
    expect(safeBaseUrl('http://localhost:8787/v1', false)).toBe(false)
    expect(safeBaseUrl('http://localhost:8787/v1', true)).toBe(true)
    expect(safeBaseUrl('http://127.0.0.1:8787/v1', true)).toBe(true)
    expect(safeBaseUrl('http://localhost.example.com/v1', true)).toBe(false)
  })
})
