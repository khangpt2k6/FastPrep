import { AnimatePresence, motion } from 'motion/react';

/** A thin ember bar sliding along the top edge while the agent works. Purely decorative: the state is said elsewhere. */
export function TopProgress({ active }: { active: boolean }) {
  return (
    <AnimatePresence>
      {active ? (
        <motion.div
          key="topprogress"
          className="topprogress"
          aria-hidden="true"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, transition: { duration: 0.3 } }}
          exit={{ opacity: 0, transition: { duration: 0.5 } }}
        >
          <span className="topprogress__bar" />
          <span className="topprogress__bar topprogress__bar--late" />
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
