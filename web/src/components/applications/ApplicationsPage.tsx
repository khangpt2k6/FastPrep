import { useId, useMemo, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { LAYOUT_CAP, SPRING, riseItem } from '../../lib/motion';
import { StateFade, useJustSettled } from '../motion';
import type { JobRow, LoadError } from '../../lib/types';
import { displayName, reasonWords, stopReason, timeAgo } from '../../lib/format';
import { useSignedUrl } from '../../hooks/useSignedUrl';
import { CompanyLogo } from '../CompanyLogo';
import { EmptyState, PillGroup, SkeletonPanel, Tag } from '../common';
import { IconAlert, IconChevronDown, IconImage, IconLink, IconMemory, IconRepeat, IconSend } from '../Icons';
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
  /** The Dry run switch: it decides whether "again" fills only or really sends. */
  dryRun: boolean;
  online: boolean;
  /** Jobs already in a command the agent has not finished. */
  queued: Set<string>;
  onApplyAgain: (job: JobRow) => void;
  /** Callouts above the table, such as Live mode. */
  notices?: ReactNode;
}

/** A job that ended without being sent can be tried again: after a dry run, after a block, after a failure. */
function canApplyAgain(job: JobRow): boolean {
  return job.status === 'blocked' || job.status === 'failed' || job.status === 'refused';
}

/** The form's screenshot as a small thumbnail that opens the lightbox; an empty slot keeps the columns aligned. */
function Thumb({ job, name, onOpen }: { job: JobRow; name: string; onOpen: (url: string) => void }) {
  const { url, failed } = useSignedUrl(job.screenshot_path, job.updated_at);
  if (!job.screenshot_path) return <span className="thumb thumb--none" aria-hidden="true" />;
  if (failed) {
    return (
      <span className="thumb thumb--empty" title="Screenshot unavailable">
        <IconImage size={14} />
      </span>
    );
  }
  if (!url) return <span className="thumb skeleton" aria-hidden="true" />;
  return (
    <button type="button" className="thumb" onClick={() => onOpen(url)} aria-label={`Screenshot for ${name}`} title="Screenshot">
      <img src={url} alt="" loading="lazy" />
    </button>
  );
}

const SETTLED = ['submitted', 'unconfirmed', 'blocked', 'refused', 'failed'];

function AppRow({ job, index, now, answers, dryRun, online, queued, onOpenShot, onOpenAnswers, onApplyAgain }: {
  job: JobRow;
  index: number;
  now: number;
  answers: number;
  dryRun: boolean;
  online: boolean;
  queued: boolean;
  onOpenShot: (url: string) => void;
  onOpenAnswers: () => void;
  onApplyAgain: () => void;
}) {
  const [open, setOpen] = useState(false);
  const noteId = useId();
  // A row the agent just finished gets a brief highlight.
  const fresh = useJustSettled(job.status, 'applying', SETTLED);
  const name = displayName(job);
  const reason = job.status === 'applying' ? '' : stopReason(job) || reasonWords(job.reason);
  const offline = online ? undefined : 'Start the agent first';

  return (
    <motion.li
      className={`dbrow approw ${fresh ? 'is-fresh' : ''} ${open ? 'is-open' : ''}`}
      layout={index < LAYOUT_CAP ? 'position' : false}
      variants={riseItem}
      custom={index}
      initial="hidden"
      animate="shown"
      exit="gone"
      transition={{ layout: SPRING }}
    >
      <div className="approw__grid">
        <span className="approw__company">
          <CompanyLogo name={name} domain={job.company_domain} size={28} />
          <span className="approw__name">{name}</span>
        </span>
        <span className="approw__role" title={job.title}>
          {job.title}
        </span>
        <span className="approw__status">
          <StatusChip job={job} />
          {job.dry_run && job.status !== 'blocked' ? <Tag color="gray">Dry run</Tag> : null}
          {queued && canApplyAgain(job) ? <Tag color="gray">Queued</Tag> : null}
          {reason ? <span className="approw__reason">{reason}</span> : null}
        </span>
        <time className="approw__time num" dateTime={job.updated_at}>
          {timeAgo(job.updated_at, now)}
        </time>
        <span className="approw__actions">
          <Thumb job={job} name={name} onOpen={onOpenShot} />
          {answers > 0 ? (
            <button type="button" className="icon-btn icon-btn--count" onClick={onOpenAnswers} aria-label={`Answers, ${answers}`} title={`Answers (${answers})`}>
              <IconMemory size={15} />
              <span className="icon-btn__count num">{answers}</span>
            </button>
          ) : (
            <span className="slot slot--count" aria-hidden="true" />
          )}
          {job.url ? (
            <a className="icon-btn" href={job.url} target="_blank" rel="noreferrer" aria-label={`Open the ${name} posting`} title="Open posting">
              <IconLink size={15} />
            </a>
          ) : (
            <span className="slot" aria-hidden="true" />
          )}
          {canApplyAgain(job) && !queued ? (
            dryRun ? (
              <button type="button" className="icon-btn" onClick={onApplyAgain} disabled={!online} aria-label="Dry run again" title={offline ?? 'Dry run again'}>
                <IconRepeat size={15} />
              </button>
            ) : (
              <button type="button" className="icon-btn icon-btn--danger" onClick={onApplyAgain} disabled={!online} aria-label="Apply for real" title={offline ?? 'Apply for real'}>
                <IconSend size={15} />
              </button>
            )
          ) : (
            <span className="slot" aria-hidden="true" />
          )}
          {job.note ? (
            <button
              type="button"
              className="icon-btn disclose"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              aria-controls={noteId}
              aria-label="Details"
              title="Details"
            >
              <IconChevronDown size={15} />
            </button>
          ) : (
            <span className="slot" aria-hidden="true" />
          )}
        </span>
      </div>
      {open && job.note ? (
        <p className="approw__details" id={noteId}>
          {job.note}
        </p>
      ) : null}
    </motion.li>
  );
}

