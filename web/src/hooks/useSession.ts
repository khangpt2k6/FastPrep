import { useCallback, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { signInAsOwner, supabase } from '../lib/supabase';

export interface OwnerSession {
  session: Session | null;
  /** False until the stored session is checked or a fresh sign-in ends. */
  ready: boolean;
  /** Why signing in failed, such as a wrong AGENT_PASSWORD; null otherwise. */
  error: string | null;
  retry: () => void;
}

/** The owner's session: a stored one when the server still takes it, else a fresh sign-in with the agent's login. */
export function useSession(): OwnerSession {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    setReady(false);
    setError(null);
    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (!alive) return;
        // A stored session can be one the server no longer accepts (expired for good, another project, a reset):
        // check it once, and sign in again instead of showing a dashboard whose every query fails.
        if (data.session) {
          const { error: stale } = await supabase.auth.getUser();
          if (!alive) return;
          if (!stale) {
            setSession(data.session);
            setReady(true);
            return;
          }
          await supabase.auth.signOut({ scope: 'local' });
        }
        const failed = await signInAsOwner();
        if (!alive) return;
        if (failed) {
          setError(failed);
          setReady(true);
          return;
        }
        const { data: fresh } = await supabase.auth.getSession();
        if (!alive) return;
        setSession(fresh.session);
        setReady(true);
      } catch (thrown) {
        if (!alive) return;
        setError(thrown instanceof Error ? thrown.message : String(thrown));
        setReady(true);
      }
    })();
    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      if (next) setSession(next);
    });
    return () => {
      alive = false;
      data.subscription.unsubscribe();
    };
  }, [attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return { session, ready, error, retry };
}
