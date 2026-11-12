import { useEffect, useState } from 'react';
import { PROOFS_BUCKET, supabase } from '../lib/supabase';

const cache = new Map<string, { url: string; expires: number }>();

/** A one-hour signed link to a screenshot in the private proofs bucket. `version` busts the cache on re-apply. */
export function useSignedUrl(path: string, version: string): { url: string | null; failed: boolean } {
  const key = `${path}@${version}`;
  const [state, setState] = useState<{ key: string; url: string | null; failed: boolean }>(() => {
    const hit = cache.get(key);
    return { key, url: hit && hit.expires > Date.now() ? hit.url : null, failed: false };
  });

  useEffect(() => {
    if (!path) return;
    const hit = cache.get(key);
    if (hit && hit.expires > Date.now()) {
      setState({ key, url: hit.url, failed: false });
      return;
    }
    let alive = true;
    supabase.storage
      .from(PROOFS_BUCKET)
      .createSignedUrl(path, 3600)
      .then(({ data, error }) => {
        if (!alive) return;
        if (error || !data?.signedUrl) {
          setState({ key, url: null, failed: true });
          return;
        }
        cache.set(key, { url: data.signedUrl, expires: Date.now() + 55 * 60 * 1000 });
        setState({ key, url: data.signedUrl, failed: false });
      });
    return () => {
      alive = false;
    };
  }, [key, path]);

  if (!path) return { url: null, failed: false };
  return state.key === key ? { url: state.url, failed: state.failed } : { url: null, failed: false };
}
