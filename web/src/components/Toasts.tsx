import { useCallback, useEffect, useRef, useState } from 'react';
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

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: (id: number) => void }) {
  useEffect(() => {
    const timer = window.setTimeout(() => onDismiss(toast.id), toast.tone === 'error' ? 8000 : 5000);
    return () => window.clearTimeout(timer);
  }, [toast, onDismiss]);

  return (
    <div className={`toast toast--${toast.tone}`} role={toast.tone === 'error' ? 'alert' : 'status'}>
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
    </div>
  );
}

export function Toasts({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }) {
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onDismiss={onDismiss} />
      ))}
    </div>
  );
}
