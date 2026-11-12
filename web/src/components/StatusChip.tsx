import type { JobRow } from '../lib/types';
import { statusInfo } from '../lib/format';
import { IconCheck } from './Icons';
import { Burst, Swap, useJustSettled } from './motion';

const FINISHED = ['submitted', 'unconfirmed', 'blocked', 'refused', 'failed'];

export function StatusChip({ job }: { job: Pick<JobRow, 'status' | 'dry_run'> & Partial<Pick<JobRow, 'reason'>> }) {
  const { label, tone } = statusInfo(job);
  // The memorable moment: the agent just finished this one, so the chip lands with a burst.
  const settled = useJustSettled(job.status, 'applying', FINISHED);
  const good = job.status === 'submitted' || job.status === 'unconfirmed' || (job.status === 'blocked' && job.reason === 'dry_run');
  return (
    <span className={`chip chip--${tone} ${settled ? 'is-landing' : ''}`}>
      {tone === 'applying' ? <span className="chip__spin" aria-hidden="true" /> : null}
      {tone === 'sent' ? <IconCheck size={13} className="chip__check" /> : null}
      <Swap id={label}>{label}</Swap>
      {settled ? <Burst tone={good ? 'mint' : 'amber'} /> : null}
    </span>
  );
}
