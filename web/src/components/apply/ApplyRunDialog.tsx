import { useMemo } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { STATUS_COLOR, plural } from '../../lib/format';
import type { AgentRow, CommandRow, JobRow } from '../../lib/types';
import { CompanyLogo } from '../CompanyLogo';
import { Dialog } from '../Dialog';
import { IconAlert, IconCheck, IconClock, IconX } from '../Icons';
import { elapsed, readRun, type Run, type RunJob } from './run';
import './applyRun.css';

interface ApplyRunProps {
  command: CommandRow | null;
  jobs: JobRow[];
  agent: AgentRow | null;
  online: boolean;
  now: number;
}

const EASE = [0.22, 1, 0.36, 1] as const;

function Mark({ job }: { job: RunJob }) {
  if (job.phase === 'active') {
    return (
      <span className="arun__mark is-active" aria-hidden="true">
        <span className="arun__orbit" />
      </span>
    );
  }
  if (job.phase === 'done' && job.info) {
    const tone = job.info.tone;
    const good = tone === 'sent' || tone === 'unconfirmed' || tone === 'filled';
    return (
      <motion.span className={`arun__mark is-${tone}`} aria-hidden="true" initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 520, damping: 22 }}>
        {good ? <IconCheck size={13} strokeWidth={2.6} /> : <IconAlert size={13} strokeWidth={2.4} />}
      </motion.span>
    );
  }
  if (job.phase === 'skipped') {
    return (
      <span className="arun__mark is-skipped" aria-hidden="true">
        <IconX size={12} strokeWidth={2.4} />
      </span>
    );
  }
  return <span className="arun__mark is-queued" aria-hidden="true">{job.number}</span>;
}

function Row({ job, index }: { job: RunJob; index: number }) {
  return (
    <motion.li
      layout
      className={`arun__row is-${job.phase}`}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: 0.12 + Math.min(index, 10) * 0.05, ease: EASE }}
    >
      <Mark job={job} />
      <CompanyLogo name={job.company} domain={job.domain} size={32} />
      <div className="arun__who">
        <p className="arun__title">{job.title}</p>
        <p className="arun__company">{job.company}</p>
        {job.note ? (
          <motion.p key={`${job.phase}:${job.note}`} className="arun__note" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22 }}>
            {job.phase === 'active' ? <span className="arun__typing" aria-hidden="true"><i /><i /><i /></span> : null}
            {job.note}
          </motion.p>
        ) : null}
      </div>
      <span className="arun__state">
        {job.phase === 'done' && job.info ? (
          <span className={`tag tag--${STATUS_COLOR[job.info.tone]}`} title={job.info.hint}>
            {job.info.label}
          </span>
        ) : job.phase === 'active' ? (
          <span className="tag tag--blue arun__live">
            <span className="arun__pulse" />
            Filling
          </span>
        ) : job.phase === 'skipped' ? (
          <span className="tag tag--gray">Skipped</span>
        ) : (
          <span className="arun__queued">Queued</span>
        )}
      </span>
    </motion.li>
  );
}

function Ring({ value, state }: { value: number; state: Run['state'] }) {
  const r = 26;
  const c = 2 * Math.PI * r;
  return (
    <svg className={`arun__ring is-${state}`} width="64" height="64" viewBox="0 0 64 64" aria-hidden="true">
      <circle cx="32" cy="32" r={r} className="arun__ring-track" />
      <motion.circle
        cx="32"
        cy="32"
        r={r}
        className="arun__ring-fill"
        strokeDasharray={c}
        initial={{ strokeDashoffset: c }}
        animate={{ strokeDashoffset: c * (1 - value) }}
        transition={{ duration: 0.8, ease: EASE }}
        transform="rotate(-90 32 32)"
      />
    </svg>
  );
}

function headline(run: Run, dry: boolean): string {
  if (run.state === 'waiting') return 'Starting';
  if (run.state === 'running') return run.active ? `Applying ${run.active.number} of ${run.total}` : `${run.finished} of ${run.total} done`;
  if (run.state === 'stopped') return 'Stopped';
  return dry ? 'Dry run complete' : 'All done';
}

function subline(run: Run, online: boolean): string {
  if (run.state === 'waiting') return online ? 'The agent is picking up the run.' : 'The agent is offline. The run starts when it is back.';
  if (run.state === 'stopped') return run.stopped;
  if (run.state === 'done') {
    const parts = [run.sent ? `${run.sent} sent` : '', run.filled ? `${run.filled} filled` : '', run.problems ? `${run.problems} need a look` : ''].filter(Boolean);
    return parts.join(', ') || 'Nothing was sent.';
  }
  return run.active?.note ?? 'Working';
}

