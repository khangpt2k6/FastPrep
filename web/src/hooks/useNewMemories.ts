import { useEffect, useRef } from 'react';
import type { MemoryRow } from '../lib/types';

/** Calls `onLearned` with answers the agent learned while the page is open (never for the first load). */
export function useNewMemories(rows: MemoryRow[], loaded: boolean, onLearned: (rows: MemoryRow[]) => void) {
  const known = useRef<Set<number> | null>(null);
  const handler = useRef(onLearned);
  handler.current = onLearned;

  useEffect(() => {
    if (!loaded) return;
    const before = known.current;
    const ids = new Set(rows.map((r) => r.id));
    if (before) {
      const fresh = rows.filter((r) => !before.has(r.id) && r.source === 'learned');
      if (fresh.length > 0) handler.current(fresh);
    }
    known.current = ids;
  }, [rows, loaded]);
}
