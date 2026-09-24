import { getContrastRatio } from '@mui/material/styles'
import { describe, expect, it } from 'vitest'

import theme, { brand } from './theme'

// WCAG AA for normal-size text.
const AA = 4.5

describe('theme', () => {
  it('uses Citi light blue and white', () => {
    expect(theme.palette.primary.main).toBe(brand.blue)
    expect(theme.palette.background.paper).toBe(brand.white)
  })

  it.each([
    ['white text on the blue header and buttons', brand.white, brand.blue],
    ['blue links on white cards', brand.blue, brand.white],
    ['navy headings on the page background', brand.navy, brand.page],
    ['body text on white', brand.ink, brand.white],
    ['secondary text on the page background', brand.muted, brand.page],
    ['nav labels on white', brand.inkSoft, brand.white],
    ['the current nav item', brand.navy, brand.selected],
  ])('has readable contrast: %s', (_label, text, background) => {
    expect(getContrastRatio(text, background)).toBeGreaterThanOrEqual(AA)
  })

  it('keeps sky blue out of text, because it fails contrast on white', () => {
    expect(getContrastRatio(brand.sky, brand.white)).toBeLessThan(AA)
  })
})