/** The apply run in the middle of the screen: one row per job, each moving from Queued to Filling to its result. */
export function ApplyRunDialog({ command, jobs, agent, online, now, open, onHide, onCancel, onViewApplied }: ApplyRunProps & {
  open: boolean;
  onHide: () => void;
  onCancel: (id: number) => void;
  onViewApplied: () => void;
}) {
  const run = useMemo(() => (command ? readRun(command, jobs, agent) : null), [command, jobs, agent]);
  if (!command || !run) return <Dialog open={false} onClose={onHide} labelledBy="arun-title">{null}</Dialog>;
  const live = run.state === 'waiting' || run.state === 'running';
  const pct = Math.round(run.progress * 100);
  return (
    <Dialog open={open} onClose={onHide} labelledBy="arun-title" className="arun">
      <div className={`arun__head is-${run.state}`}>
        <div className="arun__ringwrap">
          <Ring value={run.progress} state={run.state} />
          <span className="arun__pct">{run.state === 'done' ? <IconCheck size={20} strokeWidth={2.6} /> : `${pct}%`}</span>
        </div>
        <div className="arun__heading">
          <div className="arun__badges">
            <span className={`tag ${command.dry_run ? 'tag--yellow' : 'tag--ember'}`}>{command.dry_run ? 'Dry run' : 'Live'}</span>
            {agent?.model ? <span className="tag tag--gray">{agent.model}</span> : null}
            <span className="arun__time">
              <IconClock size={12} />
              {elapsed(command.created_at, now)}
            </span>
          </div>
          <h2 id="arun-title" className="arun__h">
            <AnimatePresence mode="wait" initial={false}>
              <motion.span key={headline(run, command.dry_run)} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.2 }}>
                {headline(run, command.dry_run)}
              </motion.span>
            </AnimatePresence>
          </h2>
          <p className={`arun__sub ${run.state === 'stopped' || (!online && live) ? 'is-warn' : ''}`}>{subline(run, online)}</p>
        </div>
        <button type="button" className="icon-btn arun__close" aria-label={live ? 'Hide' : 'Close'} onClick={onHide}>
          <IconX size={16} />
        </button>
      </div>

      <div className="arun__bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label="Run progress">
        {run.jobs.map((job) => (
          <span key={job.id} className={`arun__seg is-${job.phase} ${job.info ? `tone-${job.info.tone}` : ''}`} />
        ))}
      </div>

      <ul className="arun__list">
        {run.jobs.map((job, i) => (
          <Row key={job.id} job={job} index={i} />
        ))}
      </ul>

      <div className="arun__foot">
        <span className="arun__count">
          {run.finished} / {plural(run.total, 'job')}
        </span>
        {live ? (
          <>
            <button type="button" className="btn btn--ghost" onClick={() => onCancel(command.id)}>
              {run.state === 'waiting' ? 'Cancel' : 'Stop after this job'}
            </button>
            <button type="button" className="btn btn--primary" onClick={onHide} data-autofocus>
              Run in background
            </button>
          </>
        ) : (
          <>
            <button type="button" className="btn btn--ghost" onClick={onViewApplied}>
              View applied
            </button>
            <button type="button" className="btn btn--primary" onClick={onHide} data-autofocus>
              Done
            </button>
          </>
        )}
      </div>
    </Dialog>
  );
}

/** The run, folded into a pill at the bottom right while the dialog is hidden. */
export function ApplyRunDock({ command, jobs, agent, now, visible, onOpen }: Omit<ApplyRunProps, 'online'> & { visible: boolean; onOpen: () => void }) {
  const run = useMemo(() => (command ? readRun(command, jobs, agent) : null), [command, jobs, agent]);
  const show = visible && !!command && !!run;
  return (
    <AnimatePresence>
      {show && run && command ? (
        <motion.button
          type="button"
          className={`arun-dock is-${run.state}`}
          onClick={onOpen}
          initial={{ opacity: 0, y: 24, scale: 0.94 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 24, scale: 0.94 }}
          transition={{ duration: 0.3, ease: EASE }}
          aria-label="Show the apply run"
        >
          <span className="arun-dock__ring">
            <Ring value={run.progress} state={run.state} />
          </span>
          <span className="arun-dock__text">
            <strong>{headline(run, command.dry_run)}</strong>
            <span>{run.state === 'running' && run.active ? run.active.company : `${run.finished} of ${run.total} · ${elapsed(command.created_at, now)}`}</span>
          </span>
        </motion.button>
      ) : null}
    </AnimatePresence>
  );
}
