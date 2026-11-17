import { describe, expect, it } from 'vitest'
import { deviceLocale, inMalaysia } from './region.ts'

describe('the device region', () => {
  it('is Malaysia only for a Malaysian time zone', () => {
    expect(inMalaysia('Asia/Kuala_Lumpur')).toBe(true)
    expect(inMalaysia('Asia/Kuching')).toBe(true)
    expect(inMalaysia('Asia/Singapore')).toBe(false)
    expect(inMalaysia('Europe/London')).toBe(false)
    expect(inMalaysia('')).toBe(false)
  })

  it('gives a language tag that fits the profile', () => {
    expect(deviceLocale().length).toBeGreaterThan(0)
    expect(deviceLocale().length).toBeLessThanOrEqual(20)
  })
})
