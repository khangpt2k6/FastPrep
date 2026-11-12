import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { toLoadError } from '../lib/errors';
import type { LiveStatus, LoadError } from '../lib/types';

interface Options<T> {
  table: string;
  userId: string;
  /** The initial (and fallback) fetch. */
  load: () => PromiseLike<{ data: T[] | null; error: unknown }>;
  keyOf: (row: Partial<T>) => string | undefined;
  /** A slow safety poll in case the realtime socket drops mid-demo. */
  pollMs?: number;
}

export interface LiveTable<T> {
  rows: T[];
  loading: boolean;
  error: LoadError | null;
  live: LiveStatus;
  reload: () => void;
}

/** Fetches a table once, then keeps it current with postgres_changes for this user's rows. */
export function useLiveTable<T extends object>({ table, userId, load, keyOf, pollMs = 20_000 }: Options<T>): LiveTable<T> {
  const [map, setMap] = useState<Map<string, T>>(() => new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<LoadError | null>(null);
  const [live, setLive] = useState<LiveStatus>('connecting');

  // Kept in refs so a new closure from the caller never resubscribes the channel.
  const loadRef = useRef(load);
  const keyRef = useRef(keyOf);
  loadRef.current = load;
  keyRef.current = keyOf;

  // Only the newest fetch may land, so a slow old response never overwrites fresher rows.
  const seq = useRef(0);

  const reload = useCallback(() => {
    const mine = ++seq.current;
    const stale = () => mine !== seq.current;
    Promise.resolve(loadRef.current())
      .then(({ data, error: err }) => {
        if (stale()) return;
        if (err) {
          setError(toLoadError(err));
        } else {
          const next = new Map<string, T>();
          for (const row of data ?? []) {
            const key = keyRef.current(row);
            if (key !== undefined) next.set(key, row);
          }
          setMap(next);
          setError(null);
        }
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (stale()) return;
        setError(toLoadError(err));
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    reload();

    const onChange = (payload: RealtimePostgresChangesPayload<T>) => {
      setMap((prev) => {
        const next = new Map(prev);
        if (payload.eventType === 'DELETE') {
          const key = keyRef.current(payload.old);
          if (key !== undefined) next.delete(key);
        } else {
          const row = payload.new as T;
          const key = keyRef.current(row);
          if (key !== undefined) next.set(key, { ...(prev.get(key) ?? {}), ...row });
        }
        return next;
      });
    };

    const channel = supabase
      .channel(`${table}:${userId}`)
      .on<T>('postgres_changes', { event: '*', schema: 'public', table, filter: `user_id=eq.${userId}` }, onChange)
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          setLive('live');
          reload(); // catch anything written between the first fetch and the subscription
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          setLive('down');
        }
      });

    const poll = window.setInterval(reload, pollMs);
    const onVisible = () => document.visibilityState === 'visible' && reload();
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      window.clearInterval(poll);
      document.removeEventListener('visibilitychange', onVisible);
      supabase.removeChannel(channel);
    };
  }, [table, userId, pollMs, reload]);

  const rows = useMemo(() => Array.from(map.values()), [map]);
  return { rows, loading, error, live, reload };
}
