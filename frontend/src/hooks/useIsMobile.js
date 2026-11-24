/**
 * Responsive breakpoint hook backed by react-responsive (spec 12.4).
 */
import { useMediaQuery } from 'react-responsive';

/** Widest viewport, in CSS pixels, treated as mobile (just below MUI's `md` breakpoint). */
export const MOBILE_MAX_WIDTH = 899;

/**
 * Report whether the viewport is phone or small-tablet sized. On mobile the navigation
 * drawer is temporary and tables render as stacked cards.
 * @returns {boolean} True when the viewport is at most 899px wide.
 */
export function useIsMobile() {
  return useMediaQuery({ maxWidth: MOBILE_MAX_WIDTH });
}

export default useIsMobile;
