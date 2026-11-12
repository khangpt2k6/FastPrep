import { stateLabel } from '../../lib/format';
import { Swap } from '../motion';
import type { LiveStatus } from '../../lib/types';

export function AgentPill({ online, state, live, onClick }: { online: boolean; state: string; live: LiveStatus; onClick: () => void }) {
  return (
    <button type="button" className={`agentpill ${online ? 'is-on' : ''}`} onClick={onClick} title="Open the agent page">
      <span className="agentpill__dot" aria-hidden="true" />
      <Swap id={online ? 'on' : 'off'}>{online ? 'Agent online' : 'Agent offline'}</Swap>
      {online ? (
        <span className="agentpill__state">
          <Swap id={state}>{stateLabel(state)}</Swap>
        </span>
      ) : null}
      {live === 'down' ? <span className="agentpill__warn">reconnecting</span> : null}
    </button>
  );
}

export function DryRunSwitch({ dryRun, onChange }: { dryRun: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className={`dryrun ${dryRun ? '' : 'is-live'}`}>
      <input type="checkbox" role="switch" checked={dryRun} onChange={(e) => onChange(e.target.checked)} />
      <span className="switch" aria-hidden="true">
        <span className="switch__thumb" />
      </span>
      <span className="dryrun__text">
        <span className="dryrun__label">Dry run</span>
        <span className="dryrun__help">
          <Swap id={dryRun ? 'dry' : 'live'}>{dryRun ? 'fills the form but does not submit' : 'off: applications are really sent'}</Swap>
        </span>
      </span>
    </label>
  );
}
