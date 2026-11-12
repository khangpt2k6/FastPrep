import { useMemo, useState, type ReactNode } from 'react';
import type { JobRow, LoadError } from '../../lib/types';
import { timeAgo } from '../../lib/format';
import { useOverflow } from '../../hooks/useOverflow';
import { useSignedUrl } from '../../hooks/useSignedUrl';
import { Avatar, EmptyState, PillGroup, SkeletonCards } from '../common';
import { IconAlert, IconImage, IconLink, IconMemory, IconSend } from '../Icons';
import { StatusChip } from '../StatusChip';

type Group = 'all' | 'live' | 'sent' | 'notsent' | 'bad';

function groupOf(job: JobRow): Group {
  if (job.status === 'applying') return 'live';
  if (job.status === 'submitted' || job.status === 'unconfirmed') return 'sent';
  if (job.status === 'blocked') return 'notsent';
  return 'bad';
}

interface ApplicationsPageProps {
  items: JobRow[];
  loading: boolean;
  error: LoadError | null;
  onRetry: () => void;
  now: number;
  onOpenShot: (job: JobRow, url: string) => void;
  onOpenAnswers: (job: JobRow) => void;
  /** How many saved answers each job has, by job id. */
  answerCounts: Map<string, number>;
  strip: ReactNode;
  rail: ReactNode;
}

function Thumb({ job, onOpen }: { job: JobRow; onOpen: (url: string) => void }) {
  const { url, failed } = useSignedUrl(job.screenshot_path, job.updated_at);
  if (!job.screenshot_path) return null;
  if (failed) {
    return (
      <span className="thumb thumb--empty" title="The screenshot could not be loaded">
        <IconImage size={18} />
      </span>
    );
  }
  if (!url) return <span className="thumb skeleton" aria-hidden="true" />;
  return (
    <button type="button" className="thumb" onClick={() => onOpen(url)} aria-label={`View the screenshot for ${job.company}`}>
      <img src={url} alt="" loading="lazy" />
    </button>
  );
}

function Note({ job }: { job: JobRow }) {
  const [open, setOpen] = useState(false);
  const [ref, clamped] = useOverflow<HTMLParagraphElement>(job.note, open, job.status);
  if (job.status === 'applying') {
    return <p className="appcard__note appcard__note--live">The agent is filling this form right now.</p>;
  }
  if (!job.note) return null;
  return (
    <div>
      <p ref={ref} className={`appcard__note ${open ? 'is-open' : ''}`}>
        {job.note}
      </p>
      {open || clamped ? (
        <button type="button" className="link-btn link-btn--sm" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
          {open ? 'Show less' : 'Show more'}
        </button>
      ) : null}
    </div>
  );
}

export function ApplicationsPage({ items, loading, error, onRetry, now, onOpenShot, onOpenAnswers, answerCounts, strip, rail }: ApplicationsPageProps) {
  const [group, setGroup] = useState<Group>('all');

  const counts = useMemo(() => {
    const c: Record<Group, number> = { all: items.length, live: 0, sent: 0, notsent: 0, bad: 0 };
    for (const job of items) c[groupOf(job)] += 1;
    return c;
  }, [items]);

  const shown = group === 'all' ? items : items.filter((j) => groupOf(j) === group);

  let body: ReactNode;
  if (error) {
    body = (
      <EmptyState
        icon={<IconAlert size={22} />}
        title="Could not load applications"
        action={
          <button type="button" className="btn btn--secondary btn--sm" onClick={onRetry}>
            Try again
          </button>
        }
      >
        {error.message}
      </EmptyState>
    );
  } else if (loading) {
    body = <SkeletonCards count={3} />;
  } else if (items.length === 0) {
    body = (
      <EmptyState icon={<IconSend size={22} />} title="No applications yet">
        Tick a few jobs on the Jobs page and press Apply. Each one shows up here while the agent works through it.
      </EmptyState>
    );
  } else if (shown.length === 0) {
    body = <p className="empty-line">Nothing in this group right now.</p>;
  } else {
    body = (
      <ul className="cardlist">
        {shown.map((job) => {
          const answers = answerCounts.get(job.id) ?? 0;
          return (
            <li className={`card appcard ${job.status === 'applying' ? 'is-live' : ''}`} key={job.id}>
              <div className="appcard__top">
                <Avatar name={job.company} size={42} />
                <div className="appcard__who">
                  <span className="appcard__company">{job.company}</span>
                  <span className="appcard__title">{job.title}</span>
                </div>
                <StatusChip job={job} />
              </div>
              <div className="appcard__body">
                <div className="appcard__text">
                  <Note job={job} />
                  <p className="appcard__meta">
                    <time className="mono" dateTime={job.updated_at}>
                      {timeAgo(job.updated_at, now)}
                    </time>
                    {job.dry_run && job.status !== 'blocked' ? <span className="tag tag--dry">Dry run</span> : null}
                    {job.reason && job.status !== 'applying' ? <span className="appcard__reason mono">{job.reason}</span> : null}
                  </p>
                  <p className="appcard__links">
                    <button type="button" className="link-btn" onClick={() => onOpenAnswers(job)}>
                      <IconMemory size={15} />
                      View answers it wrote{answers > 0 ? ` (${answers})` : ''}
                    </button>
                    {job.url ? (
                      <a className="link-btn link-btn--muted" href={job.url} target="_blank" rel="noreferrer">
                        <IconLink size={14} />
                        Posting
                      </a>
                    ) : null}
                  </p>
                </div>
                <Thumb job={job} onOpen={(url) => onOpenShot(job, url)} />
              </div>
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <div className="page page--rail">
      <div className="page__main">
        {strip}
        {items.length > 0 ? (
          <div className="toolbar">
            <PillGroup<Group>
              label="Show"
              value={group}
              onChange={setGroup}
              options={[
                { value: 'all', label: 'All', count: counts.all },
                { value: 'live', label: 'In progress', count: counts.live },
                { value: 'sent', label: 'Sent', count: counts.sent },
                { value: 'notsent', label: 'Not sent', count: counts.notsent },
                { value: 'bad', label: 'Refused or failed', count: counts.bad },
              ]}
            />
          </div>
        ) : null}
        {body}
      </div>
      <aside className="rail" aria-label="Agent">
        {rail}
      </aside>
    </div>
  );
}
