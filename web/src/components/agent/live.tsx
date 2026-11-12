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

/** Props for an earlier log line: it drops in at the top, older lines slide down. */
export const logItem = {
  initial: { opacity: 0, y: -8, filter: 'blur(3px)' },
  animate: { opacity: 1, y: 0, filter: 'blur(0px)', transition: { duration: DUR.slow, ease: EASE } },
  exit: { opacity: 0, transition: { duration: DUR.fast } },
  transition: { layout: SPRING },
};

/** States where the agent is doing work: the orb spins faster and its dots come out. */
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

/** The one line that changes every few seconds while the agent works. Each new line types itself in. */
export function LogLine({ agent, online, tone }: { agent: AgentRow | null; online: boolean; tone: AgentTone }) {
  const text = agent?.message || `${stateLabel(online ? agent?.state ?? 'idle' : 'offline')}.`;
  return (
    <p className={`logline ${tone === 'bad' ? 'logline--bad' : ''}`} aria-live="polite">
      <span className="logline__prompt" aria-hidden="true">
        &rsaquo;
      </span>
      <span className="logline__text typein" key={text}>
        {text}
        <span className="caret" aria-hidden="true" />
      </span>
    </p>
  );
}

/** The start command as a chip with a copy button: shown only while the agent is offline. */
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
    <span className="cmdchip" title="Run this on your computer to start the agent">
      <span className="cmdchip__prompt" aria-hidden="true">
        $
      </span>
      <code>{START_COMMAND}</code>
      <button type="button" className="icon-btn icon-btn--sm" onClick={copy} aria-label={copied ? 'Copied' : 'Copy the start command'} title={copied ? 'Copied' : 'Copy'}>
        {copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
      </button>
    </span>
  );
}

/** The job the agent is filling right now, with its logo. */
export function CurrentJob({ job }: { job: JobRow }) {
  const name = displayName(job);
  return (
    <p className="nowjob" title={`${name}: ${job.title}`}>
      <CompanyLogo name={name} domain={job.company_domain} size={24} />
      <span className="nowjob__name">{name}</span>
      <span className="nowjob__title">{job.title}</span>
    </p>
  );
}
