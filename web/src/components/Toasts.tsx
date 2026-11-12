import { forwardRef, useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, type PanInfo } from 'motion/react';
import { DUR, EASE, SPRING } from '../lib/motion';
import { IconAlert, IconCheck, IconSpark, IconX } from './Icons';

export type ToastTone = 'ok' | 'info' | 'warn' | 'error';

export interface Toast {
  id: number;
  tone: ToastTone;
  title: string;
  detail?: string;
}

export type ToastInput = Omit<Toast, 'id'>;

export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => setToasts((list) => list.filter((t) => t.id !== id)), []);

  const push = useCallback((toast: ToastInput) => {
    const id = nextId.current++;
    setToasts((list) => [...list.slice(-3), { ...toast, id }]);
    return id;
  }, []);

  return { toasts, push, dismiss };
}

const ToastItem = forwardRef<HTMLDivElement, { toast: Toast; onDismiss: (id: number) => void }>(function ToastItem({ toast, onDismiss }, ref) {
  const life = toast.tone === 'error' ? 8000 : 5000;
  useEffect(() => {
    const timer = window.setTimeout(() => onDismiss(toast.id), life);
    return () => window.clearTimeout(timer);
  }, [toast, onDismiss, life]);

  // A flick or a long drag to the right dismisses it.
  function onDragEnd(_: unknown, info: PanInfo) {
    if (info.offset.x > 90 || info.velocity.x > 500) onDismiss(toast.id);
  }

  return (
    <motion.div
      ref={ref}
      layout
      className={`toast toast--${toast.tone}`}
      role={toast.tone === 'error' ? 'alert' : 'status'}
      initial={{ opacity: 0, x: 56, scale: 0.96 }}
      animate={{ opacity: 1, x: 0, scale: 1, transition: SPRING }}
      exit={{ opacity: 0, x: 72, scale: 0.96, transition: { duration: DUR.base, ease: EASE } }}
      transition={{ layout: SPRING }}
      drag="x"
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={{ left: 0.05, right: 0.9 }}
      onDragEnd={onDragEnd}
    >
      <span className="toast__icon">
        {toast.tone === 'ok' ? <IconCheck size={16} /> : toast.tone === 'info' ? <IconSpark size={16} /> : <IconAlert size={16} />}
      </span>
      <div className="toast__text">
        <strong>{toast.title}</strong>
        {toast.detail ? <span>{toast.detail}</span> : null}
      </div>
      <button className="icon-btn toast__close" type="button" onClick={() => onDismiss(toast.id)} aria-label="Dismiss">
        <IconX size={14} />
      </button>
      <span className="toast__timer" style={{ animationDuration: `${life}ms` }} aria-hidden="true" />
    </motion.div>
  );
});

export function Toasts({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }) {
  return (
    <div className="toasts" aria-live="polite">
      <AnimatePresence mode="popLayout" initial={false}>
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onDismiss={onDismiss} />
        ))}
      </AnimatePresence>
    </div>
  );
}
