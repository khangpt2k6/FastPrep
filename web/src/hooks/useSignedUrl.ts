import { useEffect, useState } from 'react';
import { PROOFS_BUCKET, supabase } from '../lib/supabase';

const cache = new Map<string, { url: string; expires: number }>();

/** A path that is already a URL (the dev preview's mock screenshots and PDFs) is used as it is. */
export const isDirect = (path: string) => /^(data:|blob:|https?:)/.test(path);

/**
 * A one-hour signed link to a file in the private proofs bucket. `version` busts the cache on re-apply.
 * With `download` the link saves the file under that name instead of opening it.
 */
export function useSignedUrl(path: string, version: string, download?: string): { url: string | null; failed: boolean } {
  const key = `${path}@${version}${download ? `#${download}` : ''}`;
  const [state, setState] = useState<{ key: string; url: string | null; failed: boolean }>(() => {
    const hit = cache.get(key);
    return { key, url: hit && hit.expires > Date.now() ? hit.url : null, failed: false };
  });

  useEffect(() => {
    if (!path || isDirect(path)) return;
    const hit = cache.get(key);
    if (hit && hit.expires > Date.now()) {
      setState({ key, url: hit.url, failed: false });
      return;
    }
    let alive = true;
    supabase.storage
      .from(PROOFS_BUCKET)
      .createSignedUrl(path, 3600, download ? { download } : undefined)
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
  }, [key, path, download]);

  if (!path) return { url: null, failed: false };
  if (isDirect(path)) return { url: path, failed: false };
  return state.key === key ? { url: state.url, failed: state.failed } : { url: null, failed: false };
}
