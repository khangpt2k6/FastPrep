import { stateLabel, timeAgo } from '../../lib/format';
import type { AgentRow, LiveStatus } from '../../lib/types';
import { Swap } from '../motion';
import { agentTone, type AgentTone } from '../agent/live';

/** Gray when offline, green when ready, blue and pulsing while working, red on error. */
export function StatusDot({ tone }: { tone: AgentTone }) {
  return <span className={`sdot sdot--${tone}`} aria-hidden="true" />;
}

interface AgentStatusProps {
  agent: AgentRow | null;
  online: boolean;
  loading: boolean;
  now: number;
  live: LiveStatus;
  onOpen: () => void;
  /** Phones: only the dot and the state word. */
  compact?: boolean;
}

/** One quiet line for the agent, such as "Agent offline · 4h ago". Opens the agent page. */
export function AgentStatus({ agent, online, loading, now, live, onOpen, compact = false }: AgentStatusProps) {
  const state = online ? agent?.state ?? 'idle' : 'offline';
  const tone: AgentTone = loading ? 'off' : agentTone(online, state);
  const word = loading ? 'Connecting' : online ? `Agent ${stateLabel(state).toLowerCase()}` : 'Agent offline';
  const text = compact ? (loading ? 'Connecting' : online ? stateLabel(state) : 'Offline') : word;
  const seen = !online && !loading && agent?.last_seen ? timeAgo(agent.last_seen, now) : '';
  const message = online ? agent?.message ?? '' : '';
  return (
    <button
      type="button"
      className={`agentstatus agentstatus--${tone} ${compact ? 'agentstatus--compact' : ''}`}
      onClick={onOpen}
      title={message || 'Open the agent page'}
    >
      <StatusDot tone={tone} />
      <span className="agentstatus__word">
        <Swap id={text}>{text}</Swap>
      </span>
      {seen && !compact ? <span className="agentstatus__seen">· {seen}</span> : null}
      {live === 'down' ? (
        <span className="tag tag--orange" title="Live updates paused, retrying">
          Reconnecting
        </span>
      ) : null}
    </button>
  );
}

/** Dry run fills forms and never sends. Off means Live: real applications go out, so a red Live tag appears. */
export function DryRunSwitch({ dryRun, onChange }: { dryRun: boolean; onChange: (value: boolean) => void }) {
  return (
    <div className="dryrun">
      {!dryRun ? (
        <span className="tag tag--red tag--strong" title="Applications are sent to employers">
          Live
        </span>
      ) : null}
      <label className="switchrow" title={dryRun ? 'Fills forms, never sends' : 'Turn on to stop sending'}>
        <span className="switchrow__label">Dry run</span>
        <input type="checkbox" role="switch" checked={dryRun} onChange={(e) => onChange(e.target.checked)} />
        <span className="switch" aria-hidden="true">
          <span className="switch__thumb" />
        </span>
      </label>
    </div>
  );
}
