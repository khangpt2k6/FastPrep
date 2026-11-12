import { useEffect, useState } from 'react';

/** The current time, re-read every `everyMs`, so "online" and "3s ago" stay true without new data. */
export function useNow(everyMs = 2000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), everyMs);
    return () => window.clearInterval(timer);
  }, [everyMs]);
  return now;
}
