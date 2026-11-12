import type { JobRow } from '../lib/types';
import { STATUS_COLOR, statusInfo } from '../lib/format';
import { Swap } from './motion';

/** A job's status as a Notion-style status tag: a dot and a short label, the meaning in the tooltip. */
export function StatusChip({ job }: { job: Pick<JobRow, 'status' | 'dry_run'> & Partial<Pick<JobRow, 'reason'>> }) {
  const { label, tone, hint } = statusInfo(job);
  return (
    <span className={`tag tag--${STATUS_COLOR[tone]} tag--status ${tone === 'applying' ? 'is-live' : ''}`} title={hint}>
      <span className="tag__dot" aria-hidden="true" />
      <Swap id={label}>{label}</Swap>
    </span>
  );
}
