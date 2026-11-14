import type { TagColor } from './format';
import { tampaFormat } from './time';

/** Named in supabase/schema.sql. Kept here, next to its only users, until it joins TABLES in supabase.ts. */
export const INBOX_TABLE = 'automation_inbox';

export type InboxStatus = 'applied' | 'assessment' | 'interview' | 'offer' | 'rejected' | 'withdrawn';

/** One mail about an application, as the agent read it: who, when, the subject and the readable start of it. */
export interface InboxMessage {
  at: string;
  /** Empty when the mail came from a third party with no name: show from_address then. */
  from_name: string;
  from_address: string;
  subject: string;
  /** Up to 600 characters, line breaks kept, the quoted reply left out. */
  snippet: string;
  /** What the mail meant for the application. */
  status: InboxStatus | string;
  /** A link to the mail in Gmail; '' when there is none. */
  gmail_url?: string;
}

/** One application as the inbox sync on the person's computer read it from their mail. */
export interface InboxRow {
  user_id: string;
  id: string;
  company: string;
  role: string;
  status: InboxStatus;
  applied_at: string;
  updated_at: string;
  /** The subject of the last mail about it. */
  subject: string;
  /** How many mails there are. */
  mails: number;
  /** True when the agent sent it; false when the person applied by hand. */
  by_agent: boolean;
  synced_at: string;
  /** The employer's own site, read from its senders; '' when unknown. */
  domain?: string;
  /** False when no receipt was found, so the applied date is a guess from the first mail. */
  applied_known?: boolean;
  /** The newest mail, for the list's preview line (the list does not load every mail). */
  latest?: InboxMessage | null;
  /** Every mail, newest first, at most 12: loaded for the opened application only. */
  messages?: InboxMessage[];
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
  return Number.isFinite(then) ? tampaFormat({ month: 'short', day: 'numeric' }).format(then) : '';
}

/** The newest mail of a row, from the list's preview column or the full thread when a live update brought it. */
export function latestOf(row: InboxRow): InboxMessage | null {
  if (row.latest && typeof row.latest === 'object') return row.latest;
  return Array.isArray(row.messages) && row.messages.length ? row.messages[0] : null;
}

/** "Recruiting at Stripe" or the address when the mail has no name. */
export const senderOf = (m: InboxMessage) => m.from_name?.trim() || m.from_address || 'Unknown sender';

/** A row as one line of text for the search box: company, role, subject, the latest sender and address. */
export function searchText(row: InboxRow): string {
  const m = latestOf(row);
  return `${row.company} ${row.role} ${row.subject} ${m ? `${m.from_name} ${m.from_address} ${m.subject}` : ''}`.toLowerCase();
}
