/**
 * Shared framer-motion variants.
 *
 * One source of truth for the app's motion language so a table, a card grid and
 * a page transition all ease and stagger the same way. Durations are short and
 * the easing is a soft "out" curve -- motion should feel responsive, not showy.
 */

// A custom cubic-bezier: quick start, gentle settle. Used everywhere.
const EASE = [0.22, 1, 0.36, 1];

/** Parent of a staggered list (table body, card grid). */
export const listContainer = {
  hidden: {},
  show: { transition: { staggerChildren: 0.04, delayChildren: 0.02 } },
};

/** A single staggered child (table row, card). */
export const listItem = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { duration: 0.28, ease: EASE } },
};

/** Route-level page transition, driven by AnimatePresence in the Layout. */
export const pageVariants = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.32, ease: EASE } },
  exit: { opacity: 0, y: -8, transition: { duration: 0.18, ease: 'easeIn' } },
};
