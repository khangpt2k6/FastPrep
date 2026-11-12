import { AnimatePresence, motion } from 'motion/react';
import type { AgentRow, CommandRow, JobRow, LiveStatus, LoadError } from '../../lib/types';
import { LAYOUT_CAP, SPRING, riseItem } from '../../lib/motion';
import { AnimatedNumber, Swap } from '../motion';
import { clock, plural, stateLabel, timeAgo } from '../../lib/format';
import { CurrentJob, LogLine, StartHint, agentTone, logItem, type LogEntry } from './live';
import { Orb } from './Orb';

const COMMAND_KIND: Record<string, string> = { apply: 'Apply', search: 'Search', cover_letter: 'Letters' };

interface AgentPageProps {
  agent: AgentRow | null;
  online: boolean;
  loading: boolean;
  error: LoadError | null;
  onRetry: () => void;
  now: number;
  tail: LogEntry[];
  commands: CommandRow[];
  live: LiveStatus;
  sent: number;
  /** The job being filled right now, if any. */
  current: JobRow | null;
}

const COMMAND_STATUS: Record<CommandRow['status'], string> = {
  pending: 'Waiting',
  running: 'Running',
  done: 'Done',
  failed: 'Failed',
};

const LIVE_WORD: Record<LiveStatus, string> = { live: 'Connected', down: 'Reconnecting', connecting: 'Connecting' };

export function AgentPage({ agent, online, loading, error, onRetry, now, tail, commands, live, sent, current }: AgentPageProps) {
  const state = online ? agent?.state ?? 'idle' : 'offline';
  const tone = agentTone(online, state);
  const word = loading ? 'Connecting' : stateLabel(state);
  const earlier = tail.slice(0, -1).reverse().slice(0, 5);
  const recent = [...commands].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at)).slice(0, 10);

  return (
    <div className="page page--agent">
      <section className={`card hero hero--${tone}`} aria-label="Agent status">
        <div className="hero__status">
          <Orb tone={loading ? 'loading' : tone} size="lg" label={`Agent: ${word}`} />
          <div className="hero__who">
            <p className="hero__state">
              <Swap id={word}>{word}</Swap>
            </p>
            <p className="hero__meta mono">
              {agent?.last_seen ? <span>seen {timeAgo(agent.last_seen, now)}</span> : <span>never connected</span>}
              {agent?.model ? <span>{agent.model}</span> : null}
            </p>
            {online && current ? <CurrentJob job={current} /> : null}
          </div>
        </div>

        <div className="hero__log">
          {error ? (
            <div className="inline-error">
              <p>{error.message}</p>
              <button type="button" className="btn btn--secondary btn--sm" onClick={onRetry}>
                Try again
              </button>
            </div>
          ) : online ? (
            <>
              <LogLine agent={agent} online={online} tone={tone} />
              {earlier.length > 0 ? (
                <ol className="logtail logtail--wide" aria-label="Earlier log lines">
                  <AnimatePresence initial={false}>
                    {earlier.map((e) => (
                      <motion.li key={`${e.at}-${e.message}`} layout="position" {...logItem}>
                        <time className="mono">{clock(e.at)}</time>
                        <span className="logtail__state mono">{e.state}</span>
                        <span className="logtail__msg">{e.message}</span>
                      </motion.li>
                    ))}
                  </AnimatePresence>
                </ol>
              ) : null}
            </>
          ) : loading ? null : (
            <StartHint />
          )}
        </div>
      </section>

      <dl className="stats">
        <div className="card stat">
          <dt>Found</dt>
          <dd className="stat__num">
            <AnimatedNumber id="agent-found" value={agent?.jobs_found ?? 0} />
          </dd>
        </div>
        <div className="card stat">
          <dt>Scored</dt>
          <dd className="stat__num">
            <AnimatedNumber id="agent-scored" value={agent?.jobs_scored ?? 0} />
          </dd>
        </div>
        <div className="card stat">
          <dt>Sent</dt>
          <dd className="stat__num">
            <AnimatedNumber id="apps-sent" value={sent} />
          </dd>
        </div>
        <div className="card stat">
          <dt>Resume</dt>
          <dd className="stat__text" title={agent?.resume_name || undefined}>
            {agent?.resume_name || <span className="muted">Not loaded</span>}
          </dd>
        </div>
        <div className="card stat">
          <dt>Model</dt>
          <dd className="stat__text mono">{agent?.model || <span className="muted">Unknown</span>}</dd>
        </div>
        <div className="card stat">
          <dt>Realtime</dt>
          <dd className={`stat__text live-${live}`}>
            <Swap id={live}>{LIVE_WORD[live]}</Swap>
          </dd>
        </div>
      </dl>

      <section className="card cmds" aria-labelledby="cmds-title">
        <header className="card__head">
          <h2 id="cmds-title" className="card__title">
            Commands
          </h2>
        </header>
        {recent.length === 0 ? (
          <p className="empty-line">None yet.</p>
        ) : (
          <ul className="cmdlist">
            <AnimatePresence initial={false}>
              {recent.map((c, i) => (
                <motion.li
                  className="cmd"
                  key={c.id}
                  layout={i < LAYOUT_CAP ? 'position' : false}
                  variants={riseItem}
                  custom={0}
                  initial="hidden"
                  animate="shown"
                  exit="gone"
                  transition={{ layout: SPRING }}
                >
                  <span className={`cmd__kind cmd__kind--${c.kind}`}>{COMMAND_KIND[c.kind] ?? c.kind}</span>
                  <span className="cmd__what">
                    {c.kind === 'apply' ? plural(c.job_ids.length, 'job') : c.kind === 'cover_letter' ? plural(c.job_ids.length, 'letter') : 'More jobs'}
                    {c.kind === 'apply' ? (
                      c.dry_run ? <span className="tag tag--dry">Dry run</span> : <span className="tag tag--live">Live</span>
                    ) : null}
                  </span>
                  <span className={`pill pill--cmd-${c.status}`}>
                    <Swap id={`${c.status}-${online}`}>{c.status === 'pending' && !online ? 'Waiting for agent' : COMMAND_STATUS[c.status]}</Swap>
                  </span>
                  <time className="cmd__time mono">{timeAgo(c.created_at, now)}</time>
                  {c.status === 'failed' && c.error ? <p className="cmd__error">{c.error}</p> : null}
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        )}
      </section>
    </div>
  );
}
