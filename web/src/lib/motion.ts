import type { Transition, Variants } from 'motion/react';

/** Shared motion language: quick, springy, never cartoonish. Matches --ease in styles.css. */
export const EASE = [0.2, 0.7, 0.3, 1] as const;
export const EASE_OUT = [0.16, 1, 0.3, 1] as const;

export const DUR = {
  fast: 0.15,
  base: 0.26,
  slow: 0.45,
  count: 0.8,
} as const;

/** Snappy spring for things that move (indicators, toasts, layout). */
export const SPRING: Transition = { type: 'spring', stiffness: 520, damping: 40, mass: 0.9 };
/** A touch softer, for panels and dialogs. */
export const SPRING_SOFT: Transition = { type: 'spring', stiffness: 380, damping: 34, mass: 0.9 };
/** The selection dock: a heavier glide up from the bottom edge. */
export const SPRING_DOCK: Transition = { type: 'spring', stiffness: 300, damping: 30, mass: 1 };

/** Only the first few items stagger; the rest appear at once so long lists stay fast. */
export const STAGGER_CAP = 12;
export const STAGGER_STEP = 0.035;
/** Layout animation is measured on every render, so only the top of a long list gets it. */
export const LAYOUT_CAP = 24;

export const staggerDelay = (index: number) => (index < STAGGER_CAP ? index * STAGGER_STEP : 0);

/** Rise out of the dark: fade, a short lift and blur to sharp. `custom` is the item index. */
export const riseItem: Variants = {
  hidden: { opacity: 0, y: 14, filter: 'blur(6px)' },
  shown: (index: number = 0) => ({
    opacity: 1,
    y: 0,
    filter: 'blur(0px)',
    transition: { duration: DUR.slow, ease: EASE_OUT, delay: staggerDelay(index) },
    transitionEnd: { filter: 'none' },
  }),
  gone: { opacity: 0, scale: 0.97, filter: 'blur(3px)', transition: { duration: DUR.fast, ease: EASE } },
};

/** A whole page: incoming rises in, outgoing fades quickly. */
export const pageVariants: Variants = {
  hidden: { opacity: 0, y: 10, filter: 'blur(6px)' },
  shown: {
    opacity: 1,
    y: 0,
    filter: 'blur(0px)',
    transition: { duration: DUR.slow, ease: EASE_OUT },
    // A leftover filter would make this wrapper the containing block for fixed children.
    transitionEnd: { filter: 'none' },
  },
  gone: { opacity: 0, y: -6, filter: 'blur(4px)', transition: { duration: DUR.fast, ease: EASE } },
};

/** Dialog backdrop and panel. */
export const backdropVariants: Variants = {
  hidden: { opacity: 0 },
  shown: { opacity: 1, transition: { duration: DUR.base, ease: EASE } },
  gone: { opacity: 0, transition: { duration: DUR.fast, ease: EASE, delay: 0.04 } },
};

export const panelVariants: Variants = {
  hidden: { opacity: 0, y: 18, scale: 0.97 },
  shown: { opacity: 1, y: 0, scale: 1, transition: SPRING_SOFT },
  gone: { opacity: 0, y: 10, scale: 0.98, transition: { duration: DUR.fast, ease: EASE } },
};

/** Wizard steps slide by direction: 1 forward, -1 back. */
export const stepVariants: Variants = {
  enter: (dir: number) => ({ opacity: 0, x: dir * 28 }),
  center: { opacity: 1, x: 0, transition: { duration: DUR.base, ease: EASE } },
  exit: (dir: number) => ({ opacity: 0, x: dir * -20, transition: { duration: DUR.fast, ease: EASE } }),
};

/** Small text that changes in place (status words, counts). */
export const swapVariants: Variants = {
  hidden: { opacity: 0, y: 6, filter: 'blur(3px)' },
  shown: { opacity: 1, y: 0, filter: 'blur(0px)', transition: { duration: DUR.base, ease: EASE } },
  gone: { opacity: 0, y: -6, filter: 'blur(3px)', transition: { duration: DUR.fast, ease: EASE } },
};

/** The selection dock rises from the bottom edge and sinks back. */
export const dockVariants: Variants = {
  hidden: { opacity: 0, y: 56, scale: 0.96 },
  shown: { opacity: 1, y: 0, scale: 1, transition: SPRING_DOCK },
  gone: { opacity: 0, y: 40, scale: 0.97, transition: { duration: DUR.base, ease: EASE } },
};

/** Hover lift for cards that are motion elements (CSS transforms would be overridden by inline styles). */
export const cardHover = { y: -2, transition: { duration: DUR.fast, ease: EASE } };
