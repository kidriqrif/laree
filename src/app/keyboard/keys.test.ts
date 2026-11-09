import { afterEach, describe, expect, it } from 'vitest'
import { isDialogOpen } from './keys.ts'

afterEach(() => {
  document.body.innerHTML = ''
})

describe('isDialogOpen', () => {
  it('ignores a toast alertdialog inside a region', () => {
    document.body.innerHTML = '<div role="region"><div role="alertdialog"></div></div>'
    expect(isDialogOpen(document)).toBe(false)
  })
  it('counts a real dialog', () => {
    document.body.innerHTML = '<div role="dialog" aria-modal="true"></div>'
    expect(isDialogOpen(document)).toBe(true)
  })
})
