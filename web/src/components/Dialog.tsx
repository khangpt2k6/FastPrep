import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { backdropVariants, panelVariants } from '../lib/motion';
import { useFocusTrap } from '../hooks/useFocusTrap';

interface DialogProps {
  open: boolean;
  onClose: () => void;
  labelledBy: string;
  className?: string;
  children: ReactNode;
}

/** A modal layer: focus stays inside, Escape or a click on the backdrop closes it. */
export function Dialog({ open, onClose, labelledBy, className = '', children }: DialogProps) {
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(ref, open, onClose);

  useEffect(() => {
    if (!open) return;
    document.body.classList.add('has-dialog');
    return () => document.body.classList.remove('has-dialog');
  }, [open]);

  return createPortal(
    <AnimatePresence>
      {open ? (
        <motion.div
          key="overlay"
          className="overlay"
          variants={backdropVariants}
          initial="hidden"
          animate="shown"
          exit="gone"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) onClose();
          }}
        >
          <motion.div
            ref={ref}
            role="dialog"
            aria-modal="true"
            aria-labelledby={labelledBy}
            className={`dialog ${className}`}
            tabIndex={-1}
            variants={panelVariants}
          >
            {children}
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}
