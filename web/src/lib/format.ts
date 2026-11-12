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

export type StatusTone = 'applying' | 'sent' | 'unconfirmed' | 'bad' | 'stopped';

/** A company as people say it. Some sources give a Workday tenant path ("cisco/wd5/cisco_careers") or a careers host
 * ("careers.cisco.com"): the company's own name is taken from it. */
export function companyName(raw: string): string {
  const name = raw.trim();
  const tenant = /^([a-z0-9][a-z0-9_-]*)\/wd\d+\//i.exec(name);
  const host = /^(?:careers?|jobs|apply)\.([a-z0-9-]+)\.[a-z.]+$/i.exec(name);
  const word = tenant?.[1] ?? host?.[1];
  if (!word) return name;
  return word.replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
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
  missing_info: 'needs info from you',
  captcha: 'captcha',
  login: 'needs a login',
  closed: 'posting closed',
  broken_page: 'page did not work',
  stuck: 'got stuck',
  never_clicked: 'send button not clicked',
};

export function statusInfo(job: Pick<JobRow, 'status' | 'dry_run'> & Partial<Pick<JobRow, 'reason'>>): { label: string; tone: StatusTone } {
  if (job.status === 'blocked') {
    // Only a dry run that reached the send button was filled; any other stop is a stop, dry run or not.
    if (job.reason === 'dry_run' || (job.dry_run && !job.reason)) return { label: 'Filled, not sent (dry run)', tone: 'stopped' };
    const why = job.reason ? STOP_REASONS[job.reason] : undefined;
    return { label: why ? `Stopped: ${why}` : 'Stopped', tone: 'stopped' };
  }
  switch (job.status) {
    case 'applying':
      return { label: 'Applying...', tone: 'applying' };
    case 'submitted':
      return { label: 'Sent', tone: 'sent' };
    case 'unconfirmed':
      return { label: 'Sent (not confirmed)', tone: 'unconfirmed' };
    case 'refused':
      return { label: 'Refused by form', tone: 'bad' };
    case 'failed':
      return { label: 'Failed', tone: 'bad' };
    default:
      return { label: job.status, tone: 'stopped' };
  }
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** Soft background and strong foreground pairs for company initials. */
const AVATAR_COLORS: [string, string][] = [
  ['#E7F0FF', '#2457C5'],
  ['#F1E9FF', '#6B3FC4'],
  ['#FFEDE3', '#C2531B'],
  ['#E3F7F4', '#0E7C6B'],
  ['#FFE8F0', '#C02C66'],
  ['#EAF4E1', '#4A7A1B'],
  ['#FFF4D9', '#A36A00'],
  ['#E5F3FB', '#1C6E9C'],
];

export function avatarColors(name: string): { background: string; color: string } {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  const [background, color] = AVATAR_COLORS[hash % AVATAR_COLORS.length];
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

/** "2024-08 → Present", with an arrow instead of a dash. */
export function monthRange(start: string, end: string): string {
  if (!start && !end) return '';
  return `${start || '?'} → ${end || '?'}`;
}
