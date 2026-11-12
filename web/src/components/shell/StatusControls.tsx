import { stateLabel, timeAgo } from '../../lib/format';
import type { AgentRow, LiveStatus } from '../../lib/types';
import { Swap } from '../motion';
import { agentTone } from '../agent/live';
import { Orb } from '../agent/Orb';

interface AgentTickerProps {
  agent: AgentRow | null;
  online: boolean;
  loading: boolean;
  now: number;
  live: LiveStatus;
  onOpen: () => void;
}

/** The orb and the agent's live line in the top bar. Each new line types itself in; the orb opens the agent page. */
export function AgentTicker({ agent, online, loading, now, live, onOpen }: AgentTickerProps) {
  const state = online ? agent?.state ?? 'idle' : 'offline';
  const tone = agentTone(online, state);
  const word = loading ? 'Connecting' : stateLabel(state);
  const message = online ? agent?.message ?? '' : '';
  const seen = !online && !loading ? (agent?.last_seen ? `seen ${timeAgo(agent.last_seen, now)}` : 'not started yet') : '';

  return (
    <div className={`ticker ticker--${loading ? 'loading' : tone}`}>
      <button type="button" className="ticker__orb" onClick={onOpen} title="Open the agent page" aria-label={`Agent: ${word}. Open the agent page`}>
        <Orb tone={loading ? 'loading' : tone} size="sm" />
        <span className="ticker__state" aria-hidden="true">
          <Swap id={word}>{word}</Swap>
        </span>
      </button>
      {message ? (
        <span className="ticker__line" aria-live="polite" title={message}>
          <span className="ticker__text typein" key={message}>
            {message}
          </span>
          <span className="caret" aria-hidden="true" />
        </span>
      ) : seen ? (
        <span className="ticker__line ticker__line--quiet mono">{seen}</span>
      ) : null}
      {live === 'down' ? (
        <span className="ticker__warn" title="Live updates dropped. Retrying.">
          Reconnecting
        </span>
      ) : null}
    </div>
  );
}

/** Dry run fills forms and never sends. Off means Live: real applications go out, so it turns amber. */
export function DryRunSwitch({ dryRun, onChange }: { dryRun: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className={`mode ${dryRun ? 'is-dry' : 'is-live'}`} title={dryRun ? 'Fills forms, never sends' : 'Live: applications are really sent'}>
      <input type="checkbox" role="switch" checked={dryRun} onChange={(e) => onChange(e.target.checked)} aria-label="Dry run" />
      <span className="switch" aria-hidden="true">
        <span className="switch__thumb" />
      </span>
      <span className="mode__word" aria-hidden="true">
        <Swap id={dryRun ? 'dry' : 'live'}>{dryRun ? 'Dry run' : 'Live'}</Swap>
      </span>
    </label>
  );
}
