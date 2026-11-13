import type { AgentState, JobRow } from './types';

export const ONLINE_WINDOW_MS = 30_000;

export function isOnline(state: string | undefined, lastSeen: string | undefined, now: number): boolean {
  if (!state || !lastSeen || state === 'offline') return false;
  const seen = Date.parse(lastSeen);
  return Number.isFinite(seen) && now - seen < ONLINE_WINDOW_MS;
}

export function timeAgo(iso: string | undefined, now: number): string {
  if (!iso) return '';
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return '';
  const s = Math.max(0, Math.round((now - then) / 1000));
  if (s < 5) return 'just now';
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(then).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function clock(ms: number): string {
  return new Date(ms).toLocaleTimeString(undefined, { hour12: false });
}

/** How long until a time, as "2h 13m", "47m" or "under a minute"; '' when it is unknown or already past. */
export function untilText(iso: string | null | undefined, now: number): string {
  if (!iso) return '';
  const then = Date.parse(iso);
  if (!Number.isFinite(then) || then <= now) return '';
  const m = Math.floor((then - now) / 60000);
  if (m < 1) return 'under a minute';
  const h = Math.floor(m / 60);
  if (h === 0) return `${m}m`;
  if (h < 48) return m % 60 ? `${h}h ${m % 60}m` : `${h}h`;
  return `${Math.round(h / 24)}d`;
}

/** A job the agent found in the last day gets the New tag. */
export const NEW_WINDOW_MS = 24 * 60 * 60 * 1000;

export function isNewJob(job: Pick<JobRow, 'found_at'>, now: number): boolean {
  if (!job.found_at) return false;
  const found = Date.parse(job.found_at);
  return Number.isFinite(found) && now - found < NEW_WINDOW_MS && now - found > -60_000;
}

export const STATE_LABEL: Record<AgentState, string> = {
  idle: 'Idle',
  starting: 'Starting',
  reading: 'Reading resume',
  searching: 'Searching',
  scoring: 'Scoring',
  ready: 'Ready',
  applying: 'Applying',
  writing: 'Writing letters',
  applied: 'Applied',
  error: 'Error',
  paused: 'Paused',
  offline: 'Offline',
};

export function stateLabel(state: string): string {
  return STATE_LABEL[state as AgentState] ?? state;
}

/** States where the agent works through a queue, with the top progress bar on. */
export const WORKING_STATES = ['searching', 'scoring', 'applying', 'writing', 'reading'];

/** "12/40" or "12 of 40" in a log line, as numbers. */
export function progressOf(message: string): { done: number; total: number } | null {
  const hit = /(\d+)\s*(?:\/|of)\s*(\d+)/.exec(message ?? '');
  if (!hit) return null;
  const done = Number(hit[1]);
  const total = Number(hit[2]);
  return total > 0 && done <= total ? { done, total } : null;
}

/** Short lines that rotate while the agent works on something long. */
export function waitingLines(state: string, message = ''): string[] {
  const p = progressOf(message);
  switch (state) {
    case 'scoring':
      return [p ? `Reading job ${p.done} of ${p.total}` : 'Reading the new postings', 'Comparing them with your resume', 'Finding roles you fit'];
    case 'searching':
      return ['Picking places to search', 'Checking company career sites', 'Finding roles you fit'];
    case 'reading':
      return ['Reading your experience', 'Picking out your skills', 'Finding roles you fit', 'Picking places to search'];
    case 'writing':
      return ['Writing letters', 'Matching your experience to the role', 'Checking the tone'];
    case 'applying':
      return [p ? `Form ${p.done} of ${p.total}` : 'Filling the form', 'Answering the questions', 'Checking required fields'];
    case 'starting':
      return ['Starting up', 'Opening the browser'];
    default:
      return [];
  }
}

/** A file size as people read it: "182 KB", "1.4 MB". */
export function fileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const APPLICATION_STATUSES = ['applying', 'submitted', 'unconfirmed', 'refused', 'blocked', 'failed'];

/** filled is a dry run that reached the send button and stopped there on purpose; stopped is any other stop. */
export type StatusTone = 'applying' | 'sent' | 'unconfirmed' | 'filled' | 'bad' | 'stopped' | 'none';

/** Notion-style tag colours. */
export type TagColor = 'gray' | 'brown' | 'orange' | 'yellow' | 'green' | 'blue' | 'purple' | 'red';

/** The tag colour for each status: sent green, filled yellow, applying blue, unconfirmed purple, stopped orange,
 * failed or refused red, anything else gray. */
export const STATUS_COLOR: Record<StatusTone, TagColor> = {
  sent: 'green',
  filled: 'yellow',
  applying: 'blue',
  unconfirmed: 'purple',
  stopped: 'orange',
  bad: 'red',
  none: 'gray',
};

/** A company as people say it. Some sources give a Workday tenant path ("cisco/wd5/cisco_careers") or a careers host
 * ("careers.cisco.com"): the company's own name is taken from it. */
export function companyName(raw: string): string {
  const name = (raw ?? '').trim();
  const tenant = /^([a-z0-9][a-z0-9_-]*)\/wd\d+\//i.exec(name);
  const host = /^(?:careers?|jobs|apply)\.([a-z0-9-]+)\.[a-z.]+$/i.exec(name);
  const word = tenant?.[1] ?? host?.[1];
  if (!word) return name;
  return word.replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/** The name shown for a job's company everywhere: the agent's clean name, else one taken from the raw source name. */
export function displayName(job: Pick<JobRow, 'company'> & Partial<Pick<JobRow, 'company_name'>>): string {
  return job.company_name || companyName(job.company);
}

/** The company's domain, or '' when the agent has not filled one in or it does not look like a domain. */
export function logoDomain(domain: string | undefined): string {
  const host = (domain ?? '')
    .trim()
    .toLowerCase()
    .replace(/^[a-z]+:\/\//, '')
    .replace(/[/?#].*$/, '')
    .replace(/^www\./, '');
  return /^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/.test(host) ? host : '';
}

/** The first place a posting names and how many more it lists: postings join places with ";". */
export function firstLocation(location: string): { first: string; more: number } {
  const places = (location ?? '')
    .split(/\s*[;|\n]\s*/)
    .map((p) => p.trim())
    .filter(Boolean);
  return { first: places[0] ?? '', more: Math.max(0, places.length - 1) };
}

/** The agent's one-word reason, as a short note for a row; empty when the status tag already says it. */
export function reasonWords(reason: string): string {
  const words: Record<string, string> = {
    sent_in_dry_run: 'Sent during a dry run',
    no_credit: 'Out of model credit',
    not_answering: 'AI service not responding',
    refused_by_form: 'Refused by the form',
    form_not_loaded: 'Form did not load',
    mailbox_signed_out: 'Mailbox signed out',
    no_code: 'No email code received',
  };
  return words[reason] ?? '';
}

/** Why a form was not sent, from the agent's one-word reason. missing_info reads as "Needs info"; the rest are blocks. */
const STOP_REASONS: Record<string, string> = {
  missing_info: 'Needs info from you',
  captcha: 'Captcha',
  login: 'Login required',
  closed: 'Posting closed',
  broken_page: 'Page did not work',
  stuck: 'Agent got stuck',
  never_clicked: 'Send button not clicked',
};

export interface StatusInfo {
  label: string;
  tone: StatusTone;
  /** What the tag means, for its tooltip. */
  hint: string;
}

/** The status as a short tag. A dry run never sends, so its result never reads as sent. */
export function statusInfo(job: Pick<JobRow, 'status' | 'dry_run'> & Partial<Pick<JobRow, 'reason'>>): StatusInfo {
  if (job.status === 'blocked') {
    // Only a dry run that reached the send button was filled; any other stop is a stop, dry run or not.
    if (job.reason === 'dry_run' || (job.dry_run && !job.reason)) return { label: 'Filled (dry run)', tone: 'filled', hint: 'Form filled, not sent' };
    if (job.reason === 'missing_info') return { label: 'Needs info', tone: 'stopped', hint: STOP_REASONS.missing_info };
    const why = job.reason ? STOP_REASONS[job.reason] : undefined;
    return { label: 'Blocked', tone: 'stopped', hint: why ?? 'Stopped before sending' };
  }
  switch (job.status) {
    case 'applying':
      return { label: 'Applying', tone: 'applying', hint: 'Filling the form now' };
    case 'submitted':
      return { label: 'Sent', tone: 'sent', hint: 'Sent to the employer' };
    case 'unconfirmed':
      return { label: 'Sent, unconfirmed', tone: 'unconfirmed', hint: 'Sent, no confirmation page seen' };
    case 'refused':
      return { label: 'Refused', tone: 'bad', hint: 'Refused by the form' };
    case 'failed':
      return { label: 'Failed', tone: 'bad', hint: 'Failed before sending' };
    default:
      return { label: 'Not tried', tone: 'none', hint: job.status };
  }
}

/** The reason a blocked form stopped, for the row's note; empty when the tag says enough. */
export function stopReason(job: Pick<JobRow, 'status' | 'dry_run'> & Partial<Pick<JobRow, 'reason'>>): string {
  if (job.status !== 'blocked' || !job.reason || job.reason === 'dry_run' || job.reason === 'missing_info') return '';
  return STOP_REASONS[job.reason] ?? '';
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** Pastel tag pairs for monogram tiles, as background and letter colour. */
const MONOGRAMS: [string, string][] = [
  ['#f1f1ef', '#787774'],
  ['#f4eeee', '#976d57'],
  ['#faebdd', '#b85d09'],
  ['#fbf3db', '#9f7116'],
  ['#edf3ec', '#448361'],
  ['#e7f3f8', '#337ea9'],
  ['#f6f3f9', '#9065b0'],
  ['#fdebec', '#d44c47'],
];

/** A monogram's colours, picked by hashing the name so a company keeps its colour. */
export function monogramColors(name: string): { background: string; color: string } {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  const [background, color] = MONOGRAMS[hash % MONOGRAMS.length];
  return { background, color };
}

export function initialOf(name: string): string {
  const match = name.trim().match(/[A-Za-z0-9]/);
  return match ? match[0].toUpperCase() : '?';
}

export type MatchTone = 'strong' | 'good' | 'fair' | 'low';

export function matchInfo(score: number): { label: string; tone: MatchTone } {
  if (score >= 4) return { label: 'Strong match', tone: 'strong' };
  if (score >= 3) return { label: 'Good match', tone: 'good' };
  if (score >= 2) return { label: 'Fair match', tone: 'fair' };
  return { label: 'Low match', tone: 'low' };
}

/** A score's tag colour: 4.5 and up green, 4.0 to 4.4 blue, below 4 gray. */
export function scoreColor(score: number): TagColor {
  if (score >= 4.5) return 'green';
  if (score >= 4) return 'blue';
  return 'gray';
}
/** "2024-08 → Present", with an arrow instead of a dash. */
export function monthRange(start: string, end: string): string {
  if (!start && !end) return '';
  return `${start || '?'} → ${end || '?'}`;
}
