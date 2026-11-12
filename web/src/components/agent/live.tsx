import { useEffect, useState } from 'react';
import { DUR, EASE, SPRING } from '../../lib/motion';
import type { AgentRow } from '../../lib/types';
import { stateLabel } from '../../lib/format';
import { IconCheck, IconCopy } from '../Icons';

export interface LogEntry {
  at: number;
  state: string;
  message: string;
}

/** Props for an earlier log line: it drops in at the top, older lines slide down. */
export const logItem = {
  initial: { opacity: 0, y: -8, filter: 'blur(3px)' },
  animate: { opacity: 1, y: 0, filter: 'blur(0px)', transition: { duration: DUR.slow, ease: EASE } },
  exit: { opacity: 0, transition: { duration: DUR.fast } },
  transition: { layout: SPRING },
};

export const BUSY_STATES = ['starting', 'reading', 'searching', 'scoring', 'applying'];
export const START_COMMAND = 'agent-automation';

export type AgentTone = 'off' | 'bad' | 'busy' | 'calm';

export function agentTone(online: boolean, state: string): AgentTone {
  if (!online) return 'off';
  if (state === 'error') return 'bad';
  return BUSY_STATES.includes(state) ? 'busy' : 'calm';
}

/** Remembers the last few log lines seen while this page is open. */
export function useLogTail(agent: AgentRow | null, keep = 6): LogEntry[] {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const message = agent?.message ?? '';
  const state = agent?.state ?? '';
  useEffect(() => {
    if (!message) return;
    setEntries((list) => {
      const last = list[list.length - 1];
      if (last && last.message === message && last.state === state) return list;
      return [...list, { at: Date.now(), state, message }].slice(-keep);
    });
  }, [message, state, keep]);
  return entries;
}

export function Beacon({ tone, size = 'md' }: { tone: AgentTone; size?: 'sm' | 'md' | 'lg' }) {
  return (
    <span className={`beacon beacon--${size} beacon--${tone}`} aria-hidden="true">
      <span className="beacon__ring" />
      <span className="beacon__ring beacon__ring--late" />
      <span className="beacon__core" />
    </span>
  );
}

/** The one line that changes every few seconds while the agent works. */
export function LogLine({ agent, online, tone }: { agent: AgentRow | null; online: boolean; tone: AgentTone }) {
  const text = agent?.message || `${stateLabel(online ? agent?.state ?? 'idle' : 'offline')}.`;
  return (
    <p className={`logline ${tone === 'bad' ? 'logline--bad' : ''}`} aria-live="polite" key={text}>
      <span className="logline__prompt" aria-hidden="true">
        &rsaquo;
      </span>
      <span className="logline__text">
        {text}
        <span className="caret" aria-hidden="true" />
      </span>
    </p>
  );
}

export function StartHint() {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(START_COMMAND);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }
  return (
    <div className="starthint">
      <span>Start the agent on your computer:</span>
      <span className="starthint__cmd">
        <code>{START_COMMAND}</code>
        <button type="button" className="icon-btn icon-btn--sm" onClick={copy} aria-label="Copy the start command">
          {copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
        </button>
      </span>
    </div>
  );
}
