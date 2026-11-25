import '@testing-library/jest-dom/vitest'
import { cleanup, configure } from '@testing-library/react'
import { afterEach } from 'vitest'

// findBy*/waitFor give up after 1 s by default; a busy machine (coverage, CI) can need longer to render.
configure({ asyncUtilTimeout: 3000 })

afterEach(() => {
  cleanup()
  window.localStorage.clear()
})

// jsdom has no matchMedia; default to a desktop-sized screen (tests mock useIsMobile for mobile).
if (!window.matchMedia) {
  window.matchMedia = (query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() {
      return false
    },
  })
}
