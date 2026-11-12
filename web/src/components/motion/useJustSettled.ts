import { useEffect, useRef, useState } from 'react';

/**
 * True for a moment after `status` moves from `fromStatus` into one of `into`.
 * Never fires on mount, only on a live change.
 */
export function useJustSettled(status: string, fromStatus: string, into: string[], ms = 1600): boolean {
  const prev = useRef(status);
  const [on, setOn] = useState(false);
  useEffect(() => {
    const before = prev.current;
    prev.current = status;
    if (before === fromStatus && status !== fromStatus && into.includes(status)) setOn(true);
    // into is a constant list at every call site.
  }, [status, fromStatus]);
  useEffect(() => {
    if (!on) return;
    const timer = window.setTimeout(() => setOn(false), ms);
    return () => window.clearTimeout(timer);
  }, [on, ms]);
  return on;
}
