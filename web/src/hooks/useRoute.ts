import { useCallback, useEffect, useState } from 'react';

export const PAGES = ['jobs', 'applications', 'inbox', 'agent', 'profile', 'preferences', 'memory', 'letters', 'setup', 'companies', 'rules'] as const;
export type Page = (typeof PAGES)[number];

export interface Route {
  page: Page;
  params: URLSearchParams;
}

/** Reads "#/memory?job=123". A real query string (?job=123) is honored too. */
function parse(): Route {
  const hash = window.location.hash.replace(/^#\/?/, '');
  const [path, query = ''] = hash.split('?');
  const page = (PAGES as readonly string[]).includes(path) ? (path as Page) : 'jobs';
  const params = new URLSearchParams(query);
  const outer = new URLSearchParams(window.location.search);
  outer.forEach((value, key) => {
    if (!params.has(key)) params.set(key, value);
  });
  return { page, params };
}

/** A tiny hash router: the page survives a refresh and the back button works. */
export function useRoute() {
  const [route, setRoute] = useState<Route>(parse);

  useEffect(() => {
    const onChange = () => setRoute(parse());
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);

  const navigate = useCallback((page: Page, params?: Record<string, string>) => {
    const query = params ? new URLSearchParams(params).toString() : '';
    // A real ?job= in the address bar would otherwise stick to every page.
    if (window.location.search) {
      window.history.replaceState(null, '', window.location.pathname + window.location.hash);
    }
    const next = `#/${page}${query ? `?${query}` : ''}`;
    if (window.location.hash === next) setRoute(parse());
    else window.location.hash = next;
    window.scrollTo({ top: 0 });
  }, []);

  /**
   * Changes the current page's query in place, for filters kept in the address ("#/companies?tech=Go").
   * No history entry and no scroll: a filter is not a new page.
   */
  const setParams = useCallback((patch: Record<string, string | null>) => {
    const { page, params } = parse();
    for (const [key, value] of Object.entries(patch)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    const query = params.toString();
    window.history.replaceState(null, '', `${window.location.pathname}#/${page}${query ? `?${query}` : ''}`);
    setRoute(parse());
  }, []);

  return { ...route, navigate, setParams };
}
