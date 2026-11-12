import { useLayoutEffect, useRef, useState } from 'react';

/** True when a line-clamped element hides text, so "Show more" only appears when it would show more. */
export function useOverflow<T extends HTMLElement>(...deps: unknown[]) {
  const ref = useRef<T>(null);
  const [overflow, setOverflow] = useState(false);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => setOverflow(el.scrollHeight > el.clientHeight + 1);
    check();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(check);
    observer.observe(el);
    return () => observer.disconnect();
    // The caller passes whatever changes the text or the clamp.
  }, deps);

  return [ref, overflow] as const;
}
