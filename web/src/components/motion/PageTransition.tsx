import type { ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { pageVariants } from '../../lib/motion';

/** Outgoing page fades, incoming page rises in. Keyed by the route. */
export function PageTransition({ pageKey, children }: { pageKey: string; children: ReactNode }) {
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div key={pageKey} className="pagefx" variants={pageVariants} initial="hidden" animate="shown" exit="gone">
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
