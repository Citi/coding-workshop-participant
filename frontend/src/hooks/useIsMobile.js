import { useMediaQuery } from 'react-responsive'

/** Phones and small tablets (< 900px, MUI's "md" breakpoint): tables become cards, the menu a drawer. */
export const MOBILE_MAX_WIDTH = 899

export function useIsMobile() {
  return useMediaQuery({ maxWidth: MOBILE_MAX_WIDTH })
}
