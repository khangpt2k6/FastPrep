import type { ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { swapVariants } from '../../lib/motion';
import { IconLogout, Logo } from '../Icons';

interface PageHeaderProps {
  title: string;
  subtitle: string;
  right: ReactNode;
  /** Shown on phones only, where the sidebar footer is gone. */
  notify: ReactNode;
  onSignOut: () => void;
}

export function PageHeader({ title, subtitle, right, notify, onSignOut }: PageHeaderProps) {
  return (
    <header className="pagehead">
      <span className="pagehead__mark" aria-hidden="true">
        <Logo size={32} />
      </span>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.h1 key={title} className="pagehead__title" variants={swapVariants} initial="hidden" animate="shown" exit="gone">
          {title}
        </motion.h1>
      </AnimatePresence>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.p
          key={title}
          className="pagehead__sub"
          variants={swapVariants}
          initial="hidden"
          animate="shown"
          exit="gone"
          transition={{ delay: 0.05 }}
        >
          {subtitle}
        </motion.p>
      </AnimatePresence>
      <div className="pagehead__right">{right}</div>
      <div className="pagehead__phone">
        {notify}
        <button type="button" className="icon-btn" onClick={onSignOut} aria-label="Sign out">
          <IconLogout size={19} />
        </button>
      </div>
    </header>
  );
}
