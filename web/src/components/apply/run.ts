import { displayName, statusInfo, type StatusInfo } from '../../lib/format';
import type { AgentRow, CommandRow, JobRow } from '../../lib/types';

/** Where one job of an apply run stands. */
export type Phase = 'queued' | 'active' | 'done' | 'skipped';

export interface RunJob {
  id: string;
  number: number;
  company: string;
  domain: string;
  title: string;
  phase: Phase;
  /** The result once done. */
  info: StatusInfo | null;
  /** The form's note, or the step under way. */
  note: string;
  job: JobRow | null;
}

export interface Run {
  jobs: RunJob[];
  total: number;
  finished: number;
  active: RunJob | null;
  /** 0 to 1, a job under way counting half. */
  progress: number;
  state: 'waiting' | 'running' | 'done' | 'stopped';
  /** Why the run stopped early (cancelled, paused, budget), from the command. */
  stopped: string;
  sent: number;
  filled: number;
  problems: number;
}

const TERMINAL = new Set(['submitted', 'unconfirmed', 'refused', 'blocked', 'failed']);
// The agent's clock and the database's can differ a little: a job written up to this long before the command counts.
const SKEW_MS = 30_000;

const TOOL_WORDS: Record<string, string> = {
  browser_navigate: 'Opening the page',
  browser_navigate_back: 'Going back',
  browser_click: 'Clicking',
  browser_type: 'Typing an answer',
  browser_fill_form: 'Filling fields',
  browser_select_option: 'Choosing an option',
  browser_file_upload: 'Uploading the resume',
  browser_snapshot: 'Reading the page',
  browser_take_screenshot: 'Looking at the page',
  browser_wait_for: 'Waiting for the page',
  browser_evaluate: 'Checking the page',
  browser_press_key: 'Pressing a key',
  browser_hover: 'Pointing at a field',
  browser_tabs: 'Switching tabs',
  browser_handle_dialog: 'Closing a popup',
  finish_form: 'Reviewing the form',
};

/** The agent's progress line as a short step: "Claude Code: browser_click" reads "Clicking". */
export function stepWords(line: string): string {
  const text = line.replace(/\s*\(dry run, nothing is sent\)\s*$/, '').trim();
  const tool = /(?:^|:\s|->\s)(browser_[a-z_]+|finish_form)\b/.exec(text)?.[1];
  if (tool) return TOOL_WORDS[tool] ?? 'Working on the form';
  if (/^cover letter ready/i.test(text)) return 'Cover letter ready';
  if (/^typing a long answer/i.test(text)) return 'Typing a long answer';
  if (/waiting \d+ seconds/i.test(text)) return text.replace(/^The AI service /, 'Model ');
  if (/^Getting the browser/i.test(text)) return 'Getting the browser ready';
  if (text.startsWith('<-') || text.startsWith('==')) return '';
  return text.length > 90 ? `${text.slice(0, 87)}...` : text;
}

/** The step the agent says it is on for job `number` of `total`, or ''. */
function stepFor(agent: AgentRow | null, number: number, total: number, job: JobRow | null): string {
  if (!agent || agent.state !== 'applying') return '';
  const message = agent.message ?? '';
  const prefix = `${number}/${total} `;
  if (!message.startsWith(prefix)) return '';
  const label = job ? `${prefix}${job.company}: ${job.title}` : '';
  const rest = label && message.startsWith(label) ? message.slice(label.length) : message.slice(prefix.length);
  const step = rest.replace(/^:\s*/, '');
  if (!step || /^\(dry run/.test(step)) return 'Opening the form';
  return stepWords(step);
}

export function readRun(command: CommandRow, rows: JobRow[], agent: AgentRow | null): Run {
  const started = Date.parse(command.created_at) - SKEW_MS;
  const over = command.status === 'done' || command.status === 'failed';
  const byId = new Map(rows.map((j) => [j.id, j]));
  const total = command.job_ids.length;
  const jobs: RunJob[] = command.job_ids.map((id, i) => {
    const job = byId.get(id) ?? null;
    const fresh = job ? Date.parse(job.updated_at) >= started : false;
    let phase: Phase = 'queued';
    if (job && fresh && TERMINAL.has(job.status)) phase = 'done';
    else if (job && fresh && job.status === 'applying' && !over) phase = 'active';
    else if (over) phase = 'skipped';
    const info = phase === 'done' && job ? statusInfo(job) : null;
    const note = phase === 'active' ? stepFor(agent, i + 1, total, job) || 'Opening the form' : phase === 'done' ? (job?.note ?? '') : '';
    return {
      id,
      number: i + 1,
      company: job ? displayName(job) : 'Job',
      domain: job?.company_domain ?? '',
      title: job?.title ?? id,
      phase,
      info,
      note,
      job,
    };
  });
  const finished = jobs.filter((j) => j.phase === 'done').length;
  const active = jobs.find((j) => j.phase === 'active') ?? null;
  const tones = jobs.map((j) => j.info?.tone);
  const stopped = command.status === 'failed' ? command.error || 'Stopped' : '';
  return {
    jobs,
    total,
    finished,
    active,
    progress: total ? Math.min(1, (finished + (active ? 0.5 : 0) + (over ? jobs.filter((j) => j.phase === 'skipped').length : 0)) / total) : 0,
    state: command.status === 'pending' ? 'waiting' : command.status === 'running' ? 'running' : stopped ? 'stopped' : 'done',
    stopped,
    sent: tones.filter((t) => t === 'sent' || t === 'unconfirmed').length,
    filled: tones.filter((t) => t === 'filled').length,
    problems: tones.filter((t) => t === 'bad' || t === 'stopped').length,
  };
}

/** "1m 05s" since the run was asked for. */
export function elapsed(fromIso: string, now: number): string {
  const s = Math.max(0, Math.round((now - Date.parse(fromIso)) / 1000));
  if (!Number.isFinite(s)) return '';
  const m = Math.floor(s / 60);
  return m ? `${m}m ${String(s % 60).padStart(2, '0')}s` : `${s}s`;
}
