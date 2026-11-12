import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

export function useSession(): { session: Session | null; ready: boolean } {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    supabase.auth
      .getSession()
      .then(async ({ data }) => {
        if (!alive) return;
        // A stored session can be one the server no longer accepts (expired for good, another project, a reset):
        // check it once, and sign out locally instead of showing a dashboard whose every query fails.
        if (data.session) {
          const { error } = await supabase.auth.getUser();
          if (!alive) return;
          if (error && (error.status === 401 || error.status === 403 || /jwt|key|session/i.test(error.message))) {
            await supabase.auth.signOut({ scope: 'local' });
            setSession(null);
            setReady(true);
            return;
          }
        }
        setSession(data.session);
        setReady(true);
      })
      .catch(() => alive && setReady(true));
    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setReady(true);
    });
    return () => {
      alive = false;
      data.subscription.unsubscribe();
    };
  }, []);

  return { session, ready };
}
