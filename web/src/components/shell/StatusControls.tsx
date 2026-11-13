import { progressOf, stateLabel, timeAgo } from '../../lib/format';
import type { AgentRow } from '../../lib/types';
import type { AgentTone } from '../agent/live';

/** A short, friendly line for what the agent is doing: "Scoring jobs, 12 of 40". */
function busyLine(state: string, message: string): string {
  const p = progressOf(message);
  switch (state) {
    case 'scoring':
      return p ? `Scoring jobs, ${p.done} of ${p.total}` : 'Scoring new jobs';
    case 'applying':
      return p ? `Applying, ${p.done} of ${p.total}` : 'Filling a form';
    case 'searching':
      return 'Finding new postings';
    case 'reading':
      return 'Reading your resume';
    case 'writing':
      return p ? `Writing letters, ${p.done} of ${p.total}` : 'Writing letters';
    case 'starting':
      return 'Starting up';
    default:
      return message || stateLabel(state);
  }
}

/** One word for the agent's state, and a longer line for the card, tooltips and screen readers. */
export function statusWords(agent: AgentRow | null, online: boolean, loading: boolean, now: number, tone: AgentTone) {
  const state = online ? agent?.state ?? 'idle' : 'offline';
  if (loading) return { word: 'Connecting', line: 'Connecting to the agent' };
  if (!online) {
    const seen = agent?.last_seen ? timeAgo(agent.last_seen, now) : '';
    return { word: 'Offline', line: seen ? `Offline, last seen ${seen}` : 'Not started yet' };
  }
  if (tone === 'paused') return { word: 'Paused', line: 'Paused, it takes no new jobs' };
  if (tone === 'bad') return { word: 'Error', line: agent?.message || 'The agent hit an error' };
  if (tone === 'busy') return { word: stateLabel(state), line: busyLine(state, agent?.message ?? '') };
  return { word: 'Online', line: 'Online, waiting for jobs' };
}

/** Dry run fills forms and never sends (a sand tag). Off means Live: real applications go out (a rose tag). */
export function DryRunSwitch({ dryRun, onChange, compact = false }: { dryRun: boolean; onChange: (value: boolean) => void; compact?: boolean }) {
  return (
    <label
      className={`dryrun ${dryRun ? 'is-dry' : 'is-live'} ${compact ? 'dryrun--compact' : ''}`}
      title={dryRun ? 'Dry run: fills forms, never sends' : 'Live: applications are sent. Turn on to stop sending.'}
    >
      <span className="dryrun__text">
        <span className="dryrun__tag">{dryRun ? 'Dry run' : 'Live'}</span>
        <span className="dryrun__hint">{dryRun ? 'Fills forms, sends nothing' : 'Applications are sent'}</span>
      </span>
      <input type="checkbox" role="switch" checked={dryRun} onChange={(e) => onChange(e.target.checked)} aria-label="Dry run" />
      <span className="switch switch--sm" aria-hidden="true">
        <span className="switch__thumb" />
      </span>
    </label>
  );
}
