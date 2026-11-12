import { useEffect, useState } from 'react';
import { DUR, EASE, SPRING } from '../../lib/motion';
import type { AgentRow, JobRow } from '../../lib/types';
import { displayName, stateLabel } from '../../lib/format';
import { CompanyLogo } from '../CompanyLogo';
import { IconCheck, IconCopy } from '../Icons';

export interface LogEntry {
  at: number;
  state: string;
  message: string;
}

/** Props for an earlier log line: it fades in at the top, older lines slide down. */
export const logItem = {
  initial: { opacity: 0, y: -4 },
  animate: { opacity: 1, y: 0, transition: { duration: DUR.slow, ease: EASE } },
  exit: { opacity: 0, transition: { duration: DUR.fast } },
  transition: { layout: SPRING },
};

/** States where the agent is doing work: its status dot turns blue and pulses. */
export const BUSY_STATES = ['starting', 'reading', 'searching', 'scoring', 'applying', 'writing'];
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

/** The agent's current log line. */
export function LogLine({ agent, online, tone }: { agent: AgentRow | null; online: boolean; tone: AgentTone }) {
  const text = agent?.message || `${stateLabel(online ? agent?.state ?? 'idle' : 'offline')}.`;
  return (
    <p className={`logline code ${tone === 'bad' ? 'logline--bad' : ''}`} aria-live="polite">
      <span className="logline__prompt" aria-hidden="true">
        &rsaquo;
      </span>
      <span className="logline__text">{text}</span>
    </p>
  );
}

/** The start command as a code chip with a copy button. */
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
    <span className="cmdchip">
      <code className="code">{START_COMMAND}</code>
      <button type="button" className="icon-btn icon-btn--sm" onClick={copy} aria-label={copied ? 'Copied' : 'Copy command'} title={copied ? 'Copied' : 'Copy'}>
        {copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
      </button>
    </span>
  );
}

/** The job the agent is filling right now, with its logo. */
export function CurrentJob({ job }: { job: JobRow }) {
  const name = displayName(job);
  return (
    <span className="nowjob" title={`${name}: ${job.title}`}>
      <CompanyLogo name={name} domain={job.company_domain} size={20} />
      <span className="nowjob__name">{name}</span>
      <span className="nowjob__title">{job.title}</span>
    </span>
  );
}
