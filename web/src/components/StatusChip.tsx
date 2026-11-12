import type { JobRow } from '../lib/types';
import { statusInfo } from '../lib/format';
import { IconCheck } from './Icons';

export function StatusChip({ job }: { job: Pick<JobRow, 'status' | 'dry_run'> }) {
  const { label, tone } = statusInfo(job);
  return (
    <span className={`chip chip--${tone}`}>
      {tone === 'applying' ? <span className="chip__spin" aria-hidden="true" /> : null}
      {tone === 'sent' ? <IconCheck size={13} /> : null}
      {label}
    </span>
  );
}
