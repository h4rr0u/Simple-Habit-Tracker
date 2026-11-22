import type { Transition } from "framer-motion";

/**
 * Shared motion presets for the app's micro-interactions.
 *
 * Keep animations quick and crisp: transform/opacity only, 150–300 ms for
 * transitions and a spring that settles without a long wobble. Every consumer
 * must gate animation behind `useReducedMotion()` from framer-motion.
 */

/** Snappy spring for card hover/tap feedback (iOS-like, no visible bounce). */
export const CARD_SPRING: Transition = {
  type: "spring",
  stiffness: 300,
  damping: 20,
};

/**
 * Spring for dialog panels (see `src/components/ui/dialog.tsx`).
 *
 * Slightly firmer than `CARD_SPRING`: a modal is a large surface, so a softer
 * spring would visibly wobble before it settles.
 */
export const DIALOG_SPRING: Transition = {
  type: "spring",
  stiffness: 340,
  damping: 30,
  mass: 0.8,
};

/** Short fade + rise used when a route's content enters. */
export const PAGE_TRANSITION: Transition = {
  duration: 0.25,
  ease: "easeOut",
};
