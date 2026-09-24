import { useMediaQuery } from 'react-responsive'

/** Desktop screens, matching MUI's "lg" breakpoint (1200px). Below it is tablet or phone. */
export const DESKTOP_MIN_WIDTH = 1200

/**
 * True on desktop-sized screens, where the sidebar stays open beside the page.
 * @returns {boolean}
 */
export default function useIsDesktop() {
  return useMediaQuery({ minWidth: DESKTOP_MIN_WIDTH })
}
