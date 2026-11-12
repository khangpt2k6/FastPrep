import type { ReactNode } from 'react';
import { motion } from 'motion/react';
import { riseItem } from '../../lib/motion';

/** Rises in once on mount. `index` staggers it against siblings. */
export function Reveal({ children, index = 0, className }: { children: ReactNode; index?: number; className?: string }) {
  return (
    <motion.div className={className} variants={riseItem} custom={index} initial="hidden" animate="shown">
      {children}
    </motion.div>
  );
}
