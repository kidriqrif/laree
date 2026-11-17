import { describe, expect, it } from 'vitest'
import { keepOriginal } from './keepOriginal.ts'

const file = new File(['x'], 'run.gpx')

describe('keepOriginal', () => {
  it('passes on what the keeper says', async () => {
    expect(await keepOriginal(async () => ({ keepActivityFile: async () => true }), 'a', 'b', file)).toBe(true)
    expect(await keepOriginal(async () => ({ keepActivityFile: async () => false }), 'a', 'b', file)).toBe(false)
  })

  it('is false when the code that keeps files cannot be loaded', async () => {
    // Offline with the chunk not cached yet, the dynamic import rejects.
    expect(await keepOriginal(() => Promise.reject(new TypeError('Failed to fetch dynamically imported module')), 'a', 'b', file)).toBe(false)
  })

  it('is false when keeping the file throws', async () => {
    const broken = async () => ({
      keepActivityFile: async (): Promise<boolean> => {
        throw new Error('storage blocked')
      },
    })
    expect(await keepOriginal(broken, 'a', 'b', file)).toBe(false)
  })
})
