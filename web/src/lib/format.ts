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
  offline: 'Offline',
};

export function stateLabel(state: string): string {
  return STATE_LABEL[state as AgentState] ?? state;
}

export const APPLICATION_STATUSES = ['applying', 'submitted', 'unconfirmed', 'refused', 'blocked', 'failed'];

/** filled is a dry run that reached the send button and stopped there on purpose; stopped is any other stop. */
export type StatusTone = 'applying' | 'sent' | 'unconfirmed' | 'filled' | 'bad' | 'stopped';

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

/** The agent's one-word reason, in words for a card's meta line; empty when the status chip already says it. */
export function reasonWords(reason: string): string {
  const words: Record<string, string> = {
    sent_in_dry_run: 'sent during a dry run',
    no_credit: 'out of model credit',
    not_answering: 'AI service not answering',
    refused_by_form: 'the form refused it',
    form_not_loaded: 'form did not load',
    mailbox_signed_out: 'sign in to your mailbox',
    no_code: 'no code arrived by email',
  };
  return words[reason] ?? '';
}

/** Why a form was not sent, in words, from the agent's one-word reason. */
const STOP_REASONS: Record<string, string> = {
  missing_info: 'needs your info',
  captcha: 'captcha',
  login: 'needs a login',
  closed: 'posting closed',
  broken_page: 'page did not work',
  stuck: 'got stuck',
  never_clicked: 'send not clicked',
};

/** The status as a short label for a pill. A dry run never sends, so its result never reads as sent. */
export function statusInfo(job: Pick<JobRow, 'status' | 'dry_run'> & Partial<Pick<JobRow, 'reason'>>): { label: string; tone: StatusTone } {
  if (job.status === 'blocked') {
    // Only a dry run that reached the send button was filled; any other stop is a stop, dry run or not.
    if (job.reason === 'dry_run' || (job.dry_run && !job.reason)) return { label: 'Filled (dry run)', tone: 'filled' };
    const why = job.reason ? STOP_REASONS[job.reason] : undefined;
    return { label: why ? `Stopped: ${why}` : 'Stopped', tone: 'stopped' };
  }
  switch (job.status) {
    case 'applying':
      return { label: 'Applying', tone: 'applying' };
    case 'submitted':
      return { label: 'Sent', tone: 'sent' };
    case 'unconfirmed':
      return { label: 'Sent, unconfirmed', tone: 'unconfirmed' };
    case 'refused':
      return { label: 'Refused by form', tone: 'bad' };
    case 'failed':
      return { label: 'Failed', tone: 'bad' };
    default:
      return { label: job.status, tone: 'stopped' };
  }
}

/** What a status pill means, for its tooltip. */
export function statusHint(tone: StatusTone): string {
  switch (tone) {
    case 'filled':
      return 'Dry run: the form was filled and never sent';
    case 'sent':
      return 'Sent to the employer';
    case 'unconfirmed':
      return 'Sent, but no confirmation page was seen';
    case 'applying':
      return 'The agent is filling this form now';
    case 'bad':
      return 'Not sent';
    default:
      return 'Stopped before sending';
  }
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** Calm two-stop gradients for monogram tiles on a dark page: deep enough for a white letter, never neon. */
const MONOGRAMS: [string, string][] = [
  ['#155e52', '#1f7f6e'],
  ['#2e3a7a', '#4352a6'],
  ['#5a2f6b', '#7a4290'],
  ['#6e3b1c', '#94552c'],
  ['#1f4f75', '#2c6d9e'],
  ['#4a5a1f', '#66792d'],
  ['#6b2440', '#8f3459'],
  ['#2f4b56', '#426a79'],
];

export function monogramGradient(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  const [from, to] = MONOGRAMS[hash % MONOGRAMS.length];
  return `linear-gradient(135deg, ${from}, ${to})`;
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

/** "2024-08 → Present", with an arrow instead of a dash. */
export function monthRange(start: string, end: string): string {
  if (!start && !end) return '';
  return `${start || '?'} → ${end || '?'}`;
}
