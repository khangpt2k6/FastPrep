import type { AgentRow, CommandRow, LiveStatus, LoadError } from '../../lib/types';
import { clock, plural, stateLabel, timeAgo } from '../../lib/format';
import { Beacon, LogLine, StartHint, agentTone, type LogEntry } from './live';

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
}

const COMMAND_STATUS: Record<CommandRow['status'], string> = {
  pending: 'Waiting',
  running: 'Running',
  done: 'Done',
  failed: 'Failed',
};

export function AgentPage({ agent, online, loading, error, onRetry, now, tail, commands, live, sent }: AgentPageProps) {
  const state = online ? agent?.state ?? 'idle' : 'offline';
  const tone = agentTone(online, state);
  const earlier = tail.slice(0, -1).reverse().slice(0, 5);
  const recent = [...commands].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at)).slice(0, 10);

  return (
    <div className="page page--agent">
      <section className={`card hero hero--${tone}`} aria-label="Agent status">
        <div className="hero__status">
          <Beacon tone={tone} size="lg" />
          <div>
            <p className="hero__online">{loading ? 'Checking' : online ? 'Online' : 'Offline'}</p>
            <p className="hero__meta">
              <span className={`statepill statepill--${tone}`}>{stateLabel(state)}</span>
              {agent?.last_seen ? <span className="mono">seen {timeAgo(agent.last_seen, now)}</span> : null}
            </p>
          </div>
        </div>

        <div className="hero__log">
          <p className="eyebrow">Live log</p>
          {error ? (
            <div className="inline-error">
              <p>{error.message}</p>
              <button type="button" className="btn btn--ghost btn--sm" onClick={onRetry}>
                Try again
              </button>
            </div>
          ) : online ? (
            <>
              <LogLine agent={agent} online={online} tone={tone} />
              {earlier.length > 0 ? (
                <ol className="logtail logtail--wide" aria-label="Earlier log lines">
                  {earlier.map((e) => (
                    <li key={`${e.at}-${e.message}`}>
                      <time className="mono">{clock(e.at)}</time>
                      <span className="logtail__state mono">{e.state}</span>
                      <span className="logtail__msg">{e.message}</span>
                    </li>
                  ))}
                </ol>
              ) : null}
            </>
          ) : (
            <>
              <p className="hero__off">
                {agent ? 'The agent is not running.' : 'No agent has checked in yet.'} It runs on your computer, reads your
                resume, scores jobs and fills the forms in a real browser window. This page shows what it is doing.
              </p>
              <StartHint />
            </>
          )}
        </div>
      </section>

      <dl className="stats">
        <div className="card stat">
          <dt>Jobs found</dt>
          <dd className="stat__num mono">{(agent?.jobs_found ?? 0).toLocaleString()}</dd>
        </div>
        <div className="card stat">
          <dt>Jobs scored</dt>
          <dd className="stat__num mono">{(agent?.jobs_scored ?? 0).toLocaleString()}</dd>
        </div>
        <div className="card stat">
          <dt>Applications sent</dt>
          <dd className="stat__num mono">{sent.toLocaleString()}</dd>
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
          <dt>Live updates</dt>
          <dd className={`stat__text live-${live}`}>{live === 'live' ? 'Connected' : live === 'down' ? 'Reconnecting' : 'Connecting'}</dd>
        </div>
      </dl>

      <section className="card cmds" aria-labelledby="cmds-title">
        <header className="card__head">
          <h2 id="cmds-title" className="card__title">
            Recent commands
          </h2>
          <span className="card__hint">What this page asked the agent to do</span>
        </header>
        {recent.length === 0 ? (
          <p className="empty-line">Nothing yet. Commands appear here when you apply or ask for more jobs.</p>
        ) : (
          <ul className="cmdlist">
            {recent.map((c) => (
              <li className="cmd" key={c.id}>
                <span className={`cmd__kind cmd__kind--${c.kind}`}>{COMMAND_KIND[c.kind] ?? c.kind}</span>
                <span className="cmd__what">
                  {c.kind === 'apply' ? plural(c.job_ids.length, 'job') : c.kind === 'cover_letter' ? plural(c.job_ids.length, 'letter') : 'Find more jobs'}
                  {c.kind === 'apply' && c.dry_run ? <span className="tag tag--dry">Dry run</span> : null}
                </span>
                <span className={`pill pill--cmd-${c.status}`}>
                  {c.status === 'pending' && !online ? 'Waiting for agent' : COMMAND_STATUS[c.status]}
                </span>
                <time className="cmd__time mono">{timeAgo(c.created_at, now)}</time>
                {c.status === 'failed' && c.error ? <p className="cmd__error">{c.error}</p> : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
