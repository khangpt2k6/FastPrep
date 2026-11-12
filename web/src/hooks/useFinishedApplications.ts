import { useEffect, useRef } from 'react';
import type { JobRow } from '../lib/types';

export const FINAL_STATUSES = ['submitted', 'unconfirmed', 'refused', 'blocked', 'failed'];

/**
 * Calls `onFinish` when a job goes from "applying" to a final status while the page is open.
 * The first load only records where things stand, so nothing fires for old results.
 */
export function useFinishedApplications(jobs: JobRow[], loaded: boolean, onFinish: (job: JobRow) => void) {
  const seen = useRef<Map<string, string> | null>(null);
  const handler = useRef(onFinish);
  handler.current = onFinish;

  useEffect(() => {
    if (!loaded) return;
    const previous = seen.current;
    const next = new Map<string, string>();
    for (const job of jobs) {
      next.set(job.id, job.status);
      if (previous && previous.get(job.id) === 'applying' && FINAL_STATUSES.includes(job.status)) {
        handler.current(job);
      }
    }
    seen.current = next;
  }, [jobs, loaded]);
}
