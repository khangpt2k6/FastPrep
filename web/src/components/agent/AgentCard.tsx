import type { AgentRow } from '../../lib/types';
import { clock, stateLabel, timeAgo } from '../../lib/format';
import { IconArrowRight } from '../Icons';
import { Beacon, LogLine, StartHint, agentTone, type LogEntry } from './live';

interface AgentCardProps {
  agent: AgentRow | null;
  online: boolean;
  loading: boolean;
  now: number;
  /** Log lines seen this session, oldest first (kept by the dashboard so they survive page switches). */
  tail: LogEntry[];
  onOpen: () => void;
}

/** The right-rail card: who is working, what it is doing right now. */
export function AgentCard({ agent, online, loading, now, tail, onOpen }: AgentCardProps) {
  const state = online ? agent?.state ?? 'idle' : 'offline';
  const tone = agentTone(online, state);
  const earlier = tail.slice(0, -1).reverse().slice(0, 2);

  return (
    <section className={`card agentcard agentcard--${tone}`} aria-label="Agent status">
      <header className="agentcard__head">
        <Beacon tone={tone} />
        <div className="agentcard__who">
          <p className="agentcard__status">{loading ? 'Checking' : online ? 'Agent online' : 'Agent offline'}</p>
          <p className="agentcard__seen">
            {online ? stateLabel(state) : agent?.last_seen ? `Last seen ${timeAgo(agent.last_seen, now)}` : 'Never connected'}
          </p>
        </div>
      </header>

      {online ? (
        <div className="agentcard__log">
          <LogLine agent={agent} online={online} tone={tone} />
          {earlier.length > 0 ? (
            <ol className="logtail" aria-label="Earlier log lines">
              {earlier.map((e) => (
                <li key={`${e.at}-${e.message}`}>
                  <time className="mono">{clock(e.at)}</time>
                  <span className="logtail__msg">{e.message}</span>
                </li>
              ))}
            </ol>
          ) : null}
        </div>
      ) : (
        <StartHint />
      )}

      <dl className="minis">
        <div>
          <dt>Found</dt>
          <dd className="mono">{(agent?.jobs_found ?? 0).toLocaleString()}</dd>
        </div>
        <div>
          <dt>Scored</dt>
          <dd className="mono">{(agent?.jobs_scored ?? 0).toLocaleString()}</dd>
        </div>
      </dl>
      <p className="agentcard__meta">
        <span title={agent?.resume_name || undefined}>{agent?.resume_name || 'No resume yet'}</span>
        {agent?.model ? <span className="mono">{agent.model}</span> : null}
      </p>
      <button type="button" className="link-btn agentcard__open" onClick={onOpen}>
        Open agent page
        <IconArrowRight size={14} />
      </button>
    </section>
  );
}

/** Under 1280px the rail folds away; this one-line strip keeps the live log in view. */
export function LiveStrip({ agent, online, onOpen }: { agent: AgentRow | null; online: boolean; onOpen: () => void }) {
  const state = online ? agent?.state ?? 'idle' : 'offline';
  const tone = agentTone(online, state);
  return (
    <section className={`card livestrip livestrip--${tone}`} aria-label="Agent status">
      <Beacon tone={tone} size="sm" />
      {online ? (
        <>
          <span className="livestrip__state">{stateLabel(state)}</span>
          <div className="livestrip__line">
            <LogLine agent={agent} online={online} tone={tone} />
          </div>
        </>
      ) : (
        <div className="livestrip__line">
          <StartHint />
        </div>
      )}
      <button type="button" className="icon-btn" onClick={onOpen} aria-label="Open the agent page">
        <IconArrowRight size={16} />
      </button>
    </section>
  );
}
