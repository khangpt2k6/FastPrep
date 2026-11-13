import { useEffect, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { EASE_OUT } from '../../lib/motion';

/**
 * Text with a "thinking" sweep: a light band moves across the text while `active`.
 * `tone` picks the colors: muted gray text, dark text, white text on a dark button, or light text on granite.
 */
export function Shimmer({ children, active = true, tone = 'muted', className = '' }: {
  children: ReactNode;
  active?: boolean;
  tone?: 'muted' | 'strong' | 'inverse' | 'granite';
  className?: string;
}) {
  return <span className={`shimmer shimmer--${tone} ${active ? 'is-on' : ''} ${className}`}>{children}</span>;
}

/**
 * Lines that take turns during a long wait ("Reading your experience", "Picking places to search"), each one
 * shimmering. The first line can change in place (a count going up) without restarting the rotation.
 */
export function WaitingLines({ lines, every = 2800, tone = 'muted', className = '' }: {
  lines: string[];
  every?: number;
  tone?: 'muted' | 'strong' | 'inverse';
  className?: string;
}) {
  const [index, setIndex] = useState(0);
  const count = lines.length;
  useEffect(() => {
    setIndex(0);
    if (count < 2) return;
    const timer = window.setInterval(() => setIndex((i) => (i + 1) % count), every);
    return () => window.clearInterval(timer);
  }, [count, every]);
  if (count === 0) return null;
  const line = lines[index % count];
  return (
    <span className={`waiting ${className}`}>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={index % count}
          className="waiting__line"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0, transition: { duration: 0.32, ease: EASE_OUT } }}
          exit={{ opacity: 0, y: -8, transition: { duration: 0.2 } }}
        >
          <Shimmer tone={tone}>{line}</Shimmer>
        </motion.span>
      </AnimatePresence>
    </span>
  );
}
