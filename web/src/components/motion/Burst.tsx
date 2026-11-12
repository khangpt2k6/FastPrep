import { useEffect, useRef, useState } from 'react';

/**
 * True for a moment after `status` moves from `fromStatus` into one of `into`.
 * Never fires on mount, only on a live change.
 */
export function useJustSettled(status: string, fromStatus: string, into: string[], ms = 1400): boolean {
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

/** A mint ring and eight sparks that fly out once. Pure CSS, decorative. */
export function Burst({ tone = 'mint' }: { tone?: 'mint' | 'amber' }) {
  return (
    <span className={`burst burst--${tone}`} aria-hidden="true">
      <span className="burst__ring" />
      {Array.from({ length: 8 }, (_, i) => (
        <span className="burst__spark" key={i} style={{ ['--a' as string]: `${i * 45}deg` }} />
      ))}
    </span>
  );
}
