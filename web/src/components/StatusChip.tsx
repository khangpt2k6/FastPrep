import type { JobRow } from '../lib/types';
import { statusHint, statusInfo } from '../lib/format';
import { IconCheck } from './Icons';
import { Burst, Swap, useJustSettled } from './motion';

const FINISHED = ['submitted', 'unconfirmed', 'blocked', 'refused', 'failed'];
const SENT = ['submitted', 'unconfirmed'];

export function StatusChip({ job }: { job: Pick<JobRow, 'status' | 'dry_run'> & Partial<Pick<JobRow, 'reason'>> }) {
  const { label, tone } = statusInfo(job);
  // The agent just finished this one: the chip lands, and a real send gets the burst.
  const settled = useJustSettled(job.status, 'applying', FINISHED);
  const sent = SENT.includes(job.status);
  return (
    <span className={`chip chip--${tone} ${settled ? 'is-landing' : ''}`} title={statusHint(tone)}>
      {tone === 'sent' || tone === 'unconfirmed' ? (
        <IconCheck size={12} className="chip__check" />
      ) : (
        <span className="chip__dot" aria-hidden="true" />
      )}
      <Swap id={label}>{label}</Swap>
      {settled && sent ? <Burst tone="mint" /> : null}
    </span>
  );
}
