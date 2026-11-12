import type { AgentRow, JobRow } from '../../lib/types';
import { AnimatedNumber, Swap } from '../motion';
import { stateLabel, timeAgo } from '../../lib/format';
import { IconArrowRight } from '../Icons';
import { CurrentJob, StartHint, agentTone } from './live';
import { Orb } from './Orb';

interface AgentCardProps {
  agent: AgentRow | null;
  online: boolean;
  loading: boolean;
  now: number;
  /** The job being filled right now, if any. */
  current: JobRow | null;
  onOpen: () => void;
}

/** The right-rail card: the orb, one state word and the two big numbers. */
export function AgentCard({ agent, online, loading, now, current, onOpen }: AgentCardProps) {
  const state = online ? agent?.state ?? 'idle' : 'offline';
  const tone = agentTone(online, state);
  const word = loading ? 'Connecting' : stateLabel(state);
  const seen = !online && agent?.last_seen ? timeAgo(agent.last_seen, now) : '';

  return (
    <section className={`card railcard agentcard agentcard--${tone}`} aria-label="Agent">
      <button type="button" className="agentcard__head" onClick={onOpen} title="Open the agent page">
        <Orb tone={loading ? 'loading' : tone} size="md" />
        <span className="agentcard__who">
          <span className="agentcard__state">
            <Swap id={word}>{word}</Swap>
          </span>
          {seen ? <span className="agentcard__seen mono">seen {seen}</span> : null}
        </span>
        <IconArrowRight size={16} className="agentcard__go" />
      </button>

      {online && current ? <CurrentJob job={current} /> : null}

      <dl className="bignums">
        <div>
          <dt>Found</dt>
          <dd>
            <AnimatedNumber id="agent-found" value={agent?.jobs_found ?? 0} />
          </dd>
        </div>
        <div>
          <dt>Scored</dt>
          <dd>
            <AnimatedNumber id="agent-scored" value={agent?.jobs_scored ?? 0} />
          </dd>
        </div>
      </dl>

      {!online && !loading ? <StartHint /> : null}
    </section>
  );
}
