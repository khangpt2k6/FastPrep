import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { IconInfo } from '../Icons';

/** Whether an element has scrolled into view, once: cards load in as the person scrolls to them. */
export function useReveal<T extends Element>() {
  const ref = useRef<T>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const node = ref.current;
    if (!node || shown) return;
    if (typeof IntersectionObserver === 'undefined') {
      setShown(true);
      return;
    }
    const watch = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setShown(true);
          watch.disconnect();
        }
      },
      { rootMargin: '0px 0px 40px 0px', threshold: 0.01 },
    );
    watch.observe(node);
    return () => watch.disconnect();
  }, [shown]);
  return { ref, shown };
}

/** A company's summary as a small notification that pops up from its button, on hover, focus or click. */
export function SummaryPop({ title, children }: { title: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const root = useRef<HTMLSpanElement>(null);
  const id = useId();

  useEffect(() => {
    if (!pinned) return;
    const away = (event: PointerEvent) => {
      if (root.current && !root.current.contains(event.target as Node)) {
        setPinned(false);
        setOpen(false);
      }
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setPinned(false);
        setOpen(false);
      }
    };
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('pointerdown', away);
      document.removeEventListener('keydown', key);
    };
  }, [pinned]);

  return (
    <span
      ref={root}
      className="sumpop"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => !pinned && setOpen(false)}
    >
      <button
        type="button"
        className={`sumpop__btn ${open ? 'is-open' : ''}`}
        aria-expanded={open}
        aria-controls={id}
        onFocus={() => setOpen(true)}
        onBlur={() => !pinned && setOpen(false)}
        onClick={() => {
          setPinned((was) => !was);
          setOpen(true);
        }}
      >
        <IconInfo size={14} />
        Summary
      </button>
      <AnimatePresence>
        {open ? (
          <motion.span
            id={id}
            role="status"
            className="sumpop__card"
            initial={{ opacity: 0, y: 8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 460, damping: 34 }}
          >
            <span className="sumpop__icon" aria-hidden="true">
              <IconInfo size={15} />
            </span>
            <span className="sumpop__body">
              <span className="sumpop__title">{title}</span>
              <span className="sumpop__text">{children}</span>
            </span>
          </motion.span>
        ) : null}
      </AnimatePresence>
    </span>
  );
}
