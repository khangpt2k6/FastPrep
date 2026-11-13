import { useCallback, useState } from 'react';

const KEY = 'agent-automation.saved-jobs';

function read(): Set<string> {
  try {
    const raw = window.localStorage.getItem(KEY);
    const list: unknown = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(list) ? list.filter((v): v is string => typeof v === 'string') : []);
  } catch {
    return new Set();
  }
}

/**
 * Jobs the person starred, kept in this browser only: a bookmark, not data the agent needs.
 * Storage can be refused (a private window); the stars then last for this visit.
 */
export function useSavedJobs() {
  const [saved, setSaved] = useState<Set<string>>(read);
  const toggle = useCallback((id: string) => {
    setSaved((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      try {
        window.localStorage.setItem(KEY, JSON.stringify([...next]));
      } catch {
        // Kept in memory for this visit.
      }
      return next;
    });
  }, []);
  return { saved, toggle };
}
