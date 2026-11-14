import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'motion/react';

/** Keys typed in this page load: each types once, a later visit shows the text whole. */
const typedThisLoad = new Set<string>();

const START = 280;
const GAP = 360;

export interface Typing {
  /** The parts as far as they are typed (whole once done). */
  shown: string[];
  /** The part that holds the caret while typing; the last part once done. */
  caret: number;
  /** 'typing' while it runs, 'done' right after it finished here, 'still' when it never typed (reduced motion, typed before). */
  state: 'typing' | 'done' | 'still';
}

/**
 * Types the parts out one after the other, once per page load under the key. A part that is not ready yet (its numbers
 * still loading) waits with the caret on it. The text is read live at each keystroke, so a number that changes mid-way
 * or afterwards swaps in place and nothing types twice. Reduced motion, or a second visit, shows everything at once.
 */
export function useTypewriter(key: string, parts: string[], ready: boolean[] = [], pace: number[] = [44, 22]): Typing {
  const reduce = useReducedMotion();
  const [already] = useState(() => typedThisLoad.has(key));
  const still = Boolean(reduce) || already;
  const [count, setCount] = useState<number[]>([]);
  const [done, setDone] = useState(false);
  const live = useRef({ parts, ready });
  live.current = { parts, ready };

  useEffect(() => {
    if (still) return;
    const at: number[] = [];
    let i = 0;
    let timer = 0;
    const step = () => {
      const { parts: text, ready: ok } = live.current;
      if (i >= text.length) {
        typedThisLoad.add(key);
        setDone(true);
        return;
      }
      if (ok[i] === false) {
        timer = window.setTimeout(step, 140);
        return;
      }
      at[i] = (at[i] ?? 0) + 1;
      setCount([...at]);
      if (at[i] >= text[i].length) {
        i += 1;
        timer = window.setTimeout(step, i < text.length ? GAP : 0);
      } else {
        timer = window.setTimeout(step, pace[Math.min(i, pace.length - 1)]);
      }
    };
    timer = window.setTimeout(step, START);
    return () => window.clearTimeout(timer);
    // The pace and the parts are read live; the run starts once per mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [still, key]);

  if (still || done) return { shown: parts, caret: parts.length - 1, state: still ? 'still' : 'done' };
  const shown = parts.map((p, k) => p.slice(0, count[k] ?? 0));
  const open = parts.findIndex((p, k) => (count[k] ?? 0) < p.length || (k === parts.length - 1 && (count[k] ?? 0) === 0));
  return { shown, caret: open === -1 ? parts.length - 1 : open, state: 'typing' };
}
