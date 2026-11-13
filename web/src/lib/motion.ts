import type { Transition, Variants } from 'motion/react';

/** Shared motion language: soft and quick, 140 to 280 ms, one ease everywhere. EASE_OUT matches --ease in styles.css. */
export const EASE = [0.4, 0, 0.2, 1] as const;
export const EASE_OUT = [0.22, 1, 0.36, 1] as const;

export const DUR = {
  fast: 0.14,
  base: 0.2,
  slow: 0.28,
  count: 0.8,
} as const;

/** A short, firm spring for indicators that slide (the active nav row, the active view tab). */
export const SPRING: Transition = { type: 'spring', stiffness: 460, damping: 38, mass: 0.8 };
/** Toasts and other small floating things. */
export const SPRING_SOFT: Transition = { type: 'spring', stiffness: 380, damping: 34, mass: 0.9 };

/** Only the first few rows stagger; the rest appear at once so long lists stay fast. */
export const STAGGER_CAP = 12;
export const STAGGER_STEP = 0.03;
/** Layout animation is measured on every render, so only the top of a long list gets it. */
export const LAYOUT_CAP = 24;

export const staggerDelay = (index: number) => (index < STAGGER_CAP ? index * STAGGER_STEP : 0);

/** A row fades in with a short rise. `custom` is the row index. */
export const riseItem: Variants = {
  hidden: { opacity: 0, y: 8 },
  shown: (index: number = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: DUR.slow, ease: EASE_OUT, delay: staggerDelay(index) },
  }),
  gone: { opacity: 0, transition: { duration: DUR.fast, ease: EASE } },
};

/** A whole page: incoming fades up a few pixels, outgoing fades quickly. */
export const pageVariants: Variants = {
  hidden: { opacity: 0, y: 8 },
  shown: { opacity: 1, y: 0, transition: { duration: DUR.slow, ease: EASE_OUT } },
  gone: { opacity: 0, transition: { duration: DUR.fast, ease: EASE } },
};

/** Dialog backdrop and panel: a gentle fade and scale. */
export const backdropVariants: Variants = {
  hidden: { opacity: 0 },
  shown: { opacity: 1, transition: { duration: DUR.base, ease: EASE } },
  gone: { opacity: 0, transition: { duration: DUR.fast, ease: EASE } },
};

export const panelVariants: Variants = {
  hidden: { opacity: 0, scale: 0.98, y: 4 },
  shown: { opacity: 1, scale: 1, y: 0, transition: { duration: DUR.slow, ease: EASE_OUT } },
  gone: { opacity: 0, scale: 0.98, transition: { duration: DUR.fast, ease: EASE } },
};

/** Wizard steps slide a little by direction: 1 forward, -1 back. */
export const stepVariants: Variants = {
  enter: (dir: number) => ({ opacity: 0, x: dir * 12 }),
  center: { opacity: 1, x: 0, transition: { duration: DUR.slow, ease: EASE_OUT } },
  exit: (dir: number) => ({ opacity: 0, x: dir * -8, transition: { duration: DUR.fast, ease: EASE } }),
};

/** Small text that changes in place (status words, counts): a plain crossfade. */
export const swapVariants: Variants = {
  hidden: { opacity: 0 },
  shown: { opacity: 1, transition: { duration: DUR.base, ease: EASE } },
  gone: { opacity: 0, transition: { duration: DUR.fast, ease: EASE } },
};

/** The selection dock rises a little from the bottom edge. */
export const dockVariants: Variants = {
  hidden: { opacity: 0, y: 12 },
  shown: { opacity: 1, y: 0, transition: { duration: DUR.slow, ease: EASE_OUT } },
  gone: { opacity: 0, y: 8, transition: { duration: DUR.fast, ease: EASE } },
};

/** Floating menus drop in from their anchor. */
export const menuVariants: Variants = {
  hidden: { opacity: 0, scale: 0.98, y: -2 },
  shown: { opacity: 1, scale: 1, y: 0, transition: { duration: DUR.base, ease: EASE_OUT } },
  gone: { opacity: 0, transition: { duration: DUR.fast, ease: EASE } },
};
