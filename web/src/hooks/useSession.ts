import { useCallback, useEffect, useState } from 'react';
import { isAuthApiError, type Session } from '@supabase/supabase-js';
import { signIn as signInWith, supabase } from '../lib/supabase';

export interface OwnerSession {
  /** Null until the person signs in; null again after a sign-out. */
  session: Session | null;
  /** False until the stored session is checked. */
  ready: boolean;
  /** Why the stored session could not be checked (no network, server down); null otherwise. */
  error: string | null;
  /** Said on the sign-in screen when a stored session was refused by the server. */
  note: string | null;
  /** Signs in with what the person typed; answers with why it failed, or null. */
  signIn: (email: string, password: string) => Promise<string | null>;
  retry: () => void;
}

/** The person's session. A stored one is used only when the server still takes it; with none, the page shows the
 *  sign-in screen. The page never signs in by itself. */
export function useSession(): OwnerSession {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    setReady(false);
    setError(null);
    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (!alive) return;
        if (data.session) {
          // A stored session can be one the server no longer accepts (expired for good, password changed, another
          // project): check it once instead of showing a dashboard whose every query fails.
          const { error: refused } = await supabase.auth.getUser();
          if (!alive) return;
          if (!refused) {
            setSession(data.session);
          } else if (isAuthApiError(refused)) {
            await supabase.auth.signOut({ scope: 'local' });
            if (!alive) return;
            setSession(null);
            setNote('Your session ended. Sign in again.');
          } else {
            // Not a refusal: the server could not be reached. The session is kept for the retry.
            setError(refused.message);
          }
        }
        setReady(true);
      } catch (thrown) {
        if (!alive) return;
        setError(thrown instanceof Error ? thrown.message : String(thrown));
        setReady(true);
      }
    })();
    const { data } = supabase.auth.onAuthStateChange((event, next) => {
      // A sign-out here or in another tab clears the dashboard at once; a refreshed token replaces the old one.
      if (event === 'SIGNED_OUT') setSession(null);
      else if (next) {
        setSession(next);
        setNote(null);
      }
    });
    return () => {
      alive = false;
      data.subscription.unsubscribe();
    };
  }, [attempt]);

  const signIn = useCallback((email: string, password: string) => signInWith(email, password), []);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return { session, ready, error, note, signIn, retry };
}
