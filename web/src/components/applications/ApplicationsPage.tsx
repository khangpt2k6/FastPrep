import { useId, useMemo, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { LAYOUT_CAP, SPRING, cardHover, riseItem } from '../../lib/motion';
import { StateFade, useJustSettled } from '../motion';
import type { JobRow, LoadError } from '../../lib/types';
import { displayName, reasonWords, timeAgo } from '../../lib/format';
import { useSignedUrl } from '../../hooks/useSignedUrl';
import { CompanyLogo } from '../CompanyLogo';
import { EmptyState, PillGroup, SkeletonCards } from '../common';
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
  rail: ReactNode;
  /** The header's dry-run switch: it decides whether "again" fills only or really sends. */
  dryRun: boolean;
  online: boolean;
  /** Jobs already in a command the agent has not finished. */
  queued: Set<string>;
  onApplyAgain: (job: JobRow) => void;
}

/** A job that ended without being sent can be tried again: after a dry run, after a block, after a failure. */
function canApplyAgain(job: JobRow): boolean {
  return job.status === 'blocked' || job.status === 'failed' || job.status === 'refused';
}

function Thumb({ job, name, onOpen }: { job: JobRow; name: string; onOpen: (url: string) => void }) {
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
    <button type="button" className="thumb" onClick={() => onOpen(url)} aria-label={`View the screenshot for ${name}`} title="Screenshot">
      <img src={url} alt="" loading="lazy" />
    </button>
  );
}

const SETTLED = ['submitted', 'unconfirmed', 'blocked', 'refused', 'failed'];

/** One application. When the agent finishes it, the card settles with a glow in its result's colour. */
function AppCard({ job, index, children }: { job: JobRow; index: number; children: ReactNode }) {
  const settled = useJustSettled(job.status, 'applying', SETTLED);
  const sent = job.status === 'submitted' || job.status === 'unconfirmed';
  return (
    <motion.li
      className={`card spot appcard ${job.status === 'applying' ? 'is-live' : ''} ${settled ? (sent ? 'is-settled' : 'is-settled is-settled--warn') : ''}`}
      layout={index < LAYOUT_CAP ? 'position' : false}
      variants={riseItem}
      custom={index}
      initial="hidden"
      animate="shown"
      exit="gone"
      whileHover={cardHover}
      transition={{ layout: SPRING }}
    >
      {children}
    </motion.li>
  );
}

function AppBody({ job, now, answers, dryRun, online, queued, onOpenShot, onOpenAnswers, onApplyAgain }: {
  job: JobRow;
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
  const name = displayName(job);
  const reason = job.status !== 'applying' ? reasonWords(job.reason) : '';
  const offline = online ? undefined : 'Start the agent on your computer first';

  return (
    <>
      {job.status === 'applying' ? <span className="appcard__scan" aria-hidden="true" /> : null}
      <CompanyLogo name={name} domain={job.company_domain} size={44} />
      <div className="appcard__main">
        <div className="appcard__who">
          <span className="appcard__company">{name}</span>
          <span className="appcard__title" title={job.title}>
            {job.title}
          </span>
        </div>
        <div className="appcard__row">
          <div className="appcard__meta">
            <StatusChip job={job} />
            <time className="appcard__time mono" dateTime={job.updated_at}>
              {timeAgo(job.updated_at, now)}
            </time>
            {job.dry_run && job.status !== 'blocked' ? <span className="tag tag--dry">Dry run</span> : null}
            {reason ? <span className="appcard__reason">{reason}</span> : null}
          </div>
          <div className="appcard__actions">
            <button
              type="button"
              className="icon-btn icon-btn--count"
              onClick={onOpenAnswers}
              aria-label={answers > 0 ? `Answers it wrote, ${answers}` : 'Answers it wrote'}
              title={answers > 0 ? `Answers it wrote (${answers})` : 'Answers it wrote'}
            >
              <IconMemory size={17} />
              {answers > 0 ? <span className="icon-btn__count mono">{answers}</span> : null}
            </button>
            {job.url ? (
              <a className="icon-btn" href={job.url} target="_blank" rel="noreferrer" aria-label={`Open the ${name} posting`} title="Open posting">
                <IconLink size={16} />
              </a>
            ) : null}
            {canApplyAgain(job) ? (
              queued ? (
                <span className="tag tag--queued">Queued</span>
              ) : dryRun ? (
                <button type="button" className="icon-btn" onClick={onApplyAgain} disabled={!online} aria-label="Dry run again" title={offline ?? 'Dry run again'}>
                  <IconRepeat size={16} />
                </button>
              ) : (
                <button type="button" className="btn btn--live btn--sm" onClick={onApplyAgain} disabled={!online} title={offline ?? 'Fill and send this application'}>
                  <IconSend size={14} />
                  Apply for real
                </button>
              )
            ) : null}
            {job.note ? (
              <button type="button" className="disclose" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-controls={noteId}>
                Details
                <IconChevronDown size={14} />
              </button>
            ) : null}
          </div>
        </div>
        {open && job.note ? (
          <p className="appcard__note mono" id={noteId}>
            {job.note}
          </p>
        ) : null}
      </div>
      <Thumb job={job} name={name} onOpen={onOpenShot} />
    </>
  );
}

export function ApplicationsPage({
  items, loading, error, onRetry, now, onOpenShot, onOpenAnswers, answerCounts, rail, dryRun, online, queued, onApplyAgain,
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
    state = 'loading';
    body = <SkeletonCards count={3} />;
  } else if (items.length === 0) {
    state = 'none';
    body = <EmptyState icon={<IconSend size={22} />} title="No applications yet" />;
  } else if (shown.length === 0) {
    state = 'filtered';
    body = <p className="empty-line">Nothing here right now.</p>;
  } else {
    body = (
      <ul className="cardlist">
        <AnimatePresence>
          {shown.map((job, index) => (
            <AppCard job={job} index={index} key={job.id}>
              <AppBody
                job={job}
                now={now}
                answers={answerCounts.get(job.id) ?? 0}
                dryRun={dryRun}
                online={online}
                queued={queued.has(job.id)}
                onOpenShot={(url) => onOpenShot(job, url)}
                onOpenAnswers={() => onOpenAnswers(job)}
                onApplyAgain={() => onApplyAgain(job)}
              />
            </AppCard>
          ))}
        </AnimatePresence>
      </ul>
    );
  }

  return (
    <div className="page page--rail">
      <div className="page__main">
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
      <aside className="rail" aria-label="Agent">
        {rail}
      </aside>
    </div>
  );
}
