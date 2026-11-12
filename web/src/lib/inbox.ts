import type { TagColor } from './format';

/** Named in supabase/schema.sql. Kept here, next to its only users, until it joins TABLES in supabase.ts. */
export const INBOX_TABLE = 'automation_inbox';

export type InboxStatus = 'applied' | 'assessment' | 'interview' | 'offer' | 'rejected' | 'withdrawn';

/** One application as the inbox sync on the person's computer read it from their mail. */
export interface InboxRow {
  user_id: string;
  id: string;
  company: string;
  role: string;
  status: InboxStatus;
  applied_at: string;
  updated_at: string;
  /** The subject of the last mail about it. No message text is kept. */
  subject: string;
  mails: number;
  /** True when the agent sent it; false when the person applied by hand. */
  by_agent: boolean;
  synced_at: string;
}

/** The order of the page: what needs the person first. */
export const INBOX_STATUSES: { status: InboxStatus; label: string; many: string; color: TagColor }[] = [
  { status: 'offer', label: 'Offer', many: 'Offers', color: 'green' },
  { status: 'interview', label: 'Interview', many: 'Interviews', color: 'blue' },
  { status: 'assessment', label: 'Assessment', many: 'Assessments', color: 'yellow' },
  { status: 'applied', label: 'Applied', many: 'Applied', color: 'gray' },
  { status: 'rejected', label: 'Rejected', many: 'Rejected', color: 'red' },
  { status: 'withdrawn', label: 'Withdrawn', many: 'Withdrawn', color: 'brown' },
];

const KNOWN = new Map(INBOX_STATUSES.map((entry, index) => [entry.status, { ...entry, index }]));

/** A status the page does not know yet (a newer agent) is shown in its own words, gray, last. */
export function statusOf(status: string): { label: string; color: TagColor; index: number } {
  return KNOWN.get(status as InboxStatus) ?? { label: status || 'Unknown', color: 'gray', index: INBOX_STATUSES.length };
}

/** Open ones that need the person first, then the rest, each group newest mail first. */
export function sortInbox(rows: InboxRow[]): InboxRow[] {
  return [...rows].sort((a, b) => statusOf(a.status).index - statusOf(b.status).index || b.updated_at.localeCompare(a.updated_at));
}

export function dayOf(iso: string): string {
  const then = Date.parse(iso);
  return Number.isFinite(then) ? new Date(then).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '';
}
