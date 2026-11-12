import { useLayoutEffect, useRef } from 'react';
import { animate, useReducedMotion } from 'motion/react';
import { DUR, EASE_OUT } from '../../lib/motion';

interface AnimatedNumberProps {
  value: number;
  /** Digits after the point; 0 prints a grouped integer (1,234). */
  decimals?: number;
  /** Where the first count starts. Defaults to 0 so numbers count up on mount. */
  from?: number;
  className?: string;
  duration?: number;
  /**
   * Remembers the last shown value for this key across remounts, so a page visit does not
   * re-count a number that has not changed. Without it the number counts from `from` on mount.
   */
  id?: string;
}

/** Last shown value per id, for the whole app session. */
const lastShown = new Map<string, number>();

function format(value: number, decimals: number): string {
  return decimals > 0 ? value.toFixed(decimals) : Math.round(value).toLocaleString();
}

/** Counts from the last shown value to the new one. Text is written directly, so no re-render per frame. */
export function AnimatedNumber({ value, decimals = 0, from = 0, className, duration = DUR.count, id }: AnimatedNumberProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const start0 = id !== undefined && lastShown.has(id) ? (lastShown.get(id) as number) : from;
  const shown = useRef(start0);
  const reduce = useReducedMotion();

  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    const start = shown.current;
    if (id !== undefined) lastShown.set(id, value);
    if (reduce || start === value || !Number.isFinite(value)) {
      shown.current = value;
      node.textContent = format(value, decimals);
      return;
    }
    node.textContent = format(start, decimals);
    const controls = animate(start, value, {
      duration,
      ease: EASE_OUT,
      onUpdate: (v) => {
        shown.current = v;
        node.textContent = format(v, decimals);
      },
    });
    return () => controls.stop();
  }, [value, decimals, reduce, duration]);

  return (
    <span ref={ref} className={className}>
      {format(start0, decimals)}
    </span>
  );
}
