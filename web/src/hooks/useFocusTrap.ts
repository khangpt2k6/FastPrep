import { useEffect, useRef, type RefObject } from 'react';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Keeps Tab inside `ref` while active, calls `onEscape` on Escape, and gives focus back
 * to whatever had it before the dialog opened.
 */
export function useFocusTrap(ref: RefObject<HTMLElement>, active: boolean, onEscape: () => void) {
  const escape = useRef(onEscape);
  escape.current = onEscape;

  useEffect(() => {
    if (!active) return;
    const root = ref.current;
    if (!root) return;
    const before = document.activeElement as HTMLElement | null;

    const first = root.querySelector<HTMLElement>('[data-autofocus]') ?? root.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? root).focus({ preventScroll: true });

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        escape.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const items = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
      );
      if (items.length === 0) {
        event.preventDefault();
        return;
      }
      const head = items[0];
      const tail = items[items.length - 1];
      const current = document.activeElement;
      if (event.shiftKey && (current === head || !root.contains(current))) {
        event.preventDefault();
        tail.focus();
      } else if (!event.shiftKey && (current === tail || !root.contains(current))) {
        event.preventDefault();
        head.focus();
      }
    };

    root.addEventListener('keydown', onKey);
    return () => {
      root.removeEventListener('keydown', onKey);
      if (before && document.contains(before)) before.focus({ preventScroll: true });
    };
  }, [active, ref]);
}
