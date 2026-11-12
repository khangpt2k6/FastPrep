import type { ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { swapVariants } from '../../lib/motion';

/** Crossfades inline content when `id` changes (a status word, a label). */
export function Swap({ id, children, className }: { id: string; children: ReactNode; className?: string }) {
  return (
    <span className={`swap ${className ?? ''}`}>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span key={id} className="swap__item" variants={swapVariants} initial="hidden" animate="shown" exit="gone">
          {children}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

/** Crossfades between whole states of a panel: skeleton, empty, list, error. */
export function StateFade({ state, children }: { state: string; children: ReactNode }) {
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={state}
        className="statefade"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1, transition: { duration: 0.22 } }}
        exit={{ opacity: 0, transition: { duration: 0.12 } }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
