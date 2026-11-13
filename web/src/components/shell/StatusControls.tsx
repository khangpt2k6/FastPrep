import { stateLabel, timeAgo } from '../../lib/format';
import type { AgentRow, LiveStatus } from '../../lib/types';
import { ProgressRing, Shimmer, Swap } from '../motion';
import { WolfTile, wolfForState } from '../mascot/Wolf';
import { agentTone, type AgentTone } from '../agent/live';

/** Gray when offline, green when ready, violet and pulsing while working, red on error. */
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
  /** Phones: a smaller pill. */
  compact?: boolean;
}

/** The pill's word, and the longer line for its tooltip and screen readers. */
export function statusWords(agent: AgentRow | null, online: boolean, loading: boolean, now: number, tone: AgentTone) {
  const state = online ? agent?.state ?? 'idle' : 'offline';
  if (loading) return { word: 'Connecting', line: 'Connecting to the agent' };
  if (!online) {
    const seen = agent?.last_seen ? timeAgo(agent.last_seen, now) : '';
    return { word: 'Offline', line: seen ? `Agent offline, seen ${seen}` : 'Agent not started yet' };
  }
  if (tone === 'paused') return { word: 'Paused', line: 'Agent paused, it takes no new jobs' };
  if (tone === 'bad') return { word: 'Error', line: agent?.message || 'The agent hit an error' };
  if (tone === 'busy') return { word: stateLabel(state), line: agent?.message || stateLabel(state) };
  return { word: 'Online', line: agent?.message || 'Agent online, waiting for jobs' };
}

/** The agent's pill: the wolf on its tile, and Online, Paused, Offline or what it is doing. Opens the agent page. */
export function AgentStatus({ agent, online, loading, now, live, onOpen, compact = false }: AgentStatusProps) {
  const state = online ? agent?.state ?? 'idle' : 'offline';
  const tone: AgentTone = loading ? 'off' : agentTone(online, state);
  const busy = tone === 'busy';
  const { word, line } = statusWords(agent, online, loading, now, tone);
  const quiet = tone === 'off' || tone === 'paused';
  return (
    <button
      type="button"
      className={`agentpill agentpill--${tone} ${compact ? 'agentpill--compact' : ''} press`}
      onClick={onOpen}
      title={line}
      aria-label={`${line}. Open the agent page`}
    >
      <WolfTile mood={quiet ? 'music' : wolfForState(state)} size={compact ? 24 : 26} on={busy} dim={quiet} />
      <span className={`agentpill__dot sdot sdot--${tone}`} aria-hidden="true" />
      <span className="agentpill__word" aria-hidden="true">
        <Swap id={word}>
          <Shimmer tone="strong" active={busy}>
            {word}
          </Shimmer>
        </Swap>
      </span>
      {live === 'down' ? (
        <span className="agentpill__warn" title="Live updates paused, retrying" aria-hidden="true">
          !
        </span>
      ) : null}
    </button>
  );
}

/** A small aurora ring with "12/40" beside it, like Arena's solved count. */
export function RingPill({ done, total, label, onClick }: { done: number; total: number; label: string; onClick?: () => void }) {
  return (
    <button type="button" className="ringpill press" onClick={onClick} title={label} aria-label={label}>
      <ProgressRing value={total > 0 ? done / total : 0} size={22} />
      <span className="ringpill__text num">
        {done}
        <span className="ringpill__total">/{total}</span>
      </span>
    </button>
  );
}

/** Dry run fills forms and never sends. Off means Live: real applications go out, so a red Live tag appears. */
export function DryRunSwitch({ dryRun, onChange, compact = false }: { dryRun: boolean; onChange: (value: boolean) => void; compact?: boolean }) {
  return (
    <label className={`dryrun ${dryRun ? '' : 'is-live'} ${compact ? 'dryrun--compact' : ''}`} title={dryRun ? 'Dry run: fills forms, never sends' : 'Live: applications are sent. Turn on to stop sending.'}>
      <span className="dryrun__label">{dryRun ? 'Dry run' : 'Live'}</span>
      <input type="checkbox" role="switch" checked={dryRun} onChange={(e) => onChange(e.target.checked)} aria-label="Dry run" />
      <span className="switch switch--sm" aria-hidden="true">
        <span className="switch__thumb" />
      </span>
    </label>
  );
}