export function ApplicationsPage({
  items, loading, error, onRetry, now, onOpenShot, onOpenAnswers, answerCounts, dryRun, online, queued, onApplyAgain, notices,
}: ApplicationsPageProps) {
  const [group, setGroup] = useState<Group>('all');

  const counts = useMemo(() => {
    const c: Record<Group, number> = { all: items.length, live: 0, sent: 0, notsent: 0, bad: 0 };
    for (const job of items) c[groupOf(job)] += 1;
    return c;
  }, [items]);

  const shown = group === 'all' ? items : items.filter((j) => groupOf(j) === group);

  let body: ReactNode;
  let state = 'list';
  if (error) {
    state = 'error';
    body = (
      <div className="panel">
        <EmptyState
          icon={<IconAlert size={20} />}
          title="Could not load applications."
          action={
            <button type="button" className="btn btn--secondary btn--sm" onClick={onRetry}>
              Retry
            </button>
          }
        >
          {error.message}
        </EmptyState>
      </div>
    );
  } else if (loading) {
    state = 'loading';
    body = <SkeletonPanel count={5} />;
  } else if (items.length === 0) {
    state = 'none';
    body = (
      <div className="panel">
        <EmptyState icon={<IconSend size={20} />} title="No applications yet.">
          Select jobs on the Jobs page, then Apply.
        </EmptyState>
      </div>
    );
  } else if (shown.length === 0) {
    state = 'filtered';
    body = (
      <div className="panel">
        <p className="empty-line">None in this view.</p>
      </div>
    );
  } else {
    body = (
      <div className="panel listcard dbtable">
        <div className="listhead approw__grid" aria-hidden="true">
          <span className="listhead__col">Company</span>
          <span className="listhead__col">Role</span>
          <span className="listhead__col">Status</span>
          <span className="listhead__col">Updated</span>
          <span />
        </div>
        <ul className="dblist__rows">
          <AnimatePresence initial={true}>
            {shown.map((job, index) => (
              <AppRow
                key={job.id}
                job={job}
                index={index}
                now={now}
                answers={answerCounts.get(job.id) ?? 0}
                dryRun={dryRun}
                online={online}
                queued={queued.has(job.id)}
                onOpenShot={(url) => onOpenShot(job, url)}
                onOpenAnswers={() => onOpenAnswers(job)}
                onApplyAgain={() => onApplyAgain(job)}
              />
            ))}
          </AnimatePresence>
        </ul>
      </div>
    );
  }

  return (
    <div className="page page--apps">
      {notices}
      {items.length > 0 ? (
        <div className="toolbar">
          <PillGroup<Group>
            label="Show"
            value={group}
            onChange={setGroup}
            options={[
              { value: 'all', label: 'All', count: counts.all },
              { value: 'live', label: 'Applying', count: counts.live },
              { value: 'sent', label: 'Sent', count: counts.sent },
              { value: 'notsent', label: 'Not sent', count: counts.notsent, title: 'Filled in a dry run, or stopped' },
              { value: 'bad', label: 'Failed', count: counts.bad, title: 'Refused or failed' },
            ]}
          />
        </div>
      ) : null}
      <StateFade state={state}>{body}</StateFade>
    </div>
  );
}
