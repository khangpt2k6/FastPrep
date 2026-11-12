import type { ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { swapVariants } from '../../lib/motion';
import { Logo } from '../Icons';

interface PageHeaderProps {
  title: string;
  /** The orb and its one-line ticker. */
  agent: ReactNode;
  /** The dry-run switch. */
  mode: ReactNode;
  /** The alerts bell. */
  alerts: ReactNode;
  /** Dry run is off: applications really go out, so the bar carries an amber edge. */
  live: boolean;
}

/** The top bar: the page title, the agent's orb and live line, the dry-run switch and alerts. */
export function PageHeader({ title, agent, mode, alerts, live }: PageHeaderProps) {
  return (
    <header className={`topbar ${live ? 'is-live' : ''}`}>
      <span className="topbar__mark" aria-hidden="true">
        <Logo size={30} />
      </span>
      <div className="topbar__title">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.h1 key={title} variants={swapVariants} initial="hidden" animate="shown" exit="gone">
            {title}
          </motion.h1>
        </AnimatePresence>
      </div>
      <div className="topbar__agent">{agent}</div>
      <div className="topbar__mode">{mode}</div>
      <div className="topbar__alerts">{alerts}</div>
    </header>
  );
}
